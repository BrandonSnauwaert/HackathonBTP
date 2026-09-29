import type { SwaggerTransformObject } from "@fastify/swagger";
import { jsonSchemaTransformObject } from "fastify-type-provider-zod";

const SCHEMA_REF = "#/components/schemas/";

/** Noms des composants référencés (`$ref`) dans une valeur JSON quelconque. */
function collectRefs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string" && child.startsWith(SCHEMA_REF)) {
        into.add(child.slice(SCHEMA_REF.length));
      } else {
        collectRefs(child, into);
      }
    }
  }
}

/**
 * fastify-type-provider-zod génère chaque schéma nommé en version entrée (`XInput`)
 * et sortie (`X`), même si une seule sert. On ne garde que les composants
 * réellement utilisés par les routes, pour une doc lisible.
 */
export const transformObject: SwaggerTransformObject = (input) => {
  const document = jsonSchemaTransformObject(input);
  // Uniquement pour un document OpenAPI 3 (pas Swagger 2) qui a des composants.
  if (!("components" in document) || !document.components?.schemas) return document;
  const components = document.components;
  const schemas = components.schemas ?? {};

  const used = new Set<string>();
  collectRefs(document.paths, used);
  // Fermeture transitive : un schéma utilisé peut en référencer d'autres.
  const queue = [...used];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined) break;
    const nested = new Set<string>();
    collectRefs(schemas[name], nested);
    for (const ref of nested) {
      if (!used.has(ref)) {
        used.add(ref);
        queue.push(ref);
      }
    }
  }

  components.schemas = Object.fromEntries(Object.entries(schemas).filter(([name]) => used.has(name)));
  return document;
};
