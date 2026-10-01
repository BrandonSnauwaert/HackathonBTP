import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";
import { Logo } from "../components/AppShell";

export function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  // Compte de démo pré-rempli (npm run seed:demo dans apps/server).
  const [email, setEmail] = useState("demo@artisan.test");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin((await api.login(email, password)).user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login" onSubmit={(e) => void submit(e)}>
      <div className="row start">
        <Logo size={40} />
        <span className="h2">BatiDevis</span>
      </div>
      <h1 className="h1">Connexion</h1>
      <label className="field">
        <span>E-mail</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Mot de passe</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="btn pri" disabled={busy}>
        Se connecter
      </button>
    </form>
  );
}
