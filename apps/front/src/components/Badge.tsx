import type { ReactNode } from "react";
import type { QuoteStatus } from "../api/types";
import { STATUS_ICON, STATUS_TONE, type Tone } from "../quotes/status";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`bdg ${tone}`}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: QuoteStatus; label: string }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {label}
    </Badge>
  );
}
