// Service worker: tải sẵn toàn bộ app khi cài để dùng offline.
// Có mạng: lấy bản mới (chờ tối đa NETWORK_TIMEOUT), không có/chậm: dùng bản đã lưu.
// Đổi VERSION khi thêm/bớt file trong ASSETS.
const VERSION = "v3";
const CACHE = `ai-fundamentals-${VERSION}`;
const NETWORK_TIMEOUT = 3500;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./questions.js",
  "./dictionary.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  const network = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(network.catch(() => {})); // vẫn cập nhật cache dù đã trả bản cũ do mạng chậm

  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
  e.respondWith(
    Promise.race([network, timeout])
      .then((res) => res || fromCache(req).then((cached) => cached || network))
      .catch(() => fromCache(req))
      .then((res) => res || new Response("Offline", { status: 503, statusText: "Offline" }))
  );
});
