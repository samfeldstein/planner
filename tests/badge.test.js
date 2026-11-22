import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { base64UrlToBytes, dueCount, forecast, notificationText } from '../src/js/core/badge.js';
import { todayLocal } from '../src/js/core/date.js';
import { pushSilent, setupBlock, startPageBadge } from '../src/js/features/badge.js';

const base = { part: 'morning', groupId: null, priority: 0, lastDone: null };
const one = (id, due) => ({ ...base, id, title: id, due, recur: null });
const daily = (id, due) => ({ ...base, id, title: id, due, recur: { freq: 'daily' } });
const weekly = (id, due, weekdays) => ({ ...base, id, title: id, due, recur: { freq: 'weekly', weekdays } });

test('counts todos due today or overdue', () => {
  const todos = [
    one('today', '2026-11-10'),
    one('late', '2026-11-01'),
    one('later', '2026-11-11'),
    daily('stale-daily', '2026-10-01'),
    weekly('wed', '2026-11-11', [3]), // 2026-11-10 is a Tuesday
  ];
  assert.equal(dueCount(todos, '2026-11-10'), 3);
});

test('a checked-off daily is not counted until it comes due, and an undone one is', () => {
  const done = daily('d', '2026-11-11'); // complete() moved it to tomorrow
  assert.equal(dueCount([done], '2026-11-10'), 0);
  assert.equal(dueCount([daily('d', '2026-11-10')], '2026-11-10'), 1); // undone: back on today
});

test('the forecast covers 31 days, exact, across a month end', () => {
  const todos = [one('a', '2026-11-30'), one('b', '2026-12-02'), daily('c', '2026-11-29')];
  const f = forecast(todos, '2026-11-28');
  assert.equal(Object.keys(f).length, 31);
  assert.equal(f['2026-11-28'], 0);
  assert.equal(f['2026-11-29'], 1);
  assert.equal(f['2026-11-30'], 2);
  assert.equal(f['2026-12-01'], 2);
  assert.equal(f['2026-12-02'], 3);
  assert.equal(f['2026-12-28'], 3);
  assert.equal(f['2026-12-29'], undefined);
});

test('the forecast steps by civil days over a DST change', () => {
  const f = forecast([one('a', '2026-03-08')], '2026-03-07', 3);
  assert.deepEqual(f, { '2026-03-07': 0, '2026-03-08': 1, '2026-03-09': 1 });
});

test('notification text', () => {
  assert.deepEqual(notificationText(4), { title: 'Planner', body: '4 due today' });
  assert.equal(notificationText(1).body, '1 due today');
  assert.equal(notificationText(0).body, 'Nothing due today');
  assert.equal(notificationText(null).body, 'Open Planner to see today');
});

test('base64url decodes to bytes', () => {
  assert.deepEqual([...base64UrlToBytes('-_8')], [251, 255]);
  assert.equal(base64UrlToBytes('AAAA').length, 3);
});

// sw.js can't import, so it holds copies of notificationText and the local-day formula.
const swSource = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');

function loadWorker(extra = {}) {
  const listeners = {};
  const self = { location: new URL('https://x.test/planner/sw.js'), addEventListener: (t, fn) => { listeners[t] = fn; }, ...extra.self };
  const ctx = { self, caches: extra.caches, URL };
  vm.createContext(ctx);
  vm.runInContext(swSource, ctx);
  return { ctx, listeners };
}

test("sw.js's copy of the text and the day formula match the page's", () => {
  const { ctx } = loadWorker();
  for (const n of [null, 0, 1, 4, 12]) assert.deepEqual({ ...ctx.notificationText(n) }, notificationText(n));
  for (const d of [new Date(2026, 2, 8, 2, 30), new Date(2026, 10, 1, 0, 0), new Date(2026, 11, 31, 23, 59), new Date()]) {
    assert.equal(ctx.localDay(d), todayLocal(d));
  }
});

test('the worker handles push and notificationclick', () => {
  const { listeners } = loadWorker();
  assert.equal(typeof listeners.push, 'function');
  assert.equal(typeof listeners.notificationclick, 'function');
});

