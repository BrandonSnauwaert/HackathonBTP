/**
 * E-mail d'envoi d'un devis au client : court, en français, avec le bouton « Voir le devis »,
 * une version texte (messageries qui bloquent le HTML) et le pixel de suivi.
 */

export interface QuoteEmailInput {
  companyName: string;
  companyPhone: string;
  clientName: string;
  quoteNumber: string;
  title: string;
  totalTtcCents: number;
  validUntil: string;
  publicUrl: string;
  pixelUrl: string;
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Échappe une valeur saisie par un utilisateur avant de l'insérer dans du HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildQuoteEmail(input: QuoteEmailInput): { subject: string; html: string; text: string } {
  const amount = euros.format(input.totalTtcCents / 100);
  const validUntil = longDate.format(new Date(input.validUntil));
  const object = input.title ? ` pour « ${input.title} »` : "";
  const subject = `Votre devis ${input.quoteNumber} de ${input.companyName}`;

  const paragraphs = [
    `Bonjour ${input.clientName},`,
    `Suite à notre visite, voici notre devis${object}, d'un montant de ${amount} TTC. Il est valable jusqu'au ${validUntil}.`,
  ];
  const after = [
    "Vous pouvez le consulter, l'imprimer et l'accepter en ligne depuis cette page.",
    "Pour toute question, répondez simplement à cet e-mail.",
  ];
  const signature = [input.companyName, input.companyPhone].filter(Boolean);

  const text = [...paragraphs, `Voir le devis : ${input.publicUrl}`, ...after, signature.join("\n")].join("\n\n");

  const p = (content: string) => `<p style="margin:0 0 16px">${escapeHtml(content)}</p>`;
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#e6e9e4;font-family:Arial,Helvetica,sans-serif;color:#1e2a30;font-size:15px;line-height:1.5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fafbf9;border-radius:4px">
    <tr><td style="padding:32px 28px">
      ${paragraphs.map(p).join("\n      ")}
      <p style="margin:24px 0">
        <a href="${escapeHtml(input.publicUrl)}" style="display:inline-block;background:#2c4e8a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:4px">Voir le devis ${escapeHtml(input.quoteNumber)}</a>
      </p>
      ${after.map(p).join("\n      ")}
      <p style="margin:24px 0 0;color:#5e6a6e">${signature.map(escapeHtml).join("<br>")}</p>
    </td></tr>
  </table>
  <img src="${escapeHtml(input.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">
</body>
</html>`;

  return { subject, html, text };
}
