import { STATUS_LABELS, type QuoteStatus } from "../domain/quote-status.js";
import { VAT_EXEMPT_MENTION, computeQuoteTotals, type QuoteTotals } from "../domain/quote-totals.js";
import { UNIT_LABELS } from "../domain/units.js";
import type { Client } from "../repositories/clients.js";
import type { Company } from "../repositories/companies.js";
import type { Photo } from "../repositories/photos.js";
import type { Quote, QuoteLine } from "../repositories/quotes.js";

/**
 * Le devis tel que le client le voit (page publique) : uniquement ce qui figure sur le document
 * remis, avec les mentions légales. Rien d'interne (dictées, notes, points à compléter...).
 */
export interface QuoteDocument {
  number: string;
  title: string;
  status: QuoteStatus;
  statusLabel: string;
  /** Date du devis : date d'envoi, ou de création pour un aperçu avant envoi. */
  issuedAt: string;
  validUntil: string;
  validityDays: number;
  siteAddress: string;
  startDate: string | null;
  duration: string;
  paymentTerms: string;
  company: Omit<Company, "vatExempt" | "defaultValidityDays" | "defaultPaymentTerms" | "updatedAt">;
  client: Pick<Client, "name" | "email" | "phone" | "address">;
  lines: {
    position: number;
    description: string;
    room: string;
    quantity: number;
    unitLabel: string;
    unitPriceCents: number | null;
    vatRateBp: number;
    totalHtCents: number | null;
  }[];
  totals: Omit<QuoteTotals, "lineTotalsHtCents"> & { vatExempt: boolean; vatMention: string | null };
  photos: { id: string; caption: string; url: string }[];
  response: { decision: "accepted" | "declined"; name: string; message: string; at: string } | null;
  /** Le client peut encore accepter ou refuser (devis envoyé, ni expiré ni déjà traité). */
  canRespond: boolean;
  /** Aperçu de l'artisan : aucun suivi, pas de boutons de réponse. */
  preview: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Réponse du client (acceptation ou refus en ligne), ou null. */
export function quoteResponse(quote: Quote): QuoteDocument["response"] {
  const decision = quote.status === "accepted" || quote.status === "declined" ? quote.status : null;
  if (!decision || !quote.respondedAt) return null;
  return { decision, name: quote.responseName ?? "", message: quote.responseMessage ?? "", at: quote.respondedAt };
}
const RESPONDABLE: readonly QuoteStatus[] = ["sent", "viewed", "follow_up"];

export function buildQuoteDocument(input: {
  quote: Quote;
  company: Company;
  client: Client;
  lines: readonly QuoteLine[];
  /** Photos marquées visibles par le client. */
  photos: readonly Photo[];
  photoUrl: (photo: Photo) => string;
  preview: boolean;
}): QuoteDocument {
  const { quote, company, client, lines, preview } = input;
  const { lineTotalsHtCents, ...totals } = computeQuoteTotals(lines, { vatExempt: company.vatExempt });
  const issuedAt = quote.sentAt ?? quote.createdAt;

  return {
    number: quote.number,
    title: quote.title,
    status: quote.status,
    statusLabel: STATUS_LABELS[quote.status],
    issuedAt,
    validUntil: new Date(new Date(issuedAt).getTime() + quote.validityDays * DAY_MS).toISOString(),
    validityDays: quote.validityDays,
    siteAddress: quote.siteAddress,
    startDate: quote.startDate,
    duration: quote.duration,
    paymentTerms: quote.paymentTerms,
    company: {
      name: company.name,
      legalForm: company.legalForm,
      address: company.address,
      phone: company.phone,
      email: company.email,
      siret: company.siret,
      vatNumber: company.vatNumber,
      insurerName: company.insurerName,
      insurancePolicyNumber: company.insurancePolicyNumber,
      insuranceCoverage: company.insuranceCoverage,
    },
    client: { name: client.name, email: client.email, phone: client.phone, address: client.address },
    lines: lines.map((line, i) => ({
      position: line.position,
      description: line.description,
      room: line.room,
      quantity: line.quantity,
      unitLabel: UNIT_LABELS[line.unit],
      unitPriceCents: line.unitPriceCents,
      vatRateBp: company.vatExempt ? 0 : line.vatRateBp,
      totalHtCents: lineTotalsHtCents[i] ?? null,
    })),
    totals: { ...totals, vatExempt: company.vatExempt, vatMention: company.vatExempt ? VAT_EXEMPT_MENTION : null },
    photos: input.photos.map((photo) => ({ id: photo.id, caption: photo.caption, url: input.photoUrl(photo) })),
    response: quoteResponse(quote),
    canRespond: !preview && RESPONDABLE.includes(quote.status),
    preview,
  };
}
