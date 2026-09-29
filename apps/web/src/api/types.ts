/**
 * Types de l'API, générés depuis la doc OpenAPI du serveur (src/api/schema.d.ts).
 * Ne pas les écrire à la main : après un changement d'API, lancer `npm run openapi` dans apps/server.
 * Montants en centimes, TVA en points de base (2000 = 20 %).
 */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type User = Schemas["User"];
export type Client = Schemas["Client"];
export type QuoteStatus = Schemas["QuoteStatus"];
export type QuoteSummary = Schemas["QuoteSummary"];
export type QuoteDetail = Schemas["QuoteDetail"];
export type QuoteLine = Schemas["QuoteLine"];
export type QuoteTotals = Schemas["QuoteTotals"];
export type Clip = Schemas["Clip"];
export type Photo = Schemas["Photo"];
export type ClipStatus = Clip["status"];
export type ApiErrorBody = Schemas["Error"];
