// Lets the installed app open without internet. Online, it always fetches the newest files first
// (so updates show up right away) and keeps a copy; offline, it serves that copy.
const CACHE = "xibolete-v17", AUDIO_CACHE = "xibolete-audio-2"; // a new AUDIO_CACHE name makes everyone download re-recorded voices
const SHELL = ["./", "index.html", "data.js", "conversas.js", "historia.js", "historia-ru.js", "glossario.js", "alfabeto.js", "arte.js", "hd2d.js", "hd2d-worker.js", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !fonts) return;
  // recorded voices never change (a new line gets a new file name), so they come from the copy first
  // and are kept in their own cache, which survives app updates
  if (own && /\/audio\/.+\.mp3$/.test(url.pathname)) {
    e.respondWith(caches.open(AUDIO_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.status === 200) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
