// Precache everything, serve cache-first, never touch the network for app files after install.
// build.mjs stamps VERSION (a content hash) and ASSETS, so every release changes this file's bytes
// and installs a fresh cache. Unstamped (dev), ASSETS is empty and this worker does nothing.

const VERSION = '1ee8480835';
const ASSETS = [
  "css/app.css",
  "fonts/Kalam-Regular.woff2",
  "icons/180.png",
  "icons/192.png",
  "icons/512.png",
  "index.html",
  "js/app.js",
  "js/core/clock.js",
  "js/core/date.js",
  "js/core/model.js",
  "js/core/recur.js",
  "js/core/today.js",
  "js/data/backup.js",
  "js/data/db.js",
  "js/data/migrations.js",
  "js/data/store.js",
  "js/features/groups.js",
  "js/features/more.js",
  "js/features/sheet.js",
  "js/features/stale-banner.js",
  "js/features/storage.js",
  "js/features/toast.js",
  "js/features/today-view.js",
  "js/features/updates.js",
  "js/ui/confirm.js",
  "js/ui/export.js",
  "js/ui/format.js",
  "js/ui/install.js",
  "js/version.js",
  "manifest.webmanifest"
];
const CACHE = `planner-${VERSION}`;

const abs = (path) => new URL(path, self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fetch past GitHub Pages' fixed 10-minute cache; any failure fails the install and keeps the old version.
    await Promise.all(ASSETS.map(async (path) => {
      const res = await fetch(new Request(`${abs(path)}?v=${VERSION}`, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      await cache.put(abs(path), res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('planner-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// The page asks for this once it is safe to switch versions.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!ASSETS.length || req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? abs('index.html') : req.url);
    return hit ?? fetch(req);
  })());
});
