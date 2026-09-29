import OpenAI, { type ClientOptions } from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { LlmError, type ChatMessage, type CompletionOptions, type LlmClient } from "./llm-client.js";

export type JsonMode = "json_object" | "json_schema" | "none";

export interface OpenAiCompatibleOptions {
  /** URL de l'API, ex. https://api.openai.com/v1, http://localhost:11434/v1 (Ollama)... undefined = OpenAI. */
  baseURL: string | undefined;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  /** Comment demander du JSON au serveur (tous les serveurs compatibles ne gèrent pas json_schema). */
  jsonMode: JsonMode;
  /** Pour les tests : remplace le fetch utilisé par le SDK. */
  fetch?: ClientOptions["fetch"];
}

/** Client pour toute API compatible OpenAI (/chat/completions). */
export function createOpenAiCompatibleClient(options: OpenAiCompatibleOptions): LlmClient {
  const client = new OpenAI({
    baseURL: options.baseURL ?? null,
    // Certains serveurs locaux n'exigent pas de clé, mais le SDK en veut une.
    apiKey: options.apiKey || "no-key",
    timeout: options.timeoutMs,
    maxRetries: 2,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  function responseFormat(json: CompletionOptions["json"]): Pick<ChatCompletionCreateParamsNonStreaming, "response_format"> {
    if (!json || options.jsonMode === "none") return {};
    if (options.jsonMode === "json_object") return { response_format: { type: "json_object" } };
    return { response_format: { type: "json_schema", json_schema: { name: json.name, schema: json.schema, strict: false } } };
  }

  return {
    async complete(messages: readonly ChatMessage[], completionOptions: CompletionOptions = {}): Promise<string> {
      let response;
      try {
        response = await client.chat.completions.create({
          model: options.model,
          temperature: options.temperature,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          ...responseFormat(completionOptions.json),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new LlmError(`Appel au LLM impossible : ${detail}`);
      }
      const content = response.choices[0]?.message?.content;
      if (!content) throw new LlmError("Réponse vide du LLM");
      return content;
    },
  };
}
