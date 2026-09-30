import { useState, type CSSProperties } from "react";
import type { QuoteSummary } from "../api/types";
import { formatCents } from "../format";
import { dashboardStats, formatDays, formatRate, type DashboardStats } from "./stats";

const compactEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
/** « 12 k€ » sur les graphiques ; le montant exact reste dans l'infobulle et le tableau. */
const compact = (cents: number) => compactEuros.format(cents / 100);

/** Indicateurs : taux de signature (avec jauge), chiffre signé, délai de réponse, consultation. */
export function PerformanceTiles({ quotes }: { quotes: readonly QuoteSummary[] }) {
  const stats = dashboardStats(quotes);
  const { funnel } = stats;
  return (
    <div className="kpis">
      <div className="card kpi">
        <span className="kpi-label">Taux de signature</span>
        <span className="kpi-value">{formatRate(stats.signatureRate)}</span>
        <div
          className="meter"
          role="meter"
          aria-label="Taux de signature"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((stats.signatureRate ?? 0) * 100)}
        >
          <span style={{ width: `${(stats.signatureRate ?? 0) * 100}%` }} />
        </div>
        <span className="kpi-sub">
          {funnel.accepted} signé{funnel.accepted > 1 ? "s" : ""} sur {funnel.sent} envoyé{funnel.sent > 1 ? "s" : ""}
        </span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">Signé HT</span>
        <span className="kpi-value">{formatCents(stats.acceptedHtCents).replace(/,00\s/, " ")}</span>
        <span className="kpi-sub">devis acceptés</span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">Réponse du client</span>
        <span className="kpi-value">{formatDays(stats.avgResponseDays)}</span>
        <span className="kpi-sub">en moyenne après l'envoi</span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">Devis consultés</span>
        <span className="kpi-value">{formatRate(stats.viewRate)}</span>
        <span className="kpi-sub">ouverts par le client</span>
      </div>
    </div>
  );
}

/** Graphiques : entonnoir d'envoi à signature, chiffre signé par mois. */
export function PerformanceCharts({ quotes }: { quotes: readonly QuoteSummary[] }) {
  const stats = dashboardStats(quotes);
  if (stats.funnel.sent === 0) return null;
  return (
    <section className="perf" aria-label="Performance">
      <FunnelChart funnel={stats.funnel} />
      <MonthsChart months={stats.months} />
    </section>
  );
}

/** Envoyés → consultés → acceptés : l'étape « acceptés » en bleu (c'est l'histoire), les autres en gris. */
function FunnelChart({ funnel }: { funnel: DashboardStats["funnel"] }) {
  const rows = [
    { label: "Envoyés", value: funnel.sent, accent: false },
    { label: "Consultés", value: funnel.viewed, accent: false },
    { label: "Acceptés", value: funnel.accepted, accent: true },
  ];
  return (
    <figure className="card pad chart">
      <figcaption className="chart-title">
        <span className="b">De l'envoi à la signature</span>
        <span className="mut small">nombre de devis, depuis le début</span>
      </figcaption>
      <div className="funnel">
        {rows.map((row, i) => (
          <div key={row.label} className="funnel-row">
            <span className="funnel-label">{row.label}</span>
            <div className="funnel-track">
              <span
                className={`funnel-bar ${row.accent ? "accent" : ""}`}
                style={{ width: `${(row.value / funnel.sent) * 100}%`, animationDelay: `${i * 120}ms` }}
              />
              <span className="funnel-value">
                {row.value}
                {i > 0 && <span className="mut"> · {Math.round((row.value / funnel.sent) * 100)} %</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Chiffre signé par mois : colonnes d'une seule teinte, valeur sur le mois courant et le meilleur mois. */
function MonthsChart({ months }: { months: DashboardStats["months"] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...months.map((m) => m.acceptedHtCents), 1);
  /** Hauteur en % du tracé : le plus haut mois monte à 85 %, le reste de la place est pour son libellé. */
  const height = (cents: number) => (cents / max) * 85;
  const best = months.reduce((a, b) => (b.acceptedHtCents > a.acceptedHtCents ? b : a));
  const current = months.at(-1);
  const shown = months.find((m) => m.key === active);

  return (
    <figure className="card pad chart">
      <figcaption className="chart-title">
        <span className="b">Chiffre signé par mois</span>
        <span className="mut small">montant HT des devis acceptés, 6 derniers mois</span>
      </figcaption>
      <div className="columns" onPointerLeave={() => setActive(null)}>
        {[0.5, 1].map((f) => (
          <span key={f} className="gridline" style={{ "--f": f * 0.85 } as CSSProperties} aria-hidden="true" />
        ))}
        {months.map((m, i) => {
          const labelled = m.acceptedHtCents > 0 && (m === best || m === current);
          return (
            <button
              key={m.key}
              type="button"
              className={`column ${active === m.key ? "on" : ""}`}
              aria-label={`${m.label} : ${formatCents(m.acceptedHtCents)} HT, ${m.count} devis`}
              onPointerEnter={() => setActive(m.key)}
              onFocus={() => setActive(m.key)}
              onBlur={() => setActive(null)}
            >
              <span className="column-plot">
                <span
                  className="column-bar"
                  style={{ height: `${height(m.acceptedHtCents)}%`, animationDelay: `${i * 80}ms` }}
                />
                {/* Libellé posé au-dessus de la barre, hors du flux : la hauteur reste proportionnelle au montant. */}
                {labelled && (
                  <span className="column-value" style={{ bottom: `${height(m.acceptedHtCents)}%` }}>
                    {compact(m.acceptedHtCents)}
                  </span>
                )}
              </span>
              <span className="column-label">{m.label}</span>
            </button>
          );
        })}
        {shown && (
          <div className="chart-tip" role="status">
            <span className="b">{formatCents(shown.acceptedHtCents)} HT</span>
            <span className="mut small">
              {shown.label} · {shown.count} devis accepté{shown.count > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
      <details className="chart-table small">
        <summary>Voir les chiffres</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Mois</th>
              <th scope="col" className="r">
                Signé HT
              </th>
              <th scope="col" className="r">
                Devis
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td className="r">{formatCents(m.acceptedHtCents)}</td>
                <td className="r">{m.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
