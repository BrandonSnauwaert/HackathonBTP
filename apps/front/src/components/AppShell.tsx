import { useEffect, useState, type ReactNode } from "react";
import type { Company, User } from "../api/types";
import { initials } from "../format";
import { useClipQueue } from "../offline/clipQueue";
import { navigate, routeDepth, routePath, type Route } from "../router";

export interface Session {
  user: User;
  company: Company | null;
  logout: () => void;
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div className="ic logo" style={{ width: size, height: size }}>
      BD
    </div>
  );
}

type Direction = "forward" | "back" | "fade";

/**
 * Animation de changement d'écran, selon le sens du parcours : vers un écran plus profond (devis → envoi),
 * il arrive de la droite ; en revenant, de la gauche ; entre écrans principaux (accueil, clients…), fondu.
 * L'écran repart en haut de page.
 */
function PageTransition({ route, children }: { route: Route; children: ReactNode }) {
  const path = routePath(route);
  const depth = routeDepth(route);
  const [current, setCurrent] = useState({ path, depth, direction: "fade" as Direction });
  if (current.path !== path) {
    const direction = depth > current.depth ? "forward" : depth < current.depth ? "back" : "fade";
    setCurrent({ path, depth, direction });
  }

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  return (
    <div key={path} className={`page page-${current.direction}`}>
      {children}
    </div>
  );
}

/** Bandeau hors connexion : l'artisan sait que ses dictées sont gardées et partiront seules. */
function OfflineBanner() {
  const { online, clips, sending } = useClipQueue();
  const waiting = clips.filter((c) => c.error === null).length;
  if (online && waiting === 0) return null;
  const count = `${waiting} dictée${waiting > 1 ? "s" : ""}`;
  return (
    <div className={`offline-banner ${online ? "syncing" : ""}`} role="status">
      {online
        ? `${sending ? "Envoi" : "Envoi en attente"} : ${count}`
        : waiting > 0
          ? `Hors connexion · ${count} en attente, envoi automatique au retour du réseau`
          : "Hors connexion · vos dictées sont gardées sur le téléphone"}
    </div>
  );
}

/** Cadre de l'application : barre latérale sur ordinateur, plein écran sur téléphone. */
export function AppShell({ session, route, children }: { session: Session; route: Route; children: ReactNode }) {
  const companyName = session.company?.name || session.user.email;
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <Logo size={34} />
          <span className="b">BatiDevis</span>
        </div>
        <button className={`nav ${route.name === "home" ? "on" : ""}`} onClick={() => navigate({ name: "home" })}>
          Accueil
        </button>
        <button
          className={`nav ${route.name === "clients" || route.name === "client" ? "on" : ""}`}
          onClick={() => navigate({ name: "clients" })}
        >
          Clients
        </button>
        <button className={`nav ${route.name === "stats" ? "on" : ""}`} onClick={() => navigate({ name: "stats" })}>
          Statistiques
        </button>
        <button className={`nav ${route.name === "profile" ? "on" : ""}`} onClick={() => navigate({ name: "profile" })}>
          Mon entreprise
        </button>
        <div className="side-user">
          <div className="ic avatar">{initials(companyName)}</div>
          <div className="side-user-text">
            <div className="b">{companyName}</div>
            <button className="link" onClick={session.logout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <OfflineBanner />
        <PageTransition route={route}>{children}</PageTransition>
      </main>
    </div>
  );
}
