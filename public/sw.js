const cachePrefix = "taehwa-document-workspace-";
const cacheName = cachePrefix + "v10";
const shell = [
  "/",
  "/index.html",
  "/portal.css",
  "/portal.js",
  "/desk-data.js",
  "/desk.js",
  "/desk.css",
  "/tool-v2.css",
  "/review.js",
  "/folder.js",
  "/modules/review.html",
  "/modules/folder.html",
  "/modules/desk.html",
  "/modules/safety.html",
  "/modules/moyang.html",
  "/documents",
  "/styles.css",
  "/app.js",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith(cachePrefix) && name !== cacheName).map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});

async function serveShell(request, path) {
  const cache = await caches.open(cacheName).catch(() => null);
  try {
    const response = await fetch(request);
    if (cache && response.ok) await cache.put(path, response.clone()).catch(() => {});
    return response;
  } catch {
    return (await cache?.match(path)) ?? Response.error();
  }
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !shell.includes(url.pathname)) return;

  event.respondWith(serveShell(request, url.pathname));
});