async function pushWith(forecastJson, navigator = {}) {
  const shown = [];
  const caches = { open: async () => ({ match: async () => (forecastJson ? new Response(JSON.stringify(forecastJson)) : undefined) }) };
  const self = {
    navigator,
    registration: { getNotifications: async () => [], showNotification: async (t, o) => { shown.push([t, o.body, o.tag]); } },
  };
  const { listeners } = loadWorker({ self, caches });
  let work;
  listeners.push({ waitUntil: (p) => { work = p; } });
  await work;
  return shown;
}

test('a push shows one notification with the forecast count, even when the badge call fails', async () => {
  const navigator = { setAppBadge: async () => { throw new Error('nope'); }, clearAppBadge: async () => {} };
  const shown = await pushWith({ [todayLocal()]: 3 }, navigator);
  assert.deepEqual(shown, [['Planner', '3 due today', 'daily']]);
});

test('a push with no forecast for today shows the unknown text', async () => {
  assert.deepEqual(await pushWith(null), [['Planner', 'Open Planner to see today', 'daily']]);
  assert.deepEqual(await pushWith({ '1999-01-01': 2 }), [['Planner', 'Open Planner to see today', 'daily']]);
});

test('the page badge is set only while push is on, and cleared when it is off', async () => {
  const day = todayLocal();
  const todos = [one('a', day), one('b', day)];
  const handlers = [];
  const store = { todos: () => todos, on: (fn) => handlers.push(fn) };
  const clock = { today: () => day, on: () => {} };
  const calls = [];
  const nav = { setAppBadge: async (n) => { calls.push(n); }, clearAppBadge: async () => { calls.push(0); } };
  let on = true;
  startPageBadge({ store, clock, isOn: async () => on, nav, cacheStorage: null });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, [2]);
  on = false; // Turn off
  handlers[0]({ type: 'add' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, [2, 0]);
  handlers[0]({ type: 'backup' }); // a backup changes nothing
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, [2, 0]);
});

test('an unknown count clears the badge instead of leaving the old number', async () => {
  const calls = [];
  const navigator = { setAppBadge: async (n) => { calls.push(n); }, clearAppBadge: async () => { calls.push('clear'); } };
  await pushWith(null, navigator);
  await pushWith({ [todayLocal()]: 0 }, navigator);
  await pushWith({ [todayLocal()]: 2 }, navigator);
  assert.deepEqual(calls, ['clear', 'clear', 2]);
});

test('tapping the notification focuses an open window, or opens the app', async () => {
  const run = async (windows) => {
    const log = [];
    const clients = { matchAll: async () => windows, openWindow: async (u) => { log.push(['open', String(u)]); } };
    const { listeners } = loadWorker({ self: { clients } });
    let work;
    listeners.notificationclick({ notification: { close: () => log.push('closed') }, waitUntil: (p) => { work = p; } });
    await work;
    return log;
  };
  assert.deepEqual(await run([{ focus: async () => {} }]), ['closed']);
  assert.deepEqual(await run([]), ['closed', ['open', 'https://x.test/planner/']]);
});

// repost(): the Badge block tells the Worker we're still here, at most every 12 hours.
function fakeDoc() {
  const els = new Map();
  const el = () => {
    const handlers = {};
    return { hidden: true, textContent: '', dataset: {}, disabled: false, handlers, addEventListener(type, fn) { handlers[type] = fn; } };
  };
  const docHandlers = {};
  return { visibilityState: 'visible', docHandlers, addEventListener(type, fn) { docHandlers[type] = fn; }, getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); } };
}

// A Cache Storage stand-in: names to URL-to-text maps.
function fakeCaches() {
  const store = new Map();
  return {
    store,
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return { match: async (url) => (m.has(url) ? new Response(m.get(url)) : undefined), put: async (url, res) => { m.set(String(url.url ?? url), await res.text()); } };
    },
  };
}
const NOW = Date.parse('2026-11-21T20:00:00Z');
const ago = (hours) => JSON.stringify(new Date(NOW - hours * 36e5).toISOString());
const URL_PUSH = 'https://planner.invalid/badge-last-push.json';
const URL_ON = 'https://planner.invalid/badge-turned-on.json';
const withCache = (entries) => { const c = fakeCaches(); c.store.set('badge-counts', new Map(entries)); return c; };

