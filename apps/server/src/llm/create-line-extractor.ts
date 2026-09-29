import type { Config } from "../config.js";
import { createLlmLineExtractor, mockLineExtractor, type LineExtractor } from "./line-extractor.js";
import { createOpenAiCompatibleClient } from "./openai-client.js";

/** Extracteur de lignes choisi par LLM_PROVIDER. */
export function createLineExtractor(config: Config): LineExtractor {
  switch (config.LLM_PROVIDER) {
    case "mock":
      return mockLineExtractor;
    case "openai":
      return createLlmLineExtractor(
        createOpenAiCompatibleClient({
          baseURL: config.LLM_BASE_URL,
          apiKey: config.LLM_API_KEY,
          model: config.LLM_MODEL,
          temperature: config.LLM_TEMPERATURE,
          timeoutMs: config.LLM_TIMEOUT_MS,
          jsonMode: config.LLM_JSON_MODE,
        }),
      );
  }
}
