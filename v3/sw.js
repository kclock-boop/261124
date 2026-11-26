const cachePrefix = "taehwa-pages-/261124/v3/-";
const cacheName = cachePrefix + "v19";
const shell = [
  "/261124/v3/",
  "/261124/v3/index.html",
  "/261124/v3/documents.html",
  "/261124/v3/portal.css",
  "/261124/v3/portal.js",
  "/261124/v3/desk-data.js",
  "/261124/v3/desk.css",
  "/261124/v3/desk.js",
  "/261124/v3/modules/desk.html",
  "/261124/v3/modules/safety.html",
  "/261124/v3/modules/moyang.html",
  "/261124/v3/modules/folder.html",
  "/261124/v3/tool-v2.css",
  "/261124/v3/folder.js",
  "/261124/v3/styles.css",
  "/261124/v3/app.js",
  "/261124/v3/manifest.webmanifest",
  "/261124/v3/favicon.svg",
  "/261124/v3/icon-192.png",
  "/261124/v3/icon-512.png",
  "/261124/v3/harbor-intro.jpg",
  "/261124/v3/taehwa-logo.png",
  "/261124/v3/ai-training-center.png",
  "/261124/v3/hrdk-logo.png",
  "/261124/v3/modules/desk-participant-v3.html",
  "/261124/v3/modules/safety-participant.html",
  "/261124/v3/modules/inventory.html",
  "/261124/v3/inventory.css",
  "/261124/v3/inventory.js",
  "/261124/v3/inventory-data.js"
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
