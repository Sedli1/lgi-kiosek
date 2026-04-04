const CACHE = "lgi-kiosek-v1";
const OFFLINE_QUEUE_KEY = "lgi-offline-queue";

// Cache the kiosk shell on install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(["/", "/manifest.json"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for API calls, cache-first for static assets
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Pass through non-GET and API calls
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    return;
  }

  // Cache-first for static, network-first for pages
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|jpg|svg|ico|woff2?)$/)) {
    e.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }))
    );
    return;
  }

  // Network-first for pages, fall back to cache
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  );
});

// Background sync: flush offline registration queue
self.addEventListener("sync", (e) => {
  if (e.tag === "flush-registrations") {
    e.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: "flush-queue" });
  }
}
