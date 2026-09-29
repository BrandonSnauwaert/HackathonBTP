const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export const formatCents = (cents: number) => euros.format(cents / 100);
export const formatQuantity = (quantity: number) => decimal.format(quantity);
export const formatVat = (bp: number) => `${decimal.format(bp / 100)} %`;
export const formatTime = (iso: string) => time.format(new Date(iso));
/** "29 septembre 2026" ; accepte une date ISO complète ou AAAA-MM-JJ. */
export const formatDate = (iso: string) => longDate.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
export const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/** Centimes → valeur d'un champ de saisie en euros ("12,50"). */
export const centsToInput = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** Saisie en euros ("12,5", "1 200.00") → centimes ; null si vide, undefined si invalide. */
export function parseEuros(value: string): number | null | undefined {
  const normalized = value.replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (normalized === "") return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : undefined;
}
