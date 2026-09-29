import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LlmError, parseJsonResponse, type ChatMessage, type LlmClient } from "./llm-client.js";
import { createLlmLineExtractor, mockLineExtractor, normalizeUnit, normalizeVatRate } from "./line-extractor.js";
import { createOpenAiCompatibleClient } from "./openai-client.js";

/** Faux LLM qui renvoie les réponses prévues, dans l'ordre, et garde les messages reçus. */
function fakeLlm(responses: string[]): LlmClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async complete(messages) {
      calls.push([...messages]);
      const next = responses.shift();
      if (next === undefined) throw new Error("plus de réponse prévue");
      return next;
    },
  };
}

const input = {
  transcript: "Dans la cuisine il faut changer la porte et faire un ragréage de 12 m².",
  existingLines: [],
};

describe("parseJsonResponse", () => {
  it("accepte du JSON brut, entouré de ```json ou de texte", () => {
    assert.deepEqual(parseJsonResponse('{"a":1}'), { a: 1 });
    assert.deepEqual(parseJsonResponse('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonResponse('Voici : {"a":1} Bonne journée'), { a: 1 });
    assert.throws(() => parseJsonResponse("pas de json"), LlmError);
  });
});

describe("normalisation", () => {
  it("reconnaît les unités sous plusieurs formes", () => {
    assert.equal(normalizeUnit("m²"), "m2");
    assert.equal(normalizeUnit("Mètres linéaires"), "ml");
    assert.equal(normalizeUnit("forfait"), "forfait");
    assert.equal(normalizeUnit("inconnue"), "u");
  });

  it("convertit les taux de TVA en points de base", () => {
    assert.equal(normalizeVatRate(20), 2000);
    assert.equal(normalizeVatRate("5,5 %"), 550);
    assert.equal(normalizeVatRate(0.1), 1000);
    assert.equal(normalizeVatRate(1000), 1000);
    assert.equal(normalizeVatRate("n'importe quoi"), 1000);
  });
});

describe("createLlmLineExtractor", () => {
  it("extrait et normalise les lignes", async () => {
    const llm = fakeLlm([
      JSON.stringify({
        lines: [
          { description: "Remplacement de la porte", room: "Cuisine", quantity: 1, unit: "u", vatRate: 10 },
          { description: "Ragréage du sol", room: "Cuisine", quantity: "12", unit: "m²", vatRate: "10" },
        ],
        missing: ["Dimensions de la porte"],
      }),
    ]);
    const result = await createLlmLineExtractor(llm).extract(input);
    assert.deepEqual(result.lines[1], {
      description: "Ragréage du sol",
      room: "Cuisine",
      quantity: 12,
      unit: "m2",
      vatRateBp: 1000,
    });
    assert.deepEqual(result.warnings, ["Dimensions de la porte"]);
    assert.match(llm.calls[0]?.[1]?.content ?? "", /ragréage de 12 m²/);
  });

  it("redemande une fois si la réponse est invalide", async () => {
    const llm = fakeLlm([
      "Désolé, je ne peux pas.",
      '{"lines":[{"description":"Porte","quantity":1,"unit":"u","vatRate":20}]}',
    ]);
    const result = await createLlmLineExtractor(llm).extract(input);
    assert.equal(result.lines.length, 1);
    assert.equal(llm.calls.length, 2);
    assert.match(llm.calls[1]?.at(-1)?.content ?? "", /Réponse invalide/);
  });

  it("abandonne après deux réponses invalides", async () => {
    const llm = fakeLlm(["non", '{"lines":[{"quantity":1}]}']);
    await assert.rejects(createLlmLineExtractor(llm).extract(input), LlmError);
  });
});

describe("createOpenAiCompatibleClient", () => {
  it("appelle /chat/completions avec le modèle, la clé et le format JSON configurés", async () => {
    const requests: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), auth: headers.get("authorization"), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          id: "x",
          object: "chat.completion",
          created: 0,
          model: "test-model",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const client = createOpenAiCompatibleClient({
      baseURL: "http://llm.local/v1",
      apiKey: "secret",
      model: "test-model",
      temperature: 0.2,
      timeoutMs: 5000,
      jsonMode: "json_object",
      fetch: fakeFetch,
    });

    const text = await client.complete([{ role: "user", content: "Bonjour" }], { json: { name: "t", schema: {} } });
    assert.equal(text, '{"ok":true}');
    assert.equal(requests[0]?.url, "http://llm.local/v1/chat/completions");
    assert.equal(requests[0]?.auth, "Bearer secret");
    assert.equal(requests[0]?.body.model, "test-model");
    assert.deepEqual(requests[0]?.body.response_format, { type: "json_object" });
  });
});

describe("mockLineExtractor", () => {
  it("fait une ligne par phrase utile", async () => {
    const result = await mockLineExtractor.extract({
      transcript:
        "Bonjour madame. Dans la cuisine il faut un ragréage de 12 m². Pour la salle de bain, on change le lavabo.",
      existingLines: [],
    });
    assert.equal(result.lines.length, 2);
    assert.deepEqual(
      { room: result.lines[0]?.room, quantity: result.lines[0]?.quantity, unit: result.lines[0]?.unit },
      { room: "Cuisine", quantity: 12, unit: "m2" },
    );
    assert.equal(result.lines[1]?.room, "Salle de bain");
  });
});
