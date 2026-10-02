/** Plage d'octets inclusive demandée par un en-tête `Range`. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Lit un en-tête `Range: bytes=…` pour un fichier de `size` octets.
 * Une seule plage gérée (`a-b`, `a-` ou `-n`), comme le demandent les lecteurs audio des navigateurs.
 * Renvoie `null` sans en-tête ou s'il est illisible (réponse complète), `"unsatisfiable"` si la plage sort du fichier.
 * Safari (iPhone) refuse de lire un média si le serveur ne répond pas aux plages par un 206.
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  const match = header === undefined ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}
