// The Home Screen badge and the daily push. The page sets the badge from today's due count and keeps a
// 31-day forecast in Cache Storage for the service worker's push handler (sw.js). The Badge block on the
// More screen turns the push on and off. It stays hidden until the push Worker is deployed (PUSH_URL and
// VAPID_PUBLIC below), and the CSP's connect-src in index.html must name PUSH_URL's origin.

import { base64UrlToBytes, dueCount, forecast } from '../core/badge.js';

export const PUSH_URL = '';
export const VAPID_PUBLIC = '';

const HOUR = 7;
const REPOST_AFTER = 12 * 36e5;
const CACHE = 'badge-counts';
const KEY = './badge-counts.json';
const LAST_PUSH = './badge-last-push.json'; // written by sw.js on every push
const TURNED_ON = './badge-turned-on.json';
const SILENT_AFTER = 26 * 36e5;

const TEXT = {
  off: "Show today's todo count on the app icon.",
  on: 'On. A notification comes each morning at 7.',
  denied: 'Notifications are off for Planner. Turn them on in Settings, then try again.',
  error: "Couldn't turn on the badge. Try again.",
  silent: 'No morning notification came today. Turn the badge off and on again.',
};

const quietly = (fn) => { try { return Promise.resolve(fn()).catch(() => {}); } catch { return Promise.resolve(); } };

// The page badge: set from today's count; skipped where the browser has no badge API.
export function setBadge(n, nav = navigator) {
  if (!('setAppBadge' in nav)) return Promise.resolve();
  return quietly(() => (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()));
}

const keyUrl = (key) => new URL(key, globalThis.location?.href ?? 'https://planner.invalid/').href;

