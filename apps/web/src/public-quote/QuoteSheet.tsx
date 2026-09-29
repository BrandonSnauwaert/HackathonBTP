import type { QuoteDocument } from "../api/types";
import { formatCents, formatDate, formatQuantity, formatVat } from "../format";

type Line = QuoteDocument["lines"][number];

/** Regroupe les lignes consécutives d'une même pièce, pour afficher la pièce une seule fois. */
function groupByRoom(lines: readonly Line[]): { room: string; lines: Line[] }[] {
  const groups: { room: string; lines: Line[] }[] = [];
  for (const line of lines) {
    const last = groups.at(-1);
    if (last && last.room === line.room) last.lines.push(line);
    else groups.push({ room: line.room, lines: [line] });
  }
  return groups;
}

/**
 * Le document du devis, tel qu'il est remis au client (écran et impression).
 * `signatureName` : nom en cours de saisie par le client, dessiné dans le bloc « Bon pour accord ».
 */
export function QuoteSheet({ doc, signatureName }: { doc: QuoteDocument; signatureName: string }) {
  const { company, client, totals } = doc;
  const accepted = doc.response?.decision === "accepted" ? doc.response : null;
  const signature = accepted?.name ?? signatureName.trim();

  return (
    <article className="pq-sheet">
      <header className="pq-letterhead">
        <div className="pq-company">
          <h1>{company.name}</h1>
          <p className="pq-multiline">{company.address}</p>
          <p>
            {company.phone && <span>{company.phone}</span>}
            {company.phone && company.email && <br />}
            {company.email && <span>{company.email}</span>}
          </p>
        </div>
        <div className="pq-reference">
          <h2>Devis {doc.number}</h2>
          <dl>
            <dt>Date</dt>
            <dd>{formatDate(doc.issuedAt)}</dd>
            <dt>Valable jusqu'au</dt>
            <dd>{formatDate(doc.validUntil)}</dd>
          </dl>
        </div>
      </header>

      <section className="pq-parties">
        <div>
          <h3>Client</h3>
          <p>
            <strong>{client.name}</strong>
          </p>
          {client.address && <p className="pq-multiline">{client.address}</p>}
        </div>
        {doc.siteAddress && (
          <div>
            <h3>Adresse du chantier</h3>
            <p className="pq-multiline">{doc.siteAddress}</p>
          </div>
        )}
      </section>

      {doc.title && <p className="pq-object">Objet : {doc.title}</p>}

      <table className="pq-lines">
        <thead>
          <tr>
            <th scope="col">Désignation</th>
            <th scope="col" className="pq-num">
              Quantité
            </th>
            <th scope="col" className="pq-num">
              Prix unitaire HT
            </th>
            {!totals.vatExempt && (
              <th scope="col" className="pq-num">
                TVA
              </th>
            )}
            <th scope="col" className="pq-num">
              Total HT
            </th>
          </tr>
        </thead>
        {groupByRoom(doc.lines).map((group, index) => (
          <tbody key={`${group.room}-${index}`}>
            {group.room && (
              <tr className="pq-room">
                <th scope="rowgroup" colSpan={totals.vatExempt ? 4 : 5}>
                  {group.room}
                </th>
              </tr>
            )}
            {group.lines.map((line) => (
              <tr key={line.position} className="pq-line">
                <td className="pq-designation">{line.description}</td>
                {/* Résumé compact, affiché à la place des colonnes sur téléphone. */}
                <td className="pq-summary">
                  {formatQuantity(line.quantity)} {line.unitLabel} ×{" "}
                  {line.unitPriceCents === null ? "à chiffrer" : formatCents(line.unitPriceCents)}
                  {!totals.vatExempt && `, TVA ${formatVat(line.vatRateBp)}`}
                </td>
                <td className="pq-num" data-label="Quantité">
                  {formatQuantity(line.quantity)} {line.unitLabel}
                </td>
                <td className="pq-num" data-label="Prix unitaire HT">
                  {line.unitPriceCents === null ? "à chiffrer" : formatCents(line.unitPriceCents)}
                </td>
                {!totals.vatExempt && (
                  <td className="pq-num" data-label="TVA">
                    {formatVat(line.vatRateBp)}
                  </td>
                )}
                <td className="pq-num pq-line-total" data-label="Total HT">
                  {line.totalHtCents === null ? "—" : formatCents(line.totalHtCents)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      <dl className="pq-totals">
        <dt>Total HT</dt>
        <dd>{formatCents(totals.totalHtCents)}</dd>
        {!totals.vatExempt &&
          totals.vatBreakdown.map((vat) => (
            <div key={vat.vatRateBp} className="pq-totals-row">
              <dt>TVA {formatVat(vat.vatRateBp)}</dt>
              <dd>{formatCents(vat.vatCents)}</dd>
            </div>
          ))}
        <dt className="pq-grand">Total TTC</dt>
        <dd className="pq-grand">{formatCents(totals.totalTtcCents)}</dd>
      </dl>
      {totals.vatMention && <p className="pq-note">{totals.vatMention}</p>}

      <section className="pq-conditions">
        <h3>Conditions</h3>
        <ul>
          <li>
            Devis valable {doc.validityDays} jours, jusqu'au {formatDate(doc.validUntil)}.
          </li>
          {doc.startDate && <li>Début des travaux prévu le {formatDate(doc.startDate)}.</li>}
          {doc.duration && <li>Durée estimée des travaux : {doc.duration}.</li>}
          {doc.paymentTerms && <li>{doc.paymentTerms}</li>}
        </ul>
      </section>

      {doc.photos.length > 0 && (
        <section className="pq-photos">
          <h3>Photos du chantier</h3>
          <ul>
            {doc.photos.map((photo) => (
              <li key={photo.id}>
                <figure>
                  <img src={photo.url} alt={photo.caption || "Photo du chantier"} loading="lazy" />
                  {photo.caption && <figcaption>{photo.caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pq-agreement" aria-label="Bon pour accord">
        <p>Devis reçu avant l'exécution des travaux. Bon pour accord.</p>
        <div className={`pq-signature ${accepted ? "pq-signed" : ""}`}>
          {signature ? (
            <span className="pq-signature-name">{signature}</span>
          ) : (
            <span className="pq-signature-hint">Date et signature du client</span>
          )}
        </div>
        {accepted && <p className="pq-signature-meta">Accepté en ligne le {formatDate(accepted.at)}</p>}
      </section>

      <footer className="pq-legal">
        <p>
          {company.name}
          {company.legalForm && `, ${company.legalForm}`}. SIRET {company.siret}
          {company.vatNumber && `. TVA intracommunautaire ${company.vatNumber}`}.
        </p>
        {company.insurerName && (
          <p>
            Assurance décennale : {company.insurerName}
            {company.insurancePolicyNumber && `, contrat ${company.insurancePolicyNumber}`}
            {company.insuranceCoverage && `, couverture ${company.insuranceCoverage}`}.
          </p>
        )}
      </footer>
    </article>
  );
}
