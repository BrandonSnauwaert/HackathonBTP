import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { transaction, type Database } from "../db/database.js";
import {
  STATUS_LABELS,
  allowedTransitions,
  canTransition,
  isEditable,
  timeBasedStatus,
  type Actor,
  type QuoteStatus,
} from "../domain/quote-status.js";
import { VAT_EXEMPT_MENTION, computeQuoteTotals, type QuoteTotals } from "../domain/quote-totals.js";
import { UNIT_LABELS } from "../domain/units.js";
import { HttpError, conflict } from "../http/errors.js";
import { countLinesByClip, listClips, toClipView, type ClipView } from "../repositories/clips.js";
import { createClient, getClient, type Client, type ClientInput } from "../repositories/clients.js";
import { companyIssues, getCompany } from "../repositories/companies.js";
import { getPhoto, listPhotos, toPhotoView, type PhotoView } from "../repositories/photos.js";
import { buildQuoteDocument, quoteResponse, type QuoteDocument } from "./quote-document.js";
import { EmailError, type Mailer } from "../email/mailer.js";
import { buildQuoteEmail } from "../email/quote-email.js";
import * as repo from "../repositories/quotes.js";
import type { LineInput, Quote, QuoteEvent, QuoteLine, QuoteUpdate } from "../repositories/quotes.js";
import type { ExtractedLine } from "../llm/line-extractor.js";
import type { PatchOf } from "../types.js";

export interface QuoteServiceOptions {
  /** Délai sans réponse après l'envoi avant de passer « à relancer ». */
  followUpAfterDays: number;
  /** Dossier des fichiers audio des dictées (supprimés avec le devis). */
  clipsDir: string;
  /** Dossier des photos (supprimées avec le devis). */
  photosDir: string;
  /** URL publique du front, pour construire le lien envoyé au client (ex. https://devis.mondomaine.fr). */
  publicBaseUrl: string;
  /** Envoi des e-mails (SMTP, ou simple log). */
  mailer: Mailer;
}

export type QuoteLineView = QuoteLine & { unitLabel: string; totalHtCents: number | null };

