import { initials } from "../format";

/**
 * Logo de l'entreprise sur les devis : celui envoyé par l'artisan (« Mon entreprise »),
 * sinon un logo par défaut à ses initiales, dans le bleu de l'application.
 */
export function CompanyLogo(props: { name: string; logoUrl: string | null; size?: number; className?: string }) {
  const { name, logoUrl, size = 64 } = props;
  if (logoUrl) {
    return (
      <img
        className={`company-logo ${props.className ?? ""}`}
        src={logoUrl}
        alt={`Logo ${name}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`company-logo default ${props.className ?? ""}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      role="img"
      aria-label={`Logo ${name}`}
    >
      {initials(name || "Mon entreprise")}
    </div>
  );
}
