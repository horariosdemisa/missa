// Permite instalar la página como app y abrirla aunque falle el internet.
// Siempre intenta traer lo más nuevo; si no hay conexión, usa la última copia.
const CACHE = "missa-v1";
const BASE = ["./", "index.html", "styles.css", "app.js", "config.js", "mexico.js", "filtro.js", "manifest.webmanifest", "iconos/icono-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  const propio = new URL(r.url).origin === location.origin;
  const libreria = r.url.startsWith("https://cdn.jsdelivr.net/");
  if (r.method !== "GET" || !(propio || libreria)) return; // los horarios siempre se piden en vivo
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
