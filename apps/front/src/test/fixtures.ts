import type { Client, QuoteLine, QuoteSummary } from "../api/types";

/** Données de test : valeurs par défaut plausibles, à surcharger champ par champ. */

export function quoteSummary(overrides: Partial<QuoteSummary> = {}): QuoteSummary {
  return {
    id: crypto.randomUUID(),
    number: "D-2026-0001",
    status: "draft",
    statusLabel: "Brouillon",
    title: "",
    client: { id: "client-1", name: "Mme Durand" },
    totalHtCents: 0,
    totalTtcCents: 0,
    unpricedLineCount: 0,
    lineCount: 0,
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    remindedAt: null,
    reminderDue: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

export function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    name: "Mme Durand",
    email: "",
    phone: "",
    address: "",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    ...overrides,
  };
}

export function quoteLine(overrides: Partial<QuoteLine> = {}): QuoteLine {
  return {
    id: crypto.randomUUID(),
    position: 1,
    description: "Pose d'une porte",
    room: "",
    quantity: 1,
    unit: "u",
    unitLabel: "u",
    unitPriceCents: 10_000,
    vatRateBp: 1000,
    totalHtCents: 10_000,
    source: "manual",
    clipId: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
