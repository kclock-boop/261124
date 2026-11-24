const cachePrefix = "taehwa-pages-/261124/-";
const cacheName = cachePrefix + "v4";
const shell = [
  "/261124/",
  "/261124/index.html",
  "/261124/portal.css",
  "/261124/portal.js",
  "/261124/desk-data.js",
  "/261124/desk.js",
  "/261124/desk.css",
  "/261124/modules/desk.html",
  "/261124/modules/safety.html",
  "/261124/modules/moyang.html",
  "/261124/documents.html",
  "/261124/styles.css",
  "/261124/app.js",
  "/261124/favicon.svg",
  "/261124/manifest.webmanifest",
  "/261124/icon-192.png",
  "/261124/icon-512.png"
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
