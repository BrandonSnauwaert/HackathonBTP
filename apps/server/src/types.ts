/**
 * Champs optionnels qui acceptent aussi `undefined` explicitement : c'est ce que produit
 * zod pour `.optional()` / `.partial()`, incompatible avec `Partial<T>` sous exactOptionalPropertyTypes.
 */
export type PatchOf<T> = { [K in keyof T]?: T[K] | undefined };
