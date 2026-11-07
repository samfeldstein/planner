import test from 'node:test';
import assert from 'node:assert/strict';
import { FINISHED_KEY, reconcile } from '../src/js/core/finished.js';
import { complete } from '../src/js/core/recur.js';
import { upgradeFinished } from '../src/js/data/migrations.js';

const day = '2026-11-07';
const floss = {
  id: 'f', title: 'Floss', due: day, part: 'night', groupId: null, priority: 0,
  recur: { freq: 'daily' }, lastDone: '2026-11-06', createdAt: 'x', updatedAt: 'a',
};
const checkedOff = { ...complete(floss, day), updatedAt: 'b' };

test('before the check-off is saved, the snapshot stands', () => {
  assert.deepEqual(reconcile(floss, floss, day), floss);
});

test('after the check-off, undo reverts it exactly', () => {
  assert.deepEqual(reconcile(floss, checkedOff, day), { ...floss, updatedAt: 'b' });
});

test('an edit to the next instance (title, part, group, priority) survives undo', () => {
  const edited = { ...checkedOff, title: 'Floss well', part: 'afternoon', groupId: 'g', priority: 1, updatedAt: 'c' };
  assert.deepEqual(reconcile(floss, edited, day),
    { ...edited, due: floss.due, recur: floss.recur, lastDone: floss.lastDone });
});

test('a repeating todo deleted since the check-off is not brought back', () => {
  assert.equal(reconcile(floss, undefined, day), null);
});

test('a rescheduled one keeps its new schedule: the check-off can no longer be undone', () => {
  assert.equal(reconcile(floss, { ...checkedOff, due: '2026-11-12' }, day), null);
  assert.equal(reconcile(floss, { ...checkedOff, recur: { freq: 'weekly', weekdays: [1] } }, day), null);
  assert.equal(reconcile(floss, { ...checkedOff, recur: null, lastDone: null }, day), null);
});

test('rule key order does not matter', () => {
  const m = { ...floss, recur: { freq: 'monthly', monthDay: 7 } };
  const after = complete(m, day);
  assert.notEqual(reconcile(m, { ...after, recur: { monthDay: 7, freq: 'monthly' } }, day), null);
});

test('a one-off todo is gone once checked off, and undo puts it back', () => {
  const once = { ...floss, recur: null, lastDone: null };
  assert.deepEqual(reconcile(once, undefined, day), once);
  assert.deepEqual(reconcile(once, once, day), once);
});

test('migration 2 upgrades saved snapshots: a Night-group todo comes back in Night', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const { part, ...old } = { ...floss, groupId: 'gn' };
    const plain = { ...old, id: 'p', groupId: 'gw' };
    store.set(FINISHED_KEY, JSON.stringify({ date: day, todos: [old, plain] }));
    upgradeFinished([{ id: 'gn', name: 'Night' }, { id: 'gw', name: 'Work' }], 1);
    const saved = JSON.parse(store.get(FINISHED_KEY));
    assert.equal(saved.date, day);
    assert.deepEqual(saved.todos.map((t) => [t.id, t.part, t.groupId]), [['f', 'night', null], ['p', 'morning', 'gw']]);
  } finally {
    delete globalThis.localStorage;
  }
});

test('migration 2 skips finished snapshots when storage is missing or empty', () => {
  assert.doesNotThrow(() => upgradeFinished([], 1));
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('no write expected'); } };
  try { assert.doesNotThrow(() => upgradeFinished([], 1)); } finally { delete globalThis.localStorage; }
});
