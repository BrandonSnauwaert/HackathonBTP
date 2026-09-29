import { z } from "zod";

/** Erreur métier renvoyée telle quelle au client : { error, message, details? }. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message: string) => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string, details?: unknown) => new HttpError(409, code, message, details);

export const ErrorResponseSchema = z
  .object({
    error: z.string().describe("Code d'erreur stable, à utiliser côté front"),
    message: z.string().describe("Message lisible, en français"),
    details: z.unknown().optional(),
  })
  .meta({ id: "Error" });
