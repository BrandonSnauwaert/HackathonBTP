const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const formatCents = (cents: number) => euros.format(cents / 100);
export const formatQuantity = (quantity: number) => decimal.format(quantity);
export const formatVat = (bp: number) => `${decimal.format(bp / 100)} %`;
export const formatTime = (iso: string) => time.format(new Date(iso));
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

const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const dayTime = new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « Vendredi 25 septembre » */
export const formatToday = (date = new Date()) => capitalize(longDay.format(date));
/** « 22/09 » */
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
/** « Jeudi 18:40 » */
export const formatDayTime = (iso: string) => capitalize(dayTime.format(new Date(iso)));
/** « 22 septembre 2026 » */
export const formatFullDate = (iso: string) => fullDate.format(new Date(iso));
/** Chronomètre « 01:05 » */
export const formatClock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

/** « à l'instant », « il y a 5 min », « hier à 18:40 », « il y a 3 jours » */
export function formatRelative(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const hour = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `aujourd'hui à ${hour}`;
  if (days === 1) return `hier à ${hour}`;
  return `il y a ${days} jours`;
}

/** « Martin Rénovation » → « MR » (avatar) */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "?";