test('repost is throttled to 12 hours, forced by a time-zone change, and retried after a failure', async (t) => {
  const zone = process.env.TZ;
  t.after(() => { mock.timers.reset(); if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });
  process.env.TZ = 'America/New_York';
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-21T12:00:00Z') });
  const sub = { toJSON: () => ({ endpoint: 'e' }) };
  const reg = { pushManager: { getSubscription: async () => sub } };
  const sent = [];
  let fail = false;
  const block = setupBlock({
    doc: fakeDoc(), getReg: async () => reg, url: 'https://w.test', key: 'AAAA',
    permission: () => 'granted',
    send: async (u, path, body) => { sent.push(body.tz); if (fail) throw new Error('down'); },
  });
  const settle = () => new Promise((r) => setImmediate(r));
  await settle();
  assert.equal(sent.length, 1, 'posts on launch');
  await block.repost();
  assert.equal(sent.length, 1, 'no repeat inside 12 hours');
  mock.timers.tick(12 * 36e5 - 1);
  await block.repost();
  assert.equal(sent.length, 1, 'still inside 12 hours');
  mock.timers.tick(1);
  await block.repost();
  assert.equal(sent.length, 2, 'posts after 12 hours');
  process.env.TZ = 'Europe/Berlin';
  await block.repost();
  assert.deepEqual(sent.slice(2), ['Europe/Berlin'], 'a new time zone posts at once');
  mock.timers.tick(12 * 36e5);
  fail = true;
  await block.repost();
  assert.equal(sent.length, 4, 'tries after 12 hours');
  await block.repost();
  assert.equal(sent.length, 5, 'a failed post is retried on the next return');
  fail = false;
  await block.repost();
  await block.repost();
  assert.equal(sent.length, 6, 'a good post resets the 12 hours');
});

test('a push saves its time in the badge-counts cache', async () => {
  const caches = fakeCaches();
  const listeners = {};
  const self = { location: new URL('https://x.test/planner/sw.js'), addEventListener: (t, fn) => { listeners[t] = fn; }, navigator: { setAppBadge: async () => {}, clearAppBadge: async () => {} },
    registration: { getNotifications: async () => [], showNotification: async () => {} } };
  const ctx = { self, caches, URL, Response, Date };
  vm.createContext(ctx);
  vm.runInContext(swSource, ctx);
  let work;
  const before = Date.now();
  listeners.push({ waitUntil: (p) => { work = p; } });
  await work;
  const saved = JSON.parse(caches.store.get('badge-counts').get('https://x.test/planner/badge-last-push.json'));
  assert.ok(Date.parse(saved) >= before - 1000 && Date.parse(saved) <= Date.now() + 1000);
});

test('a failing time save never stops the notification', async () => {
  const shown = [];
  const caches = { open: async () => ({ match: async () => undefined, put: async () => { throw new Error('full'); } }) };
  const self = { navigator: {}, registration: { getNotifications: async () => [], showNotification: async (t) => { shown.push(t); } } };
  const { listeners } = loadWorker({ self, caches });
  let work;
  listeners.push({ waitUntil: (p) => { work = p; } });
  await work;
  assert.deepEqual(shown, ['Planner']);
});

test('push is silent after 26 hours, using the later of the last push and turn-on', async () => {
  assert.equal(await pushSilent(withCache([[URL_PUSH, ago(25)]]), NOW), false);
  assert.equal(await pushSilent(withCache([[URL_PUSH, ago(27)]]), NOW), true);
  assert.equal(await pushSilent(withCache([[URL_ON, ago(27)]]), NOW), true, 'no push yet: the turn-on time counts');
  assert.equal(await pushSilent(withCache([[URL_ON, ago(25)]]), NOW), false);
  assert.equal(await pushSilent(withCache([[URL_PUSH, ago(40)], [URL_ON, ago(2)]]), NOW), false, 'turned on again after the last push');
  assert.equal(await pushSilent(withCache([]), NOW), false, 'nothing saved is not a warning');
});

