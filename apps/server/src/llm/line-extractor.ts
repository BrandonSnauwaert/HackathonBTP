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
  /** dictation (défaut) : l'artisan dicte ; passive : conversation de la visite, enregistrée en continu. */
  kind?: "dictation" | "passive";
  /** Lignes déjà présentes dans le devis : pour éviter les doublons, et pour les modifier ou les supprimer à la demande. */
  existingLines: readonly ExistingLine[];
}

export interface ExistingLine {
  id: string;
  description: string;
  room: string;
  quantity: number;
  unit: Unit;
  vatRateBp: number;
}

/** Modification d'une ligne existante demandée dans la dictée (champs changés seulement). */
export interface LineUpdate {
  lineId: string;
  changes: Partial<ExtractedLine>;
}

export interface ExtractionResult {
  /** Nouvelles lignes, ajoutées en fin de devis. */
  lines: ExtractedLine[];
  updates: LineUpdate[];
  /** Identifiants des lignes existantes à supprimer. */
  deletions: string[];
  /** Informations manquantes pour chiffrer, en phrases courtes (affichées à l'artisan). */
  warnings: string[];
}

export interface LineExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

// --- Normalisation des réponses du LLM (tolérante : unités et TVA écrites de plusieurs façons)

const UNIT_ALIASES: Record<string, Unit> = {
  "m²": "m2",
  m2: "m2",
  "mètre carré": "m2",
  "mètres carrés": "m2",
  "metre carre": "m2",
  "metres carres": "m2",
  ml: "ml",
  "m.l.": "ml",
  "mètre linéaire": "ml",
  "mètres linéaires": "ml",
  m: "ml",
  mètre: "ml",
  mètres: "ml",
  "m³": "m3",
  m3: "m3",
  "mètre cube": "m3",
  "mètres cubes": "m3",
  u: "u",
  unité: "u",
  unités: "u",
  pièce: "u",
  pièces: "u",
  pce: "u",
  un: "u",
  h: "h",
  heure: "h",
  heures: "h",
  jour: "jour",
  jours: "jour",
  j: "jour",
  forfait: "forfait",
  ft: "forfait",
  fft: "forfait",
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  l: "l",
  litre: "l",
  litres: "l",
  ens: "ens",
  ensemble: "ens",
};

export function normalizeUnit(value: string): Unit {
  const key = value.trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(key)) return key as Unit;
  return UNIT_ALIASES[key] ?? "u";
}

/** 10, "10", "10 %", 0.1, "5,5", 5.5, 1000 → points de base autorisés ; 10 % par défaut. */
export function normalizeVatRate(value: unknown): VatRateBp {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace("%", "").replace(",", ".").trim())
        : NaN;
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
  room: z
    .string()
    .nullish()
    .transform((v) => v?.trim() ?? ""),
  quantity: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => {
      const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
      return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1;
    }),
  unit: z
    .string()
    .nullish()
    .transform((v) => normalizeUnit(v ?? "u")),
  vatRate: z.unknown().transform(normalizeVatRate),
});

/** Modification : référence de la ligne (« L2 ») et seulement les champs qui changent. */
const LlmUpdateSchema = z.object({
  ref: z.string().trim(),
  description: z.string().trim().nullish(),
  room: z.string().trim().nullish(),
  quantity: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => {
      const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
      return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
    }),
  unit: z.string().nullish(),
  vatRate: z.unknown().optional(),
});

const LlmResponseSchema = z.object({
  lines: z.array(LlmLineSchema).default([]),
  updates: z.array(LlmUpdateSchema).nullish(),
  deletions: z.array(z.string().trim()).nullish(),
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
    updates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          description: { type: "string" },
          room: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: [...UNITS] },
          vatRate: { type: "number", enum: [20, 10, 5.5] },
        },
        required: ["ref"],
      },
    },
    deletions: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
  },
  required: ["lines", "updates", "deletions", "missing"],
};

export const SYSTEM_PROMPT = `Tu es l'assistant d'un artisan du BTP en France. Sur le chantier, l'artisan dicte les travaux à prévoir pour un devis. À partir de la transcription de sa dictée (reconnaissance vocale, donc parfois imparfaite), tu tiens à jour les lignes du devis : tu en ajoutes, et tu modifies ou supprimes des lignes existantes quand l'artisan le demande.

Règles :
- Une ligne = une prestation ou une fourniture distincte. Découpe les phrases qui en contiennent plusieurs.
- description : formulation professionnelle et concise, comme sur un devis (ex. « Fourniture et pose d'une porte intérieure »). Corrige les erreurs évidentes de transcription.
- room : pièce ou zone concernée si elle est dite (« Cuisine », « Salle de bain »…), sinon "".
- quantity et unit : reprends les quantités dictées. Unités possibles : u (unité), m2, ml (mètre linéaire), m3, h, jour, forfait, kg, l, ens (ensemble). Sans quantité dite : 1, avec l'unité la plus logique (u pour un élément, forfait pour une prestation globale).
- vatRate : taux de TVA suggéré, 10 pour des travaux de rénovation ou d'entretien dans un logement de plus de 2 ans, 5.5 pour de la rénovation énergétique (isolation, pompe à chaleur, fenêtres performantes…), 20 pour du neuf ou un local professionnel. En cas de doute pour un logement : 10.
- Ne donne JAMAIS de prix : ils sont fixés par l'artisan.
- Ignore ce qui n'est pas une prestation (salutations, bavardage, éléments conservés en l'état).
- Les lignes déjà présentes dans le devis te sont données en JSON, chacune avec une référence (ref : "L1", "L2"…). Ne les recrée pas dans lines.
- updates : si l'artisan demande de changer une ligne existante (quantité, pièce, unité, TVA, formulation), donne sa ref et uniquement les champs qui changent.
- deletions : si l'artisan demande d'enlever, supprimer, annuler ou retirer une prestation existante (« supprime la fenêtre de la cuisine », « finalement on ne fait pas le carrelage »), donne la ref de la ou des lignes concernées.
- Ne modifie et ne supprime que les lignes clairement visées par la dictée. Dans le doute, n'y touche pas et signale-le dans missing.
- missing : informations manquantes pour chiffrer (surface, longueur, dimensions, matériau, gamme…), en phrases courtes. Liste vide si rien ne manque.

Réponds uniquement avec un objet JSON, sans texte autour :
{"lines":[{"description":"...","room":"...","quantity":1,"unit":"u","vatRate":10}],"updates":[{"ref":"L2","quantity":3}],"deletions":["L1"],"missing":["..."]}
(updates et deletions : listes vides si la dictée ne demande aucun changement sur les lignes existantes)`;

