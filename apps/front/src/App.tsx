import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import type { Company, User } from "./api/types";
import { AppShell, type Session } from "./components/AppShell";
import { useRoute } from "./router";
import { ClientScreen, ClientsScreen } from "./screens/ClientsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { QuoteScreen } from "./screens/QuoteScreen";
import { SendScreen } from "./screens/SendScreen";
import { TrackingScreen } from "./screens/TrackingScreen";
import { VisitScreen } from "./screens/VisitScreen";

/**
 * Session gardée sur le téléphone : l'application rouverte sans réseau (sur le chantier)
 * reste connectée au lieu d'afficher l'écran de connexion. Le serveur reste seul juge au retour du réseau.
 */
const SESSION_KEY = "devis-vocal:session";

function readSession(): { user: User; company: Company | null } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { user: User; company: Company | null }) : null;
  } catch {
    return null;
  }
}

function writeSession(session: { user: User; company: Company | null } | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : seul le mode hors connexion en pâtit.
  }
}

const isOffline = (err: unknown) => err instanceof ApiError && err.status === 0;

/** Application de l'artisan (maquette « Devis Vocal »). */
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [company, setCompany] = useState<Company | null>(null);
  const route = useRoute();

  useEffect(() => {
    api.me().then(
      ({ user }) => setUser(user),
      (err: unknown) => {
        const saved = isOffline(err) ? readSession() : null;
        setUser(saved?.user ?? null);
        setCompany(saved?.company ?? null);
      },
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getCompany().then(setCompany, (err: unknown) => {
      if (!isOffline(err)) setCompany(null);
    });
  }, [user]);

  useEffect(() => {
    if (user) writeSession({ user, company });
  }, [user, company]);

  const logout = useCallback(
    () =>
      void api.logout().finally(() => {
        writeSession(null);
        setUser(null);
      }),
    [],
  );

  if (user === undefined) return <p className="loading">Chargement…</p>;
  if (user === null) return <LoginScreen onLogin={setUser} />;

  const session: Session = { user, company, logout };
  return (
    <AppShell session={session} route={route}>
      {route.name === "home" && <HomeScreen session={session} />}
      {route.name === "clients" && <ClientsScreen />}
      {route.name === "client" && <ClientScreen key={route.id} clientId={route.id} />}
      {route.name === "profile" && <ProfileScreen session={session} onSaved={setCompany} />}
      {route.name === "visit" && <VisitScreen key={route.id} quoteId={route.id} />}
      {route.name === "quote" && <QuoteScreen key={route.id} quoteId={route.id} />}
      {route.name === "send" && <SendScreen key={route.id} quoteId={route.id} company={company} />}
      {route.name === "tracking" && <TrackingScreen key={route.id} quoteId={route.id} />}
    </AppShell>
  );
}
