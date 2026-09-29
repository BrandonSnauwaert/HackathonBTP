/**
 * Contrat commun pour parler à un LLM. L'implémentation réelle passe par une API
 * compatible OpenAI (openai-client.ts), configurable par variables d'environnement.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  /**
   * Réponse JSON attendue. Selon LLM_JSON_MODE, le client le demande au serveur
   * (`json_object`, `json_schema` avec ce schéma) ou compte seulement sur le prompt (`none`).
   */
  json?: { name: string; schema: Record<string, unknown> };
}

export interface LlmClient {
  /** Texte de la réponse du modèle. */
  complete(messages: readonly ChatMessage[], options?: CompletionOptions): Promise<string>;
}

export class LlmError extends Error {}

/**
 * Extrait l'objet JSON d'une réponse de LLM, même entourée de ```json ... ``` ou de texte.
 * Lève une LlmError si aucun JSON valide n'est trouvé.
 */
export function parseJsonResponse(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = (fenced ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // on tombe sur l'erreur ci-dessous
      }
    }
    throw new LlmError("La réponse du LLM ne contient pas de JSON valide");
  }
}