/** Référence courte d'une ligne existante pour le LLM (« L1 »…), plus fiable qu'un UUID à recopier. */
const lineRef = (index: number) => `L${index + 1}`;

export function buildUserPrompt(input: ExtractionInput): string {
  const existing = JSON.stringify(
    input.existingLines.map((l, i) => ({
      ref: lineRef(i),
      description: l.description,
      room: l.room,
      quantity: l.quantity,
      unit: l.unit,
      vatRate: l.vatRateBp / 100,
    })),
  );
  if (input.kind === "passive") {
    return (
      `Lignes déjà présentes dans le devis :\n${existing}\n\n` +
      "Attention : ce n'est pas une dictée mais un extrait de la conversation enregistrée pendant la visite " +
      "(l'artisan et son client, voix non distinguées). N'extrais que les travaux que l'artisan prévoit de " +
      "réaliser ; ignore les idées écartées, les hésitations et le reste de la conversation.\n\n" +
      `Transcription de l'extrait :\n"""\n${input.transcript}\n"""`
    );
  }
  return `Lignes déjà présentes dans le devis :\n${existing}\n\nTranscription de la dictée :\n"""\n${input.transcript}\n"""`;
}

function toResult(parsed: z.infer<typeof LlmResponseSchema>, existing: readonly ExistingLine[]): ExtractionResult {
  // Références inconnues ignorées : le LLM ne peut viser que les lignes qu'on lui a montrées.
  const idOf = (ref: string) => existing[Number(/^L(\d+)$/i.exec(ref)?.[1] ?? 0) - 1]?.id;
  const deletions = [...new Set((parsed.deletions ?? []).map(idOf).filter((id) => id !== undefined))];
  const updates: LineUpdate[] = [];
  for (const u of parsed.updates ?? []) {
    const lineId = idOf(u.ref);
    if (!lineId || deletions.includes(lineId)) continue;
    const changes: Partial<ExtractedLine> = {};
    if (u.description) changes.description = u.description;
    if (u.room !== null && u.room !== undefined) changes.room = u.room;
    if (u.quantity !== undefined) changes.quantity = u.quantity;
    if (u.unit) changes.unit = normalizeUnit(u.unit);
    if (u.vatRate !== null && u.vatRate !== undefined) changes.vatRateBp = normalizeVatRate(u.vatRate);
    if (Object.keys(changes).length > 0) updates.push({ lineId, changes });
  }
  return {
    updates,
    deletions,
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
          return toResult(LlmResponseSchema.parse(parseJsonResponse(text)), input.existingLines);
        } catch (err) {
          lastError =
            err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : String(err);
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

const ROOMS = [
  "cuisine",
  "salle de bain",
  "salle d'eau",
  "salon",
  "séjour",
  "chambre",
  "couloir",
  "entrée",
  "wc",
  "toilettes",
  "combles",
  "garage",
  "cave",
  "bureau",
  "terrasse",
];

const DELETE_REQUEST = /^(supprime|supprimer|enlève|enlever|retire|retirer|annule|annuler)\b/i;

/** Mots porteurs de sens (4 lettres et plus), pour rapprocher une demande de suppression d'une ligne. */
const keywords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\d]+/u)
      .filter((w) => w.length >= 4),
  );

/**
 * Une ligne par phrase d'au moins 4 mots, avec pièce et quantité repérées par mots-clés.
 * Une phrase commençant par « supprime », « enlève »… supprime les lignes qui partagent au moins 2 mots avec elle.
 */
export const mockLineExtractor: LineExtractor = {
  async extract({ transcript, existingLines }) {
    const sentences = transcript
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim().replace(/[.?!,;]+$/, ""))
      .filter((s) => s.split(/\s+/).length >= 4);
    const deletions = new Set<string>();
    for (const sentence of sentences.filter((s) => DELETE_REQUEST.test(s))) {
      const words = keywords(sentence);
      for (const line of existingLines) {
        const shared = [...keywords(`${line.description} ${line.room}`)].filter((w) => words.has(w));
        if (shared.length >= 2) deletions.add(line.id);
      }
    }
    const lines = sentences
      .filter((s) => !DELETE_REQUEST.test(s))
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
    return {
      lines,
      updates: [],
      deletions: [...deletions],
      warnings: ["Extraction simulée (LLM_PROVIDER=mock) : configurer un LLM pour un vrai résultat"],
    };
  },
};
