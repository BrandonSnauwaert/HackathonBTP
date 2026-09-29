/**
 * Schémas zod de l'API REST. Ils valident les requêtes, sérialisent les réponses
 * et génèrent la doc OpenAPI (/docs). Les `.meta({ id })` deviennent des composants nommés.
 */
import { z } from "zod";
import { QUOTE_STATUSES } from "../domain/quote-status.js";
import { CLIP_STATUSES } from "../repositories/clips.js";
import { VAT_RATES_BP } from "../domain/quote-totals.js";
import { UNITS } from "../domain/units.js";

const cents = (description: string) => z.number().int().describe(`${description} (centimes)`);
const isoDate = z.string().describe("Date ISO 8601");

export const IdParams = z.object({ id: z.uuid() });
export const LineParams = z.object({ id: z.uuid(), lineId: z.uuid() });

// --- Auth

export const CredentialsSchema = z
  .object({
    email: z.email().describe("Adresse e-mail de connexion"),
    password: z.string().min(8).max(200).describe("8 caractères minimum"),
  })
  .meta({ id: "Credentials" });

export const UserSchema = z.object({ id: z.uuid(), email: z.string(), createdAt: isoDate }).meta({ id: "User" });

// --- Profil entreprise

export const CompanySchema = z
  .object({
    name: z.string().describe("Nom commercial ou raison sociale"),
    legalForm: z.string().describe("Forme juridique : EI, SARL, SAS... (+ capital le cas échéant)"),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    siret: z.string(),
    vatNumber: z.string().describe("N° de TVA intracommunautaire"),
    vatExempt: z.boolean().describe("Franchise en base de TVA (auto-entrepreneur) : pas de TVA sur les devis"),
    insurerName: z.string().describe("Assureur décennale"),
    insurancePolicyNumber: z.string(),
    insuranceCoverage: z.string().describe("Couverture géographique de l'assurance"),
    defaultValidityDays: z.number().int().describe("Durée de validité par défaut des devis, en jours"),
    defaultPaymentTerms: z.string().describe("Conditions de paiement par défaut"),
    updatedAt: isoDate,
  })
  .meta({ id: "Company" });

export const CompanyUpdateSchema = CompanySchema.omit({ updatedAt: true })
  .extend({ defaultValidityDays: z.number().int().min(1).max(365) })
  .partial()
  .meta({ id: "CompanyUpdate" });

// --- Clients

export const ClientSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    address: z.string().describe("Adresse de facturation"),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ id: "Client" });

export const ClientInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.union([z.email(), z.literal("")]).optional(),
    phone: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
  })
  .meta({ id: "ClientCreate" });

export const ClientUpdateSchema = ClientInputSchema.partial().meta({ id: "ClientUpdate" });

// --- Devis

export const QuoteStatusSchema = z.enum(QUOTE_STATUSES).meta({
  id: "QuoteStatus",
  description:
    "draft = brouillon, ready = prêt à envoyer, sent = envoyé, viewed = consulté, follow_up = à relancer, " +
    "accepted = accepté, declined = refusé, expired = expiré",
});

const UnitSchema = z.enum(UNITS).describe("u, m2, ml, m3, h, jour, forfait, kg, l, ens");
const VatRateSchema = z
  .union(VAT_RATES_BP.map((rate) => z.literal(rate)))
  .describe("Taux de TVA en points de base : 2000 = 20 %, 1000 = 10 %, 550 = 5,5 %, 0");

export const QuoteLineSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().describe("Ordre d'affichage, à partir de 1"),
    description: z.string(),
    room: z.string().describe("Pièce concernée (cuisine, salle de bain...)"),
    quantity: z.number(),
    unit: UnitSchema,
    unitLabel: z.string().describe("Unité à afficher (m², ml...)"),
    unitPriceCents: cents("Prix unitaire HT").nullable().describe("Prix unitaire HT en centimes, null = à renseigner"),
    vatRateBp: z.number().int(),
    totalHtCents: cents("Total HT de la ligne").nullable(),
    source: z.enum(["manual", "dictation"]).describe("Ligne saisie à la main ou issue d'une dictée"),
    clipId: z.uuid().nullable().describe("Dictée dont la ligne est issue"),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ id: "QuoteLine" });

export const LineInputSchema = z
  .object({
    description: z.string().trim().min(1).max(1000),
    room: z.string().max(100).optional(),
    quantity: z.number().positive().max(1_000_000),
    unit: UnitSchema,
    unitPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
    vatRateBp: VatRateSchema.default(2000),
  })
  .meta({ id: "LineCreate" });

export const LineUpdateSchema = LineInputSchema.extend({ vatRateBp: VatRateSchema.optional() })
  .partial()
  .meta({ id: "LineUpdate" });

