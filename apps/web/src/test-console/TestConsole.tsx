import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { QuoteSummary, User } from "../api/types";
import { formatCents } from "../format";
import { QuoteView } from "./QuoteView";

/**
 * Page de test de l'API (pas l'interface finale) : connexion, devis, dictées talkie-walkie.
 */
export default function TestConsole() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(
      ({ user }) => setUser(user),
      () => setUser(null),
    );
  }, []);

  if (user === undefined) return <p className="panel">Chargement…</p>;
  if (user === null) return <LoginForm onLogin={setUser} />;
  return <Workspace user={user} onLogout={() => void api.logout().finally(() => setUser(null))} />;
}

function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("demo@artisan.test");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onLogin((await api.login(email, password)).user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    }
  };

  return (
    <form className="panel login" onSubmit={(e) => void submit(e)}>
      <h2>Connexion</h2>
      <p className="muted">Compte de démo pré-rempli (créé par npm run seed:demo).</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="primary">
        Se connecter
      </button>
    </form>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void api.listQuotes().then(setQuotes, () => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className="workspace">
      <aside className="panel sidebar">
        <div className="sidebar-head">
          <span className="muted">{user.email}</span>
          <button className="link" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
        <NewQuoteForm
          onCreated={(id) => {
            refresh();
            setSelectedId(id);
          }}
        />
        <ul className="quote-list">
          {quotes.map((q) => (
            <li key={q.id}>
              <button className={q.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(q.id)}>
                <span className="quote-list-top">
                  <strong>{q.number}</strong>
                  <span className={`badge badge-${q.status}`}>{q.statusLabel}</span>
                </span>
                <span>{q.client.name}</span>
                <span className="muted">
                  {q.title || "Sans titre"} · {formatCents(q.totalTtcCents)} TTC
                  {q.unpricedLineCount > 0 && ` · ${q.unpricedLineCount} à chiffrer`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selectedId ? (
        <QuoteView key={selectedId} quoteId={selectedId} onChanged={refresh} />
      ) : (
        <section className="panel quote muted">Choisissez un devis ou créez-en un.</section>
      )}
    </div>
  );
}

function NewQuoteForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const quote = await api.createQuote(email ? { name, email } : { name }, title);
      setName("");
      setEmail("");
      setTitle("");
      onCreated(quote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
    }
  };

  return (
    <form className="new-quote" onSubmit={(e) => void submit(e)}>
      <strong>Nouveau devis</strong>
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du client" />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail du client" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (ex. Rénovation cuisine)" />
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="primary">
        Créer
      </button>
    </form>
  );
}
