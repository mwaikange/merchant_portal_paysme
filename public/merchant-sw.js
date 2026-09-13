const CACHE = "paysme-merchant-static-v2";
const SAFE_STATIC = ["/merchant-offline.html", "/merchant.webmanifest", "/pwa-logo.png", "/pwa-icon-192.png", "/pwa-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SAFE_STATIC)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("paysme-merchant-static-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match("/merchant-offline.html")));
    return;
  }

  // Never cache API/auth/function responses, portal data, exports, invoices,
  // documents, or arbitrary images. Only the explicit public shell files above
  // and immutable compiled JS/CSS/font assets are eligible.
  const isCompiledAsset = url.pathname.startsWith("/assets/") && ["script", "style", "font"].includes(request.destination);
  const isExplicitStatic = SAFE_STATIC.includes(url.pathname);
  if (!isCompiledAsset && !isExplicitStatic) return;

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