export interface QuoteDetail {
  id: string;
  number: string;
  status: QuoteStatus;
  statusLabel: string;
  title: string;
  siteAddress: string;
  validityDays: number;
  validUntil: string | null;
  startDate: string | null;
  duration: string;
  paymentTerms: string;
  notes: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: Client;
  lines: QuoteLineView[];
  totals: Omit<QuoteTotals, "lineTotalsHtCents"> & { vatExempt: boolean; vatMention: string | null };
  issues: string[];
  allowedTransitions: QuoteStatus[];
  clips: ClipView[];
  photos: PhotoView[];
  /** Lien de la page publique à envoyer au client (null tant que le devis n'est pas envoyé). */
  publicUrl: string | null;
  /** Réponse du client, s'il a accepté ou refusé en ligne. */
  response: QuoteDocument["response"];
  viewedAt: string | null;
  events: QuoteEvent[];
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

export type CreateQuoteInput = {
  clientId?: string | undefined;
  client?: ClientInput | undefined;
} & PatchOf<
  Pick<Quote, "title" | "siteAddress" | "validityDays" | "startDate" | "duration" | "paymentTerms" | "notes">
>;

export type QuoteMetaUpdate = Omit<QuoteUpdate, "status" | "sentAt">;

/** Statuts que l'artisan peut poser lui-même via l'API (l'envoi passe par sa propre route). */
const MANUAL_STATUSES: readonly QuoteStatus[] = ["draft", "ready", "accepted", "declined"];

const DAY_MS = 24 * 60 * 60 * 1000;

export function createQuoteService(db: Database, options: QuoteServiceOptions) {
  /** Applique les statuts automatiques (relance, expiration) avant toute lecture. */
  function refresh(quote: Quote, now = new Date()): Quote {
    const next = timeBasedStatus({
      status: quote.status,
      sentAt: quote.sentAt ? new Date(quote.sentAt) : null,
      validityDays: quote.validityDays,
      followUpAfterDays: options.followUpAfterDays,
      now,
    });
    if (next === null) return quote;
    transaction(db, () => {
      repo.updateQuote(db, quote.id, { status: next });
      repo.insertEvent(db, quote.id, {
        type: "status_changed",
        actor: "system",
        fromStatus: quote.status,
        toStatus: next,
      });
    });
    return { ...quote, status: next };
  }

  function loadEditable(userId: string, quoteId: string): Quote {
    const quote = refresh(repo.getQuote(db, userId, quoteId));
    if (!isEditable(quote.status)) {
      throw conflict("quote_locked", `Un devis « ${STATUS_LABELS[quote.status]} » ne peut plus être modifié`);
    }
    return quote;
  }

  /** Après une modification, un devis « prêt » redevient brouillon : il faudra le revalider. */
  function touch(quote: Quote): void {
    if (quote.status === "ready") {
      repo.updateQuote(db, quote.id, { status: "draft" });
      repo.insertEvent(db, quote.id, {
        type: "status_changed",
        actor: "artisan",
        fromStatus: "ready",
        toStatus: "draft",
      });
    } else {
      repo.updateQuote(db, quote.id, {});
    }
  }

  function readinessIssues(userId: string, client: Client, lines: readonly QuoteLine[]): string[] {
    const issues = companyIssues(getCompany(db, userId));
    if (!client.email) issues.push("Client : adresse e-mail manquante (nécessaire à l'envoi)");
    if (lines.length === 0) issues.push("Le devis ne contient aucune ligne");
    const unpriced = lines.filter((l) => l.unitPriceCents === null).length;
    if (unpriced > 0) issues.push(`${unpriced} ligne(s) sans prix`);
    return issues;
  }

  function listClipViews(quoteId: string): ClipView[] {
    const lineCounts = countLinesByClip(db, quoteId);
    return listClips(db, quoteId).map((clip) => toClipView(clip, lineCounts.get(clip.id) ?? 0));
  }

  function publicUrl(quote: Quote): string {
    return `${options.publicBaseUrl.replace(/\/$/, "")}/d/${quote.publicToken}`;
  }

  function documentOf(userId: string, quote: Quote, preview: boolean): QuoteDocument {
    return buildQuoteDocument({
      quote,
      company: getCompany(db, userId),
      client: getClient(db, userId, quote.clientId),
      lines: repo.listLines(db, quote.id),
      photos: listPhotos(db, quote.id).filter((p) => p.visibleToClient),
      photoUrl: (photo) =>
        preview ? toPhotoView(photo).url : `/api/public/quotes/${quote.publicToken}/photos/${photo.id}`,
      preview,
    });
  }

  /** Devis accessible par son lien public : uniquement une fois envoyé (jamais un brouillon). */
  function findPublic(token: string): { quote: Quote; userId: string } {
    const found = repo.findQuoteByPublicToken(db, token);
    if (!found || isEditable(found.quote.status)) throw new HttpError(404, "not_found", "Devis introuvable");
    return { quote: refresh(found.quote), userId: found.userId };
  }

  function detail(userId: string, quoteId: string): QuoteDetail {
    const quote = refresh(repo.getQuote(db, userId, quoteId));
    const client = getClient(db, userId, quote.clientId);
    const company = getCompany(db, userId);
    const lines = repo.listLines(db, quote.id);
    const { lineTotalsHtCents, ...totals } = computeQuoteTotals(lines, { vatExempt: company.vatExempt });

    return {
      id: quote.id,
      number: quote.number,
      status: quote.status,
      statusLabel: STATUS_LABELS[quote.status],
      title: quote.title,
      siteAddress: quote.siteAddress,
      validityDays: quote.validityDays,
      validUntil: quote.sentAt
        ? new Date(new Date(quote.sentAt).getTime() + quote.validityDays * DAY_MS).toISOString()
        : null,
      startDate: quote.startDate,
      duration: quote.duration,
      paymentTerms: quote.paymentTerms,
      notes: quote.notes,
      sentAt: quote.sentAt,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      client,
      lines: lines.map((line, i) => ({
        ...line,
        unitLabel: UNIT_LABELS[line.unit],
        totalHtCents: lineTotalsHtCents[i] ?? null,
      })),
      totals: { ...totals, vatExempt: company.vatExempt, vatMention: company.vatExempt ? VAT_EXEMPT_MENTION : null },
      issues: isEditable(quote.status) ? readinessIssues(userId, client, lines) : [],
      allowedTransitions: allowedTransitions(quote.status, "artisan").filter((s) => MANUAL_STATUSES.includes(s)),
      clips: listClipViews(quote.id),
      photos: listPhotos(db, quote.id).map(toPhotoView),
      publicUrl: isEditable(quote.status) ? null : publicUrl(quote),
      response: quoteResponse(quote),
      viewedAt: quote.viewedAt,
      events: repo.listEvents(db, quote.id),
    };
  }

  return {
    list(userId: string, status?: QuoteStatus): QuoteSummary[] {
      const quotes = repo.listQuotes(db, userId).map((q) => refresh(q));
      const linesByQuote = repo.listLinesByQuote(db, userId);
      const vatExempt = getCompany(db, userId).vatExempt;
      const clients = new Map<string, Client>();

      return quotes
        .filter((q) => status === undefined || q.status === status)
        .map((quote) => {
          const client = clients.get(quote.clientId) ?? getClient(db, userId, quote.clientId);
          clients.set(client.id, client);
          const lines = linesByQuote.get(quote.id) ?? [];
          const totals = computeQuoteTotals(lines, { vatExempt });
          return {
            id: quote.id,
            number: quote.number,
            status: quote.status,
            statusLabel: STATUS_LABELS[quote.status],
            title: quote.title,
            client: { id: client.id, name: client.name },
            totalHtCents: totals.totalHtCents,
            totalTtcCents: totals.totalTtcCents,
            unpricedLineCount: totals.unpricedLineCount,
            lineCount: lines.length,
            sentAt: quote.sentAt,
            createdAt: quote.createdAt,
            updatedAt: quote.updatedAt,
          };
        });
    },

    get: detail,

    create(userId: string, input: CreateQuoteInput): QuoteDetail {
      const company = getCompany(db, userId);
      const quoteId = transaction(db, () => {
        const clientId = input.client ? createClient(db, userId, input.client).id : input.clientId;
        if (!clientId) throw new HttpError(400, "client_required", "Indiquer clientId ou client");
        getClient(db, userId, clientId);

        const id = randomUUID();
        repo.insertQuote(db, userId, {
          id,
          clientId,
          number: repo.nextQuoteNumber(db, userId, new Date().getFullYear()),
          status: "draft",
          title: input.title ?? "",
          siteAddress: input.siteAddress ?? "",
          validityDays: input.validityDays ?? company.defaultValidityDays,
          startDate: input.startDate ?? null,
          duration: input.duration ?? "",
          paymentTerms: input.paymentTerms ?? company.defaultPaymentTerms,
          notes: input.notes ?? "",
          publicToken: randomBytes(24).toString("base64url"),
        });
        repo.insertEvent(db, id, { type: "created", actor: "artisan", toStatus: "draft" });
        return id;
      });
      return detail(userId, quoteId);
    },

    update(userId: string, quoteId: string, update: QuoteMetaUpdate): QuoteDetail {
      const quote = loadEditable(userId, quoteId);
      if (update.clientId !== undefined) getClient(db, userId, update.clientId);
      transaction(db, () => {
        repo.updateQuote(db, quote.id, update);
        touch(quote);
      });
      return detail(userId, quoteId);
    },

    async remove(userId: string, quoteId: string): Promise<void> {
      const quote = loadEditable(userId, quoteId);
      const files = [
        ...listClips(db, quote.id).map((c) => join(options.clipsDir, c.audioFile)),
        ...listPhotos(db, quote.id).map((p) => join(options.photosDir, p.file)),
      ];
      repo.deleteQuote(db, quote.id);
      await Promise.all(files.map((file) => rm(file, { force: true })));
    },

    /** Vérifie qu'on peut encore ajouter une dictée ou une photo à ce devis (brouillon ou prêt). */
    assertEditable(userId: string, quoteId: string): void {
      loadEditable(userId, quoteId);
    },

    /** Ajoute les lignes extraites d'une dictée, en fin de devis. */
    addDictatedLines(userId: string, quoteId: string, clipId: string, lines: readonly ExtractedLine[]): void {
      const quote = loadEditable(userId, quoteId);
      if (lines.length === 0) return;
      transaction(db, () => {
        for (const line of lines) repo.insertLine(db, quote.id, { ...line, source: "dictation", clipId });
        touch(quote);
      });
    },

    /**
     * Envoie le devis : e-mail au client (sauf `byEmail: false`, lien partagé à la main), puis le devis
     * passe en « envoyé », daté du jour, et son lien public devient accessible.
     * L'e-mail part AVANT de figer le devis : s'il échoue, le devis reste « prêt » et l'artisan est prévenu.
     */
    async send(userId: string, quoteId: string, { byEmail }: { byEmail: boolean }): Promise<QuoteDetail> {
      const quote = refresh(repo.getQuote(db, userId, quoteId));
      if (quote.status !== "ready") {
        const hint = quote.status === "draft" ? " : le passer d'abord en « prêt à envoyer »" : "";
        throw conflict("quote_not_ready", `Un devis « ${STATUS_LABELS[quote.status]} » ne peut pas être envoyé${hint}`);
      }

      const sentAt = new Date().toISOString();
      if (byEmail) {
        const company = getCompany(db, userId);
        const client = getClient(db, userId, quote.clientId);
        const doc = documentOf(userId, { ...quote, sentAt }, false);
        const email = buildQuoteEmail({
          companyName: company.name,
          companyPhone: company.phone,
          clientName: client.name,
          quoteNumber: quote.number,
          title: quote.title,
          totalTtcCents: doc.totals.totalTtcCents,
          validUntil: doc.validUntil,
          publicUrl: publicUrl(quote),
          pixelUrl: `${options.publicBaseUrl.replace(/\/$/, "")}/api/public/quotes/${quote.publicToken}/pixel.gif`,
        });
        try {
          await options.mailer.send({
            to: { address: client.email, name: client.name },
            fromName: company.name,
            replyTo: company.email || undefined,
            ...email,
          });
        } catch (err) {
          const message = err instanceof EmailError ? err.message : "L'e-mail n'a pas pu être envoyé";
          throw new HttpError(502, "email_failed", `${message}. Le devis n'a pas été envoyé.`);
        }
      }

      transaction(db, () => {
        repo.updateQuote(db, quote.id, { status: "sent", sentAt });
        repo.insertEvent(db, quote.id, {
          type: byEmail ? "sent_by_email" : "sent",
          actor: "artisan",
          fromStatus: "ready",
          toStatus: "sent",
        });
      });
      return detail(userId, quoteId);
    },

    /** Aperçu du document pour l'artisan, à tout moment (aucun suivi). */
    preview(userId: string, quoteId: string): QuoteDocument {
      return documentOf(userId, refresh(repo.getQuote(db, userId, quoteId)), true);
    },

    /** Page publique : le client ouvre le lien. La première ouverture fait passer le devis en « consulté ». */
    openPublic(token: string): QuoteDocument {
      const { quote, userId } = findPublic(token);
      if (quote.viewedAt === null) {
        const now = new Date().toISOString();
        transaction(db, () => {
          repo.updateQuote(
            db,
            quote.id,
            quote.status === "sent" ? { viewedAt: now, status: "viewed" } : { viewedAt: now },
          );
          repo.insertEvent(
            db,
            quote.id,
            quote.status === "sent"
              ? { type: "viewed", actor: "client", fromStatus: "sent", toStatus: "viewed" }
              : { type: "viewed", actor: "client" },
          );
        });
      }
      return documentOf(userId, repo.getQuote(db, userId, quote.id), false);
    },

    /** Réponse du client depuis la page publique. */
    respond(
      token: string,
      decision: "accepted" | "declined",
      answer: { name: string; message?: string | undefined },
    ): QuoteDocument {
      const { quote, userId } = findPublic(token);
      if (quote.status === "accepted" || quote.status === "declined") {
        throw conflict("already_answered", "Vous avez déjà répondu à ce devis");
      }
      if (quote.status === "expired") throw conflict("quote_expired", "Ce devis a expiré : contactez l'entreprise");
      if (!canTransition(quote.status, decision, "client")) {
        throw conflict("invalid_transition", "Ce devis ne peut pas recevoir de réponse");
      }
      transaction(db, () => {
        repo.updateQuote(db, quote.id, {
          status: decision,
          respondedAt: new Date().toISOString(),
          responseName: answer.name,
          responseMessage: answer.message ?? "",
        });
        repo.insertEvent(db, quote.id, {
          type: "status_changed",
          actor: "client",
          fromStatus: quote.status,
          toStatus: decision,
        });
      });
      return documentOf(userId, repo.getQuote(db, userId, quote.id), false);
    },

    /** Photo partagée avec le client (les autres restent privées). */
    publicPhotoFile(token: string, photoId: string): { path: string; mimeType: string } {
      const { quote } = findPublic(token);
      const photo = getPhoto(db, quote.id, photoId);
      if (!photo.visibleToClient) throw new HttpError(404, "not_found", "Photo introuvable");
      return { path: join(options.photosDir, photo.file), mimeType: photo.mimeType };
    },

    /**
     * Pixel de suivi chargé par le logiciel de messagerie. Simple indication dans l'historique :
     * Apple Mail précharge les images, donc cela ne change jamais le statut du devis.
     */
    recordEmailOpen(token: string): void {
      const found = repo.findQuoteByPublicToken(db, token);
      if (!found || isEditable(found.quote.status)) return;
      repo.insertEvent(db, found.quote.id, { type: "email_opened", actor: "client" });
    },

    changeStatus(userId: string, quoteId: string, to: QuoteStatus, actor: Actor = "artisan"): QuoteDetail {
      const quote = refresh(repo.getQuote(db, userId, quoteId));
      if (actor === "artisan" && !MANUAL_STATUSES.includes(to)) {
        throw new HttpError(400, "status_not_manual", `Le statut « ${STATUS_LABELS[to]} » ne se pose pas à la main`);
      }
      if (!canTransition(quote.status, to, actor)) {
        throw conflict(
          "invalid_transition",
          `Impossible de passer de « ${STATUS_LABELS[quote.status]} » à « ${STATUS_LABELS[to]} »`,
        );
      }
      if (to === "ready") {
        const issues = readinessIssues(userId, getClient(db, userId, quote.clientId), repo.listLines(db, quote.id));
        if (issues.length > 0) throw conflict("quote_incomplete", "Le devis est incomplet", { issues });
      }
      transaction(db, () => {
        repo.updateQuote(db, quote.id, { status: to });
        repo.insertEvent(db, quote.id, { type: "status_changed", actor, fromStatus: quote.status, toStatus: to });
      });
      return detail(userId, quoteId);
    },

    addLine(userId: string, quoteId: string, input: LineInput): QuoteDetail {
      const quote = loadEditable(userId, quoteId);
      transaction(db, () => {
        repo.insertLine(db, quote.id, input);
        touch(quote);
      });
      return detail(userId, quoteId);
    },

    updateLine(userId: string, quoteId: string, lineId: string, update: PatchOf<LineInput>): QuoteDetail {
      const quote = loadEditable(userId, quoteId);
      transaction(db, () => {
        repo.updateLine(db, quote.id, lineId, update);
        touch(quote);
      });
      return detail(userId, quoteId);
    },

    removeLine(userId: string, quoteId: string, lineId: string): QuoteDetail {
      const quote = loadEditable(userId, quoteId);
      transaction(db, () => {
        repo.deleteLine(db, quote.id, lineId);
        touch(quote);
      });
      return detail(userId, quoteId);
    },

    reorderLines(userId: string, quoteId: string, lineIds: readonly string[]): QuoteDetail {
      const quote = loadEditable(userId, quoteId);
      const current = repo.listLines(db, quote.id).map((l) => l.id);
      const same = lineIds.length === current.length && [...lineIds].sort().join() === [...current].sort().join();
      if (!same) {
        throw new HttpError(400, "invalid_line_order", "lineIds doit contenir exactement les lignes du devis");
      }
      transaction(db, () => {
        repo.renumberLines(db, quote.id, lineIds);
        touch(quote);
      });
      return detail(userId, quoteId);
    },
  };
}

export type QuoteService = ReturnType<typeof createQuoteService>;
