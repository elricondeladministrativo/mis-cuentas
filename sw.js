// Guarda la app en el teléfono para que funcione sin internet.
// También guarda los lectores de PDF y de fotos la primera vez que se usan.
const VERSION = "mis-cuentas-v1";
const FILES = ["./", "./index.html", "./app.js", "./parser.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "lectores").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Lectores de PDF/OCR y el idioma español: no cambian, se guardan para siempre.
  if (url.origin !== location.origin) {
    e.respondWith(caches.open("lectores").then(c => c.match(req).then(hit => hit ||
      fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }))));
    return;
  }

  // Archivos de la app: primero internet (versión nueva), si no hay, la guardada.
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.mode === "navigate" ? "./" : req, copy)); } return res; })
      .catch(() => caches.match(req.mode === "navigate" ? "./" : req, { ignoreSearch: true }))
  );
});