async function putJson(cacheStorage, key, value) {
  const cache = await cacheStorage.open(CACHE);
  await cache.put(keyUrl(key), new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
}

export function writeForecast(counts, cacheStorage = globalThis.caches) {
  if (!cacheStorage) return Promise.resolve();
  return quietly(() => putJson(cacheStorage, KEY, counts));
}

// A saved ISO time as milliseconds, or null.
async function readTime(cacheStorage, key) {
  try {
    const res = await (await cacheStorage.open(CACHE)).match(keyUrl(key));
    const ms = res ? Date.parse(await res.json()) : NaN;
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

// True when push is on but nothing has arrived for 26 hours: the later of the last push and the
// time the badge was turned on. Unknown (neither saved) is not a warning.
export async function pushSilent(cacheStorage, nowMs) {
  if (!cacheStorage) return false;
  const times = (await Promise.all([LAST_PUSH, TURNED_ON].map((k) => readTime(cacheStorage, k)))).filter((t) => t !== null);
  return times.length > 0 && nowMs - Math.max(...times) > SILENT_AFTER;
}

// The forecast is written always. The icon badge is set only while a push subscription exists (isOn),
// and cleared otherwise, so turning the badge off really turns it off.
export function startPageBadge({ store, clock, isOn, nav = navigator, cacheStorage = globalThis.caches }) {
  let queued = false;
  const run = async () => {
    queued = false;
    const todos = store.todos();
    const today = clock.today();
    writeForecast(forecast(todos, today), cacheStorage);
    const on = await Promise.resolve().then(isOn).catch(() => false);
    await setBadge(on ? dueCount(todos, today) : 0, nav);
  };
  // Coalesced: one write per task turn, however many changes arrive.
  const update = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };
  store.on((e) => { if (e.type !== 'backup') update(); });
  clock.on(update);
  update();
  return update;
}

async function postJson(url, path, body) {
  const res = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The Badge block. `getReg` resolves the service worker registration; the rest can be stubbed in tests.
export function setupBlock({
  doc = document,
  getReg,
  url = PUSH_URL,
  key = VAPID_PUBLIC,
  send = postJson,
  permission = () => globalThis.Notification?.permission ?? 'default',
  afterChange = () => {},
  cacheStorage = globalThis.caches,
  now = () => Date.now(),
}) {
  const block = doc.getElementById('badgeBlock');
  const status = doc.getElementById('badgeStatus');
  const btn = doc.getElementById('badgeBtn');
  const errorEl = doc.getElementById('badgeError');
  const silentEl = doc.getElementById('badgeSilent');
  let reg = null;
  let lastPost = 0;
  let lastZone = null;
  let busy = false; // a Turn on or Turn off tap is running: a resume must not unlock its button

  const showError = (text) => { errorEl.textContent = text; errorEl.hidden = !text; };

  const subscription = () => (reg ? reg.pushManager.getSubscription().catch(() => null) : Promise.resolve(null));

  async function render() {
    const on = Boolean(await subscription()) && permission() === 'granted';
    status.textContent = on ? TEXT.on : permission() === 'denied' ? TEXT.denied : TEXT.off;
    btn.textContent = on ? 'Turn off' : 'Turn on';
    btn.dataset.state = on ? 'on' : 'off';
    btn.disabled = false;
    silentEl.textContent = on && await pushSilent(cacheStorage, now()) ? TEXT.silent : '';
    silentEl.hidden = !silentEl.textContent;
  }

  // lastPost moves only after the Worker accepted it, so a failed post is retried on the next return.
  async function post(sub) {
    const tz = zone();
    await send(url, '/subscribe', { subscription: sub.toJSON(), tz, hour: HOUR });
    lastPost = Date.now();
    lastZone = tz;
  }

  // On launch and on each return to the app: tell the Worker we're still here (it skips a no-change write).
  async function repost() {
    if (!reg || permission() !== 'granted') return;
    if (Date.now() - lastPost < REPOST_AFTER && zone() === lastZone) return;
    const sub = await subscription();
    if (!sub) return;
    try { await post(sub); } catch (err) { console.warn('Badge: could not reach the push Worker', err); }
  }

  async function turnOn() {
    showError('');
    busy = true;
    btn.disabled = true;
    // subscribe() must be the first await in the tap, or iOS refuses the permission prompt.
    const pending = reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
    try {
      const sub = await pending;
      // A subscription the Worker doesn't know about would never get a push: drop it and start over.
      try { await post(sub); } catch (err) { await quietly(() => sub.unsubscribe()); throw err; }
      if (cacheStorage) await quietly(() => putJson(cacheStorage, TURNED_ON, new Date(now()).toISOString()));
      afterChange();
    } catch {
      if (permission() !== 'denied') showError(TEXT.error);
    }
    busy = false;
    await render();
  }

  async function turnOff() {
    showError('');
    busy = true;
    btn.disabled = true;
    try {
      const sub = await subscription();
      if (sub) {
        const { endpoint } = sub;
        await sub.unsubscribe();
        await quietly(() => send(url, '/unsubscribe', { endpoint }));
      }
      afterChange();
    } catch {
      showError("Couldn't turn off the badge. Try again.");
    }
    busy = false;
    await render();
  }

  btn.addEventListener('click', () => {
    if (!reg) { showError(TEXT.error); return; }
    if (btn.dataset.state === 'on') turnOff();
    else turnOn();
  });
  doc.getElementById('moreBtn').addEventListener('click', () => { showError(''); render(); });
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') { if (!busy) render(); repost(); } });

  block.hidden = false;
  render();
  getReg().then((r) => { reg = r; render(); repost(); }).catch(() => {});
  return { render, repost };
}

export function init({ store, clock }) {
  const ready = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const configured = Boolean(PUSH_URL && VAPID_PUBLIC && ready);
  const registration = configured ? navigator.serviceWorker.ready : null;
  const isOn = async () => Boolean(registration && await (await registration).pushManager.getSubscription());
  const update = startPageBadge({ store, clock, isOn });
  if (!configured) return;
  setupBlock({
    getReg: () => registration,
    afterChange: update,
  });
}
