import { useSyncExternalStore } from "react";

/** Écrans de l'application, adressés par le hash de l'URL (#/devis/…) : le bouton retour du téléphone marche. */
export type Route =
  | { name: "home" }
  | { name: "profile" }
  | { name: "clients" }
  | { name: "stats" }
  | { name: "client"; id: string }
  | { name: "visit"; id: string }
  | { name: "quote"; id: string }
  | { name: "send"; id: string }
  | { name: "tracking"; id: string };

export function parseRoute(hash: string): Route {
  const [screen, id, sub] = hash.replace(/^#\/?/, "").split("/");
  if (screen === "profil") return { name: "profile" };
  if (screen === "statistiques") return { name: "stats" };
  if (screen === "clients") return id ? { name: "client", id } : { name: "clients" };
  if (screen === "visite" && id) return { name: "visit", id };
  if (screen === "devis" && id) {
    if (sub === "envoi") return { name: "send", id };
    if (sub === "suivi") return { name: "tracking", id };
    return { name: "quote", id };
  }
  return { name: "home" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "profile":
      return "#/profil";
    case "clients":
      return "#/clients";
    case "stats":
      return "#/statistiques";
    case "client":
      return `#/clients/${route.id}`;
    case "visit":
      return `#/visite/${route.id}`;
    case "quote":
      return `#/devis/${route.id}`;
    case "send":
      return `#/devis/${route.id}/envoi`;
    case "tracking":
      return `#/devis/${route.id}/suivi`;
  }
}

/** Profondeur d'un écran dans le parcours (0 : écrans principaux) : donne le sens de l'animation de transition. */
export function routeDepth(route: Route): number {
  switch (route.name) {
    case "home":
    case "profile":
    case "clients":
    case "stats":
      return 0;
    case "client":
    case "visit":
    case "quote":
      return 1;
    case "send":
    case "tracking":
      return 2;
  }
}

export const navigate = (route: Route) => {
  window.location.hash = routePath(route);
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
