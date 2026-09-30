/**
 * E-mails liés aux devis, courts et en français, chacun avec un bouton, une version texte
 * (messageries qui bloquent le HTML) et, pour ceux destinés au client, le pixel de suivi :
 * - envoi du devis au client ;
 * - relance du client, en un clic depuis l'application ;
 * - avis à l'artisan quand le client accepte ou refuse en ligne.
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

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
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

/** Mise en page commune : paragraphes, bouton, paragraphes, signature, pixel éventuel. */
function render(parts: {
  subject: string;
  before: string[];
  button: { label: string; url: string };
  after: string[];
  signature: string[];
  pixelUrl?: string;
}): EmailContent {
  const { before, button, after, signature } = parts;
  const text = [...before, `${button.label} : ${button.url}`, ...after, signature.join("\n")].join("\n\n");

  const p = (content: string) => `<p style="margin:0 0 16px">${escapeHtml(content)}</p>`;
  const pixel = parts.pixelUrl
    ? `\n  <img src="${escapeHtml(parts.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`
    : "";
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#f5f6f7;font-family:Arial,Helvetica,sans-serif;color:#16181b;font-size:15px;line-height:1.5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px 28px">
      ${before.map(p).join("\n      ")}
      <p style="margin:24px 0">
        <a href="${escapeHtml(button.url)}" style="display:inline-block;background:#0079b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:10px">${escapeHtml(button.label)}</a>
      </p>
      ${after.map(p).join("\n      ")}
      <p style="margin:24px 0 0;color:#6d6f72">${signature.map(escapeHtml).join("<br>")}</p>
    </td></tr>
  </table>${pixel}
</body>
</html>`;

  return { subject: parts.subject, html, text };
}

export function buildQuoteEmail(input: QuoteEmailInput): EmailContent {
  const amount = euros.format(input.totalTtcCents / 100);
  const validUntil = longDate.format(new Date(input.validUntil));
  const object = input.title ? ` pour « ${input.title} »` : "";
  return render({
    subject: `Votre devis ${input.quoteNumber} de ${input.companyName}`,
    before: [
      `Bonjour ${input.clientName},`,
      `Suite à notre visite, voici notre devis${object}, d'un montant de ${amount} TTC. Il est valable jusqu'au ${validUntil}.`,
    ],
    button: { label: `Voir le devis ${input.quoteNumber}`, url: input.publicUrl },
    after: [
      "Vous pouvez le consulter, l'imprimer et l'accepter en ligne depuis cette page.",
      "Pour toute question, répondez simplement à cet e-mail.",
    ],
    signature: [input.companyName, input.companyPhone].filter(Boolean),
    pixelUrl: input.pixelUrl,
  });
}

/** Relance du client : rappel poli du devis, même lien, même suivi. */
export function buildReminderEmail(input: QuoteEmailInput): EmailContent {
  const amount = euros.format(input.totalTtcCents / 100);
  const validUntil = longDate.format(new Date(input.validUntil));
  const object = input.title ? ` pour « ${input.title} »` : "";
  return render({
    subject: `Rappel : votre devis ${input.quoteNumber} de ${input.companyName}`,
    before: [
      `Bonjour ${input.clientName},`,
      `Je me permets de revenir vers vous au sujet de notre devis${object}, d'un montant de ${amount} TTC, valable jusqu'au ${validUntil}.`,
      "Avez-vous pu en prendre connaissance ? Je reste disponible pour en parler ou l'ajuster si besoin.",
    ],
    button: { label: `Voir le devis ${input.quoteNumber}`, url: input.publicUrl },
    after: ["Vous pouvez l'accepter en ligne en quelques secondes, ou simplement répondre à cet e-mail."],
    signature: [input.companyName, input.companyPhone].filter(Boolean),
    pixelUrl: input.pixelUrl,
  });
}

/** Avis à l'artisan : le client vient d'accepter ou de refuser le devis en ligne. */
export function buildResponseNotification(input: {
  decision: "accepted" | "declined";
  clientName: string;
  signedName: string;
  message: string;
  quoteNumber: string;
  title: string;
  totalTtcCents: number;
  trackingUrl: string;
}): EmailContent {
  const amount = euros.format(input.totalTtcCents / 100);
  const quote = `le devis ${input.quoteNumber}${input.title ? ` (« ${input.title} »)` : ""}`;
  const accepted = input.decision === "accepted";
  return render({
    subject: accepted
      ? `✅ ${input.clientName} a accepté le devis ${input.quoteNumber}`
      : `${input.clientName} a refusé le devis ${input.quoteNumber}`,
    before: [
      accepted
        ? `Bonne nouvelle : ${input.clientName} vient d'accepter ${quote}, d'un montant de ${amount} TTC. Signé en ligne par ${input.signedName}.`
        : `${input.clientName} a refusé ${quote}, d'un montant de ${amount} TTC.`,
      ...(input.message ? [`Son message : « ${input.message} »`] : []),
    ],
    button: { label: "Voir le suivi du devis", url: input.trackingUrl },
    after: accepted ? ["Pensez à le contacter pour caler le début des travaux."] : [],
    signature: ["Devis Vocal"],
  });
}