test('the Badge block shows the silent-push line at 27 hours, not 25, and Turn on resets it', async () => {
  const doc = fakeDoc();
  const cacheStorage = withCache([[URL_PUSH, ago(27)]]);
  let sub = { toJSON: () => ({}) };
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => { sub = { toJSON: () => ({}), unsubscribe: async () => { sub = null; } }; return sub; } } };
  const block = setupBlock({ doc, getReg: async () => reg, url: 'https://w.test', key: 'AAAA', permission: () => 'granted', send: async () => {}, cacheStorage, now: () => NOW });
  await new Promise((r) => setImmediate(r));
  const line = doc.getElementById('badgeSilent');
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, 'No morning notification came today. Turn the badge off and on again.');
  cacheStorage.store.get('badge-counts').set(URL_PUSH, ago(25));
  await block.render();
  assert.equal(line.hidden, true);
  cacheStorage.store.get('badge-counts').set(URL_PUSH, ago(27));
  await block.render();
  assert.equal(line.hidden, false);
  sub = null; // turned off, then on again
  await block.render();
  assert.equal(line.hidden, true, 'off shows no warning');
  await doc.getElementById('badgeBtn').handlers.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(cacheStorage.store.get('badge-counts').has(URL_ON), 'turn-on time saved');
  assert.equal(line.hidden, true, 'Turn on resets the warning');
});

test('a failed repost warns in the console', async () => {
  const warns = [];
  const warn = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    const reg = { pushManager: { getSubscription: async () => ({ toJSON: () => ({}) }) } };
    setupBlock({ doc: fakeDoc(), getReg: async () => reg, url: 'https://w.test', key: 'AAAA', permission: () => 'granted', send: async () => { throw new Error('down'); }, cacheStorage: null });
    await new Promise((r) => setTimeout(r, 10));
  } finally { console.warn = warn; }
  assert.equal(warns.length, 1);
});

test('coming back to the app re-checks the silent-push warning', async () => {
  const doc = fakeDoc();
  const cacheStorage = withCache([[URL_ON, ago(1)]]);
  let nowMs = NOW;
  const reg = { pushManager: { getSubscription: async () => ({ toJSON: () => ({}) }) } };
  setupBlock({ doc, getReg: async () => reg, url: 'https://w.test', key: 'AAAA', permission: () => 'granted', send: async () => {}, cacheStorage, now: () => nowMs });
  await new Promise((r) => setImmediate(r));
  const line = doc.getElementById('badgeSilent');
  assert.equal(line.hidden, true);
  nowMs = NOW + 30 * 36e5; // the app sat in the background
  doc.docHandlers.visibilitychange();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(line.hidden, false, 'the warning shows on resume');
  cacheStorage.store.get('badge-counts').set(URL_PUSH, JSON.stringify(new Date(nowMs - 3600e3).toISOString()));
  doc.docHandlers.visibilitychange();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(line.hidden, true, 'a saved push time clears it on the next resume');
});

test("sw.js and badge.js agree on the last-push file and the cache name", () => {
  const badge = readFileSync(new URL('../src/js/features/badge.js', import.meta.url), 'utf8');
  const file = badge.match(/const LAST_PUSH = '\.\/([^']+)'/)[1];
  const cache = badge.match(/const CACHE = '([^']+)'/)[1];
  assert.ok(swSource.includes(`abs('${file}')`), `sw.js does not write ${file}`);
  assert.ok(swSource.includes(`caches.open('${cache}')`), `sw.js does not open the ${cache} cache`);
});

test('a resume does not unlock the button while Turn on is still running', async () => {
  const doc = fakeDoc();
  let release;
  const gate = new Promise((r) => { release = r; });
  let sub = null;
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => { await gate; sub = { toJSON: () => ({}) }; return sub; } } };
  setupBlock({ doc, getReg: async () => reg, url: 'https://w.test', key: 'AAAA', permission: () => 'granted', send: async () => {}, cacheStorage: null });
  await new Promise((r) => setImmediate(r));
  const btn = doc.getElementById('badgeBtn');
  btn.handlers.click();
  assert.equal(btn.disabled, true);
  doc.docHandlers.visibilitychange();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(btn.disabled, true, 'the button stayed locked mid-tap');
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, 'Turn off');
});
