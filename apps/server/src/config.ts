import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  TRANSCRIBER: z.enum(["mock", "kyutai"]).default("mock"),
  KYUTAI_URL: z.string().url().default("ws://localhost:8080/api/asr-streaming"),
  KYUTAI_API_KEY: z.string().default("public_token"),
  KYUTAI_PAUSE_HEAD: z.coerce.number().int().min(0).max(3).default(1),
  KYUTAI_PAUSE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
});

export type Config = z.infer<typeof EnvSchema>;

export const config: Config = EnvSchema.parse(process.env);
