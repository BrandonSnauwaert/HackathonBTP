import type { ApiErrorBody, Clip, Company, Photo, QuoteDetail, QuoteStatus, QuoteSummary, User } from "./types";

/** Erreur renvoyée par l'API : `code` est stable, `message` est affichable tel quel. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.error;
    this.details = body.details;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "error" in value && "message" in value;
}

/**
 * Appel à l'API (même origine, via le proxy Vite) ; le cookie de session suit automatiquement.
 * Le type de retour est celui documenté par l'API, sans validation à l'exécution.
 */
async function request<T>(method: string, path: string, body?: object | Blob): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body instanceof Blob) {
    // Fichier brut (dictée WAV, photo) : envoyé avec son propre type.
    init.headers = { "Content-Type": body.type || "application/octet-stream" };
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, { error: "network", message: "Serveur injoignable" });
  }
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      isErrorBody(data) ? data : { error: "http_error", message: `Erreur HTTP ${response.status}` },
    );
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>("GET", "/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("POST", "/auth/login", { email, password }),
  logout: () => request<null>("POST", "/auth/logout"),

  getCompany: () => request<Company>("GET", "/company"),

  listQuotes: () => request<QuoteSummary[]>("GET", "/quotes"),
  getQuote: (id: string) => request<QuoteDetail>("GET", `/quotes/${id}`),
  createQuote: (client: { name: string; email?: string; phone?: string }, title: string, siteAddress: string) =>
    request<QuoteDetail>("POST", "/quotes", { client, title, siteAddress }),
  updateQuote: (id: string, update: { startDate?: string | null; duration?: string }) =>
    request<QuoteDetail>("PATCH", `/quotes/${id}`, update),
  /** byEmail = false : aucun e-mail, l'artisan partage le lien lui-même. Le devis doit être « prêt ». */
  sendQuote: (id: string, byEmail: boolean) => request<QuoteDetail>("POST", `/quotes/${id}/send`, { byEmail }),
  resendEmail: (id: string) => request<QuoteDetail>("POST", `/quotes/${id}/resend`),
  changeStatus: (id: string, status: QuoteStatus) => request<QuoteDetail>("POST", `/quotes/${id}/status`, { status }),

  updateLine: (
    quoteId: string,
    lineId: string,
    update: { quantity?: number; unitPriceCents?: number | null; vatRateBp?: number },
  ) => request<QuoteDetail>("PATCH", `/quotes/${quoteId}/lines/${lineId}`, update),
  deleteLine: (quoteId: string, lineId: string) => request<QuoteDetail>("DELETE", `/quotes/${quoteId}/lines/${lineId}`),

  uploadClip: (quoteId: string, wav: Blob, clientClipId: string, recordedAt: Date) =>
    request<Clip>(
      "POST",
      `/quotes/${quoteId}/clips?clientClipId=${clientClipId}&recordedAt=${encodeURIComponent(recordedAt.toISOString())}`,
      wav,
    ),
  retryClip: (quoteId: string, clipId: string) => request<Clip>("POST", `/quotes/${quoteId}/clips/${clipId}/retry`),
  clipAudioUrl: (quoteId: string, clipId: string) => `/api/quotes/${quoteId}/clips/${clipId}/audio`,

  uploadPhoto: (quoteId: string, image: Blob, clientPhotoId: string, takenAt: Date) =>
    request<Photo>(
      "POST",
      `/quotes/${quoteId}/photos?clientPhotoId=${clientPhotoId}&takenAt=${encodeURIComponent(takenAt.toISOString())}`,
      image,
    ),
  updatePhoto: (quoteId: string, photoId: string, update: { caption?: string; visibleToClient?: boolean }) =>
    request<Photo>("PATCH", `/quotes/${quoteId}/photos/${photoId}`, update),
  deletePhoto: (quoteId: string, photoId: string) => request<null>("DELETE", `/quotes/${quoteId}/photos/${photoId}`),
};
