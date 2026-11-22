import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { base64UrlToBytes, dueCount, forecast, notificationText } from '../src/js/core/badge.js';
import { todayLocal } from '../src/js/core/date.js';
import { startPageBadge } from '../src/js/features/badge.js';

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
