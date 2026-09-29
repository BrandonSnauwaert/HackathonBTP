import { z } from "zod";
import type { VatRateBp } from "../domain/quote-totals.js";
import { UNITS, type Unit } from "../domain/units.js";
import { LlmError, parseJsonResponse, type ChatMessage, type LlmClient } from "./llm-client.js";

/** Ligne de devis extraite d'une dictée. Jamais de prix : c'est l'artisan qui chiffre. */
export interface ExtractedLine {
  description: string;
  room: string;
  quantity: number;
  unit: Unit;
  vatRateBp: VatRateBp;
}

export interface ExtractionInput {
  transcript: string;
  /** Lignes déjà présentes dans le devis, pour éviter les doublons. */
  existingLines: readonly { description: string; room: string; quantity: number; unit: Unit }[];
}

export interface ExtractionResult {
  lines: ExtractedLine[];
  /** Informations manquantes pour chiffrer, en phrases courtes (affichées à l'artisan). */
  warnings: string[];
}

export interface LineExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

// --- Normalisation des réponses du LLM (tolérante : unités et TVA écrites de plusieurs façons)

const UNIT_ALIASES: Record<string, Unit> = {
  "m²": "m2", m2: "m2", "mètre carré": "m2", "mètres carrés": "m2", "metre carre": "m2", "metres carres": "m2",
  ml: "ml", "m.l.": "ml", "mètre linéaire": "ml", "mètres linéaires": "ml", m: "ml", "mètre": "ml", "mètres": "ml",
  "m³": "m3", m3: "m3", "mètre cube": "m3", "mètres cubes": "m3",
  u: "u", "unité": "u", "unités": "u", "pièce": "u", "pièces": "u", pce: "u", un: "u",
  h: "h", heure: "h", heures: "h",
  jour: "jour", jours: "jour", j: "jour",
  forfait: "forfait", ft: "forfait", fft: "forfait",
  kg: "kg", kilo: "kg", kilos: "kg",
  l: "l", litre: "l", litres: "l",
  ens: "ens", ensemble: "ens",
};

export function normalizeUnit(value: string): Unit {
  const key = value.trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(key)) return key as Unit;
  return UNIT_ALIASES[key] ?? "u";
}

/** 10, "10", "10 %", 0.1, "5,5", 5.5, 1000 → points de base autorisés ; 10 % par défaut. */
export function normalizeVatRate(value: unknown): VatRateBp {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.replace("%", "").replace(",", ".").trim()) : NaN;
  if (!Number.isFinite(number)) return 1000;
  const percent = number > 0 && number < 1 ? number * 100 : number >= 100 ? number / 100 : number;
  if (Math.abs(percent - 20) < 0.01) return 2000;
  if (Math.abs(percent - 10) < 0.01) return 1000;
  if (Math.abs(percent - 5.5) < 0.01) return 550;
  if (percent === 0) return 0;
  return 1000;
}

const LlmLineSchema = z.object({
  description: z.string().trim().min(1),
  room: z.string().nullish().transform((v) => v?.trim() ?? ""),
  quantity: z.union([z.number(), z.string()]).nullish().transform((v) => {
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1;
  }),
  unit: z.string().nullish().transform((v) => normalizeUnit(v ?? "u")),
  vatRate: z.unknown().transform(normalizeVatRate),
});

const LlmResponseSchema = z.object({
  lines: z.array(LlmLineSchema).default([]),
  missing: z.array(z.string()).default([]),
});

/** Schéma JSON envoyé au serveur quand LLM_JSON_MODE=json_schema. */
const RESPONSE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          room: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: [...UNITS] },
          vatRate: { type: "number", enum: [20, 10, 5.5] },
        },
        required: ["description", "room", "quantity", "unit", "vatRate"],
      },
    },
    missing: { type: "array", items: { type: "string" } },
  },
  required: ["lines", "missing"],
};

