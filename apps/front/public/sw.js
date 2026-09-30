// Service worker de l'application de l'artisan : ouverture hors connexion.
// Réseau d'abord (jamais de version périmée quand le réseau est là), cache en secours.
// L'API n'est pas mise en cache : les dictées hors connexion passent par IndexedDB (src/offline/clipQueue.ts).
const CACHE = "devis-vocal-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/(api|docs|d|apercu)(\/|$)/.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        if (cached) return cached;
        // Page de l'application demandée hors connexion : la page d'accueil en cache fait l'affaire (routes en #).
        if (request.mode === "navigate") return (await caches.match("/")) ?? Response.error();
        return Response.error();
      }),
  );
});
