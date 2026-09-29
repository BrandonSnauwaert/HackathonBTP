import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import type { Company, User } from "./api/types";
import { AppShell, type Session } from "./components/AppShell";
import { useRoute } from "./router";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { QuoteScreen } from "./screens/QuoteScreen";
import { SendScreen } from "./screens/SendScreen";
import { TrackingScreen } from "./screens/TrackingScreen";
import { VisitScreen } from "./screens/VisitScreen";

/** Application de l'artisan (maquette « Devis Vocal »). */
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [company, setCompany] = useState<Company | null>(null);
  const route = useRoute();

  useEffect(() => {
    api.me().then(
      ({ user }) => setUser(user),
      () => setUser(null),
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getCompany().then(setCompany, () => setCompany(null));
  }, [user]);

  const logout = useCallback(() => void api.logout().finally(() => setUser(null)), []);

  if (user === undefined) return <p className="loading">Chargement…</p>;
  if (user === null) return <LoginScreen onLogin={setUser} />;

  const session: Session = { user, company, logout };
  return (
    <AppShell session={session} route={route}>
      {route.name === "home" && <HomeScreen session={session} />}
      {route.name === "visit" && <VisitScreen key={route.id} quoteId={route.id} />}
      {route.name === "quote" && <QuoteScreen key={route.id} quoteId={route.id} />}
      {route.name === "send" && <SendScreen key={route.id} quoteId={route.id} company={company} />}
      {route.name === "tracking" && <TrackingScreen key={route.id} quoteId={route.id} />}
    </AppShell>
  );
}