export const SYSTEM_PROMPT = `Tu es l'assistant d'un artisan du BTP en France. Sur le chantier, l'artisan dicte les travaux à prévoir pour un devis. À partir de la transcription de sa dictée (reconnaissance vocale, donc parfois imparfaite), tu extrais les lignes du devis.

Règles :
- Une ligne = une prestation ou une fourniture distincte. Découpe les phrases qui en contiennent plusieurs.
- description : formulation professionnelle et concise, comme sur un devis (ex. « Fourniture et pose d'une porte intérieure »). Corrige les erreurs évidentes de transcription.
- room : pièce ou zone concernée si elle est dite (« Cuisine », « Salle de bain »…), sinon "".
- quantity et unit : reprends les quantités dictées. Unités possibles : u (unité), m2, ml (mètre linéaire), m3, h, jour, forfait, kg, l, ens (ensemble). Sans quantité dite : 1, avec l'unité la plus logique (u pour un élément, forfait pour une prestation globale).
- vatRate : taux de TVA suggéré, 10 pour des travaux de rénovation ou d'entretien dans un logement de plus de 2 ans, 5.5 pour de la rénovation énergétique (isolation, pompe à chaleur, fenêtres performantes…), 20 pour du neuf ou un local professionnel. En cas de doute pour un logement : 10.
- Ne donne JAMAIS de prix : ils sont fixés par l'artisan.
- Ignore ce qui n'est pas une prestation (salutations, bavardage, éléments conservés en l'état).
- Ne reprends pas les lignes déjà présentes dans le devis (fournies pour contexte).
- missing : informations manquantes pour chiffrer (surface, longueur, dimensions, matériau, gamme…), en phrases courtes. Liste vide si rien ne manque.

Réponds uniquement avec un objet JSON, sans texte autour :
{"lines":[{"description":"...","room":"...","quantity":1,"unit":"u","vatRate":10}],"missing":["..."]}`;

export function buildUserPrompt(input: ExtractionInput): string {
  const existing =
    input.existingLines.length === 0
      ? "(aucune)"
      : input.existingLines
          .map((l) => `- ${l.room ? `[${l.room}] ` : ""}${l.description} (${l.quantity} ${l.unit})`)
          .join("\n");
  return `Lignes déjà présentes dans le devis :\n${existing}\n\nTranscription de la dictée :\n"""\n${input.transcript}\n"""`;
}

function toResult(parsed: z.infer<typeof LlmResponseSchema>): ExtractionResult {
  return {
    lines: parsed.lines.map((l) => ({
      description: l.description,
      room: l.room,
      quantity: l.quantity,
      unit: l.unit,
      vatRateBp: l.vatRate,
    })),
    warnings: parsed.missing.map((m) => m.trim()).filter((m) => m.length > 0),
  };
}

/** Extraction par LLM, avec une seconde tentative si la réponse n'est pas exploitable. */
export function createLlmLineExtractor(llm: LlmClient): LineExtractor {
  return {
    async extract(input) {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ];
      const json = { name: "quote_lines", schema: RESPONSE_JSON_SCHEMA };

      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await llm.complete(messages, { json });
        try {
          return toResult(LlmResponseSchema.parse(parseJsonResponse(text)));
        } catch (err) {
          lastError = err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : String(err);
          messages.push(
            { role: "assistant", content: text },
            { role: "user", content: `Réponse invalide (${lastError}). Réponds uniquement avec le JSON demandé.` },
          );
        }
      }
      throw new LlmError(`Réponse du LLM inexploitable : ${lastError}`);
    },
  };
}

// --- Extracteur simulé (LLM_PROVIDER=mock) : pour développer et tester sans LLM.

const ROOMS = ["cuisine", "salle de bain", "salle d'eau", "salon", "séjour", "chambre", "couloir", "entrée", "wc", "toilettes", "combles", "garage", "cave", "bureau", "terrasse"];

/** Une ligne par phrase d'au moins 4 mots, avec pièce et quantité repérées par mots-clés. */
export const mockLineExtractor: LineExtractor = {
  async extract({ transcript }) {
    const lines = transcript
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim().replace(/[.?!,;]+$/, ""))
      .filter((s) => s.split(/\s+/).length >= 4)
      .map((sentence): ExtractedLine => {
        const lower = sentence.toLowerCase();
        const measure = /(\d+(?:[.,]\d+)?)\s*(m²|m2|mètres? carrés?|ml|mètres? linéaires?)/.exec(lower);
        const room = ROOMS.find((r) => lower.includes(r)) ?? "";
        return {
          description: sentence.charAt(0).toUpperCase() + sentence.slice(1),
          room: room ? room.charAt(0).toUpperCase() + room.slice(1) : "",
          quantity: measure?.[1] ? Number(measure[1].replace(",", ".")) : 1,
          unit: measure?.[2] ? normalizeUnit(measure[2]) : "u",
          vatRateBp: 1000,
        };
      });
    return { lines, warnings: ["Extraction simulée (LLM_PROVIDER=mock) : configurer un LLM pour un vrai résultat"] };
  },
};
