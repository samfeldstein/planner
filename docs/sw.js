// Precache everything, serve cache-first, never touch the network for app files after install.
// Also shows the daily push: a notification, plus the Home Screen badge from the page's forecast.
// This stays a classic script (installed phones update it as one), so it imports nothing.
// build.mjs stamps VERSION (a content hash) and ASSETS, so every release changes this file's bytes
// and installs a fresh cache. Unstamped (dev), ASSETS is empty and this worker does nothing.

const VERSION = '0631844d52';
const ASSETS = [
  "css/app.css",
  "fonts/Kalam-Regular.woff2",
  "icons/180.png",
  "icons/192.png",
  "icons/512.png",
  "index.html",
  "js/app.js",
  "js/core/badge.js",
  "js/core/clock.js",
  "js/core/date.js",
  "js/core/edit.js",
  "js/core/finished.js",
  "js/core/model.js",
  "js/core/recur.js",
  "js/core/today.js",
  "js/core/upcoming.js",
  "js/data/backup.js",
  "js/data/db.js",
  "js/data/migrations.js",
  "js/data/store.js",
  "js/features/badge.js",
  "js/features/groups.js",
  "js/features/more.js",
  "js/features/sheet.js",
  "js/features/stale-banner.js",
  "js/features/storage.js",
  "js/features/today-view.js",
  "js/features/updates.js",
  "js/ui/confirm.js",
  "js/ui/export.js",
  "js/ui/format.js",
  "js/ui/install.js",
  "js/ui/scroll-lock.js",
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

// Daily push. The page keeps a forecast of due counts in the 'badge-counts' cache (features/badge.js).
// These two copy core/badge.js and core/date.js's todayLocal; tests/badge.test.js keeps them equal.
function notificationText(n) {
  const body = n === null || n === undefined ? 'Open Planner to see today'
    : n === 0 ? 'Nothing due today'
    : `${n} ${n === 1 ? 'item' : 'items'} due today`;
  return { title: 'Planner', body };
}

function localDay(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${String(now.getFullYear()).padStart(4, '0')}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Today's count from the forecast, or null (unknown) if it is missing or unreadable.
async function todaysCount() {
  try {
    const cache = await caches.open('badge-counts');
    const res = await cache.match(abs('badge-counts.json'));
    const n = res ? (await res.json())[localDay()] : null;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

async function quietly(fn) {
  try { await fn(); } catch { /* a badge or close failure must not stop the notification */ }
}

// Every push must show a notification, or iOS drops the subscription after about three.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const n = await todaysCount();
    // An unknown count clears the badge rather than leaving an old number up.
    await quietly(() => (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()));
    await quietly(async () => {
      for (const old of await self.registration.getNotifications({ tag: 'daily' })) old.close();
    });
    const { title, body } = notificationText(n);
    await quietly(() => self.registration.showNotification(title, { body, tag: 'daily', icon: abs('icons/180.png') }));
    // The page's Badge block warns when no push has come for over 26 hours.
    await quietly(async () => {
      const cache = await caches.open('badge-counts');
      await cache.put(abs('badge-last-push.json'), new Response(JSON.stringify(new Date().toISOString()), { headers: { 'content-type': 'application/json' } }));
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    await quietly(async () => {
      const open = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))[0];
      if (open) await open.focus();
      else await self.clients.openWindow(abs('./'));
    });
  })());
});
