import { describe, expect, it } from "vitest";
import { parseRoute, routeDepth, routePath, type Route } from "./router";

describe("router", () => {
  const routes: Route[] = [
    { name: "home" },
    { name: "profile" },
    { name: "clients" },
    { name: "stats" },
    { name: "client", id: "c1" },
    { name: "visit", id: "q1" },
    { name: "quote", id: "q1" },
    { name: "send", id: "q1" },
    { name: "tracking", id: "q1" },
  ];

  it.each(routes)("fait l'aller-retour adresse ↔ écran : $name", (route) => {
    expect(parseRoute(routePath(route))).toEqual(route);
  });

  it("renvoie à l'accueil pour une adresse inconnue ou incomplète", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/nimporte")).toEqual({ name: "home" });
    expect(parseRoute("#/devis")).toEqual({ name: "home" });
  });

  it("classe les écrans par profondeur dans le parcours (sens des transitions)", () => {
    expect(routeDepth({ name: "home" })).toBe(routeDepth({ name: "clients" }));
    expect(routeDepth({ name: "quote", id: "q1" })).toBeGreaterThan(routeDepth({ name: "home" }));
    expect(routeDepth({ name: "send", id: "q1" })).toBeGreaterThan(routeDepth({ name: "quote", id: "q1" }));
    expect(routeDepth({ name: "client", id: "c1" })).toBeGreaterThan(routeDepth({ name: "clients" }));
  });
});
