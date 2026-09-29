/**
 * Types des réponses de l'API, recopiés de la doc OpenAPI (http://localhost:3000/docs).
 * Montants en centimes, TVA en points de base (2000 = 20 %).
 */

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export type QuoteStatus = "draft" | "ready" | "sent" | "viewed" | "follow_up" | "accepted" | "declined" | "expired";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface QuoteSummary {
  id: string;
  number: string;
  status: QuoteStatus;
  statusLabel: string;
  title: string;
  client: { id: string; name: string };
  totalHtCents: number;
  totalTtcCents: number;
  unpricedLineCount: number;
  lineCount: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLine {
  id: string;
  position: number;
  description: string;
  room: string;
  quantity: number;
  unit: string;
  unitLabel: string;
  unitPriceCents: number | null;
  vatRateBp: number;
  totalHtCents: number | null;
  source: "manual" | "dictation";
  clipId: string | null;
}

export type ClipStatus = "pending" | "transcribing" | "transcribed" | "extracting" | "done" | "failed";

export interface Clip {
  id: string;
  clientClipId: string | null;
  status: ClipStatus;
  statusLabel: string;
  durationMs: number;
  transcript: string | null;
  warnings: string[];
  error: string | null;
  lineCount: number;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTotals {
  totalHtCents: number;
  vatBreakdown: { vatRateBp: number; baseHtCents: number; vatCents: number }[];
  totalVatCents: number;
  totalTtcCents: number;
  unpricedLineCount: number;
  vatExempt: boolean;
  vatMention: string | null;
}

export interface QuoteDetail {
  id: string;
  number: string;
  status: QuoteStatus;
  statusLabel: string;
  title: string;
  siteAddress: string;
  client: Client;
  lines: QuoteLine[];
  totals: QuoteTotals;
  issues: string[];
  allowedTransitions: QuoteStatus[];
  clips: Clip[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
