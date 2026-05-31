// Service worker minimal pour rendre TS Live Stream installable (PWA).
// L'app a besoin du réseau (Supabase, WebRTC), donc on ne met pas en cache agressif.
const CACHE = "ts-live-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Stratégie réseau d'abord (l'app est temps réel). Le handler est requis pour l'installabilité.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
