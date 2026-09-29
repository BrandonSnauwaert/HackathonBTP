import { z } from "zod";

const booleanFromEnv = z.enum(["true", "false"]).transform((v) => v === "true");
/** Une variable vide dans le .env (`LLM_BASE_URL=`) compte comme absente. */
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_PATH: z.string().default("data/app.sqlite"),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** true derrière HTTPS (tunnel de démo) : le cookie de session n'est alors envoyé qu'en HTTPS. */
    COOKIE_SECURE: booleanFromEnv.default(false),
    FOLLOW_UP_AFTER_DAYS: z.coerce.number().int().positive().default(7),

    // Dictées
    CLIPS_DIR: z.string().default("data/clips"),
    MAX_CLIP_SECONDS: z.coerce.number().int().positive().default(300),

    // Transcription
    TRANSCRIBER: z.enum(["mock", "kyutai"]).default("mock"),
    KYUTAI_URL: z.string().url().default("ws://localhost:8080/api/asr-streaming"),
    KYUTAI_API_KEY: z.string().default("public_token"),
    KYUTAI_PAUSE_HEAD: z.coerce.number().int().min(0).max(3).default(1),
    KYUTAI_PAUSE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),

    // LLM (API compatible OpenAI : OpenAI, Mistral, Groq, OpenRouter, Ollama, vLLM, LM Studio...)
    LLM_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
    LLM_BASE_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
    LLM_API_KEY: z.string().default(""),
    LLM_MODEL: z.string().default(""),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    LLM_JSON_MODE: z.enum(["json_object", "json_schema", "none"]).default("json_object"),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "openai" && !env.LLM_MODEL) {
      ctx.addIssue({ code: "custom", path: ["LLM_MODEL"], message: "obligatoire quand LLM_PROVIDER=openai" });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

/** Lit et valide la configuration ; message clair si une variable est invalide. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuration invalide (.env) :\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const config: Config = parseConfig(process.env);
