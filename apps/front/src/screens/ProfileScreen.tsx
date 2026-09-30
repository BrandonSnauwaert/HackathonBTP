import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api/client";
import type { Company } from "../api/types";
import type { Session } from "../components/AppShell";
import { errorMessage } from "../quotes/useQuote";
import { navigate } from "../router";
import { useTheme, type ThemeChoice } from "../theme";

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "auto", label: "Automatique" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

/** Réglé sur le téléphone, pas sur le serveur : enregistré tout de suite, hors du bouton « Enregistrer ». */
function ThemeSection() {
  const [theme, setTheme] = useTheme();
  return (
    <Section title="Affichage" hint="Automatique : suit le réglage clair ou sombre du téléphone.">
      <div className="seg" role="radiogroup" aria-label="Thème">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            className={theme === t.value ? "on" : ""}
            onClick={() => setTheme(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

type CompanyForm = Omit<Company, "updatedAt">;

const toForm = ({ updatedAt: _updatedAt, ...form }: Company): CompanyForm => form;

/** Champs modifiés seulement : l'API accepte un profil partiel. */
function changes(form: CompanyForm, saved: CompanyForm): Partial<CompanyForm> {
  const keys = Object.keys(form) as (keyof CompanyForm)[];
  return Object.fromEntries(keys.filter((k) => form[k] !== saved[k]).map((k) => [k, form[k]]));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card pad">
      <div>
        <h2 className="b">{title}</h2>
        {hint && <p className="mut small">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Mon entreprise : coordonnées et mentions légales imprimées sur chaque devis
 * (SIRET, TVA, assurance décennale), valeurs par défaut des nouveaux devis.
 */
export function ProfileScreen({ session, onSaved }: { session: Session; onSaved: (company: Company) => void }) {
  if (!session.company) return <p className="loading">Chargement…</p>;
  return <ProfileForm session={session} company={session.company} onSaved={onSaved} />;
}

function ProfileForm(props: { session: Session; company: Company; onSaved: (company: Company) => void }) {
  const { session, company, onSaved } = props;
  const saved = toForm(company);
  const [form, setForm] = useState<CompanyForm>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const diff = changes(form, saved);
  const dirty = Object.keys(diff).length > 0;
  const validityOk = Number.isInteger(form.defaultValidityDays) && form.defaultValidityDays >= 1;

  const set = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDone(false);
  };
  const text = (key: { [K in keyof CompanyForm]: CompanyForm[K] extends string ? K : never }[keyof CompanyForm]) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || !validityOk) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCompany(diff);
      onSaved(updated);
      setForm(toForm(updated));
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="screen profile" onSubmit={(e) => void submit(e)}>
      <header className="hd">
        <button type="button" className="back only-mobile" onClick={() => navigate({ name: "home" })}>
          ‹ Accueil
        </button>
        <h1 className="h1">Mon entreprise</h1>
        <div className="mut">Ces informations apparaissent sur tous vos devis.</div>
      </header>

      <div className="bd profile-body">
        <Section title="Coordonnées">
          <label className="field">
            <span>Nom commercial ou raison sociale</span>
            <input autoComplete="organization" {...text("name")} />
          </label>
          <label className="field">
            <span>Forme juridique</span>
            <input placeholder="EI, SARL au capital de 5 000 €…" {...text("legalForm")} />
          </label>
          <label className="field">
            <span>Adresse</span>
            <textarea rows={2} autoComplete="street-address" {...text("address")} />
          </label>
          <div className="field-row wrap">
            <label className="field">
              <span>Téléphone</span>
              <input type="tel" autoComplete="tel" {...text("phone")} />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" autoComplete="email" {...text("email")} />
            </label>
          </div>
          <p className="mut small">Les réponses de vos clients arrivent sur cette adresse e-mail.</p>
        </Section>

        <Section title="Identification et TVA">
          <label className="field">
            <span>SIRET</span>
            <input inputMode="numeric" placeholder="14 chiffres" {...text("siret")} />
          </label>
          <div className="seg" role="radiogroup" aria-label="Régime de TVA">
            <button
              type="button"
              role="radio"
              aria-checked={!form.vatExempt}
              className={form.vatExempt ? "" : "on"}
              onClick={() => set("vatExempt", false)}
            >
              Assujetti à la TVA
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={form.vatExempt}
              className={form.vatExempt ? "on" : ""}
              onClick={() => set("vatExempt", true)}
            >
              Franchise de TVA
            </button>
          </div>
          {form.vatExempt ? (
            <p className="card flat small">
              Aucune TVA sur vos devis. La mention « TVA non applicable, art. 293 B du CGI » est ajoutée
              automatiquement.
            </p>
          ) : (
            <label className="field">
              <span>N° de TVA intracommunautaire</span>
              <input placeholder="FR…" {...text("vatNumber")} />
            </label>
          )}
        </Section>

        <Section title="Assurance décennale" hint="Obligatoire sur les devis de travaux.">
          <div className="field-row wrap">
            <label className="field">
              <span>Assureur</span>
              <input {...text("insurerName")} />
            </label>
            <label className="field">
              <span>N° de contrat</span>
              <input {...text("insurancePolicyNumber")} />
            </label>
          </div>
          <label className="field">
            <span>Couverture géographique</span>
            <input placeholder="France métropolitaine" {...text("insuranceCoverage")} />
          </label>
        </Section>

        <Section title="Nouveaux devis" hint="Valeurs proposées par défaut, modifiables sur chaque devis.">
          <label className="field">
            <span>Durée de validité (jours)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={Number.isNaN(form.defaultValidityDays) ? "" : form.defaultValidityDays}
              onChange={(e) => set("defaultValidityDays", e.target.valueAsNumber)}
            />
          </label>
          <label className="field">
            <span>Conditions de paiement</span>
            <textarea
              rows={2}
              placeholder="30 % d'acompte à la signature, solde à la fin des travaux"
              {...text("defaultPaymentTerms")}
            />
          </label>
        </Section>

        <ThemeSection />

        <section className="card flat row">
          <span className="grow mut small">Connecté en tant que {session.user.email}</span>
          <button type="button" className="link" onClick={session.logout}>
            Se déconnecter
          </button>
        </section>
      </div>

      <footer className="ft profile-ft">
        {error && <p className="error-text">{error}</p>}
        {!validityOk && (
          <p className="warn-text small">La durée de validité doit être comprise entre 1 et 365 jours.</p>
        )}
        <button
          type="submit"
          className={`btn ${dirty && validityOk && !busy ? "pri" : "dis"}`}
          disabled={!dirty || !validityOk || busy}
        >
          {busy ? "Enregistrement…" : done && !dirty ? "✓ Enregistré" : "Enregistrer"}
        </button>
      </footer>
    </form>
  );
}
