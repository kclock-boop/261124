const cachePrefix = "taehwa-pages-/261124/v4/-";
const cacheName = cachePrefix + "v19";
const shell = [
  "/261124/v4/",
  "/261124/v4/index.html",
  "/261124/v4/documents.html",
  "/261124/v4/portal.css",
  "/261124/v4/portal.js",
  "/261124/v4/desk-data.js",
  "/261124/v4/desk.css",
  "/261124/v4/desk.js",
  "/261124/v4/modules/desk.html",
  "/261124/v4/modules/safety.html",
  "/261124/v4/modules/moyang.html",
  "/261124/v4/modules/folder.html",
  "/261124/v4/tool-v2.css",
  "/261124/v4/folder.js",
  "/261124/v4/styles.css",
  "/261124/v4/app.js",
  "/261124/v4/manifest.webmanifest",
  "/261124/v4/favicon.svg",
  "/261124/v4/icon-192.png",
  "/261124/v4/icon-512.png",
  "/261124/v4/harbor-intro.jpg",
  "/261124/v4/taehwa-logo.png",
  "/261124/v4/ai-training-center.png",
  "/261124/v4/hrdk-logo.png",
  "/261124/v4/modules/desk-participant-v3.html",
  "/261124/v4/modules/safety-participant-v4.html",
  "/261124/v4/modules/inventory.html",
  "/261124/v4/inventory.css",
  "/261124/v4/inventory.js",
  "/261124/v4/inventory-data.js",
  "/261124/v4/modules/inventory-participant-v4.html"
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
