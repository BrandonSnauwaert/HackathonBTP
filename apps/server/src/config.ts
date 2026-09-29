import { z } from "zod";

const booleanFromEnv = z.enum(["true", "false"]).transform((v) => v === "true");

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().default("data/app.sqlite"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** true derrière HTTPS (tunnel de démo) : le cookie de session n'est alors envoyé qu'en HTTPS. */
  COOKIE_SECURE: booleanFromEnv.default(false),
  FOLLOW_UP_AFTER_DAYS: z.coerce.number().int().positive().default(7),
  TRANSCRIBER: z.enum(["mock", "kyutai"]).default("mock"),
  KYUTAI_URL: z.string().url().default("ws://localhost:8080/api/asr-streaming"),
  KYUTAI_API_KEY: z.string().default("public_token"),
  KYUTAI_PAUSE_HEAD: z.coerce.number().int().min(0).max(3).default(1),
  KYUTAI_PAUSE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
});

export type Config = z.infer<typeof EnvSchema>;

export const config: Config = EnvSchema.parse(process.env);