export const QuoteEventSchema = z
  .object({
    id: z.uuid(),
    type: z.string().describe("created, status_changed..."),
    actor: z.enum(["artisan", "client", "system"]),
    fromStatus: QuoteStatusSchema.nullable(),
    toStatus: QuoteStatusSchema.nullable(),
    createdAt: isoDate,
  })
  .meta({ id: "QuoteEvent" });

export const ClipSchema = z
  .object({
    id: z.uuid(),
    clientClipId: z.string().nullable().describe("Identifiant généré par le téléphone"),
    status: z.enum(CLIP_STATUSES).describe("pending → transcribing → transcribed → extracting → done, ou failed"),
    statusLabel: z.string(),
    durationMs: z.number().int(),
    transcript: z.string().nullable().describe("Texte transcrit (null tant que la transcription n'est pas faite)"),
    warnings: z.array(z.string()).describe("Informations manquantes relevées par l'analyse (quantités, dimensions...)"),
    error: z.string().nullable().describe("Cause de l'échec, si status = failed"),
    lineCount: z.number().int().describe("Nombre de lignes ajoutées au devis par cette dictée"),
    recordedAt: isoDate,
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ id: "Clip" });

export const QuoteTotalsSchema = z
  .object({
    totalHtCents: cents("Total HT"),
    vatBreakdown: z.array(
      z.object({ vatRateBp: z.number().int(), baseHtCents: cents("Base HT"), vatCents: cents("Montant de TVA") }),
    ),
    totalVatCents: cents("Total TVA"),
    totalTtcCents: cents("Total TTC"),
    unpricedLineCount: z.number().int().describe("Lignes sans prix : si > 0, les totaux sont partiels"),
    vatExempt: z.boolean(),
    vatMention: z.string().nullable().describe("Mention à imprimer si l'entreprise est en franchise de TVA"),
  })
  .meta({ id: "QuoteTotals" });

export const QuoteDetailSchema = z
  .object({
    id: z.uuid(),
    number: z.string().describe("Numéro chronologique : D-2026-0001"),
    status: QuoteStatusSchema,
    statusLabel: z.string().describe("Libellé du statut, en français"),
    title: z.string(),
    siteAddress: z.string().describe("Adresse du chantier"),
    validityDays: z.number().int(),
    validUntil: isoDate.nullable().describe("Fin de validité (calculée à partir de l'envoi)"),
    startDate: z.string().nullable().describe("Date de début des travaux (AAAA-MM-JJ)"),
    duration: z.string().describe("Durée estimée des travaux, texte libre"),
    paymentTerms: z.string(),
    notes: z.string(),
    sentAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    client: ClientSchema,
    lines: z.array(QuoteLineSchema),
    totals: QuoteTotalsSchema,
    issues: z.array(z.string()).describe("Ce qui manque pour passer le devis en « prêt » (vide = complet)"),
    allowedTransitions: z.array(QuoteStatusSchema).describe("Statuts que l'artisan peut poser via POST /status"),
    clips: z.array(ClipSchema).describe("Dictées du devis et leur état de traitement"),
    events: z.array(QuoteEventSchema),
  })
  .meta({ id: "QuoteDetail" });

export const QuoteSummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    status: QuoteStatusSchema,
    statusLabel: z.string(),
    title: z.string(),
    client: z.object({ id: z.uuid(), name: z.string() }),
    totalHtCents: cents("Total HT"),
    totalTtcCents: cents("Total TTC"),
    unpricedLineCount: z.number().int(),
    lineCount: z.number().int(),
    sentAt: isoDate.nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ id: "QuoteSummary" });

const QuoteMetaFields = {
  title: z.string().max(200),
  siteAddress: z.string().max(500),
  validityDays: z.number().int().min(1).max(365),
  startDate: z.iso.date().nullable().describe("AAAA-MM-JJ"),
  duration: z.string().max(200),
  paymentTerms: z.string().max(1000),
  notes: z.string().max(5000),
};

export const QuoteCreateSchema = z
  .object({
    clientId: z.uuid().optional().describe("Client existant..."),
    client: ClientInputSchema.optional().describe("...ou nouveau client créé en même temps que le devis"),
    ...QuoteMetaFields,
  })
  .partial({ title: true, siteAddress: true, validityDays: true, startDate: true, duration: true, paymentTerms: true, notes: true })
  .refine((body) => (body.clientId === undefined) !== (body.client === undefined), {
    message: "Indiquer soit clientId, soit client (pas les deux)",
  })
  .meta({ id: "QuoteCreate" });

export const QuoteUpdateSchema = z
  .object({ clientId: z.uuid(), ...QuoteMetaFields })
  .partial()
  .meta({ id: "QuoteUpdate" });

export const StatusChangeSchema = z
  .object({ status: QuoteStatusSchema.describe("draft, ready, accepted ou declined") })
  .meta({ id: "StatusChange" });

export const LineOrderSchema = z
  .object({ lineIds: z.array(z.uuid()).describe("Tous les identifiants de lignes, dans le nouvel ordre") })
  .meta({ id: "LineOrder" });
