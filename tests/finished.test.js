import test from 'node:test';
import assert from 'node:assert/strict';
import { FINISHED_KEY, dropFinished, parseFinished, putAway, reconcile, reconcileAll, serializeFinished, splitFinished } from '../src/js/core/finished.js';
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

test('migration 2 upgrades saved snapshots: a Night-group todo gets part Night and keeps its group', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const { part, ...old } = { ...floss, groupId: 'gn' };
    const plain = { ...old, id: 'p', groupId: 'gw' };
    store.set(FINISHED_KEY, JSON.stringify({ date: day, todos: [old, plain] }));
    upgradeFinished([{ id: 'gn', name: 'Night' }, { id: 'gw', name: 'Work' }], 1);
    const saved = JSON.parse(store.get(FINISHED_KEY));
    assert.equal(saved.date, day);
    assert.deepEqual(saved.todos.map((t) => [t.id, t.part, t.groupId]), [['f', 'night', 'gn'], ['p', 'morning', 'gw']]);
  } finally {
    delete globalThis.localStorage;
  }
});

test('migration 2 skips finished snapshots when storage is missing or empty', () => {
  assert.doesNotThrow(() => upgradeFinished([], 1));
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('no write expected'); } };
  try { assert.doesNotThrow(() => upgradeFinished([], 1)); } finally { delete globalThis.localStorage; }
});

// Completed: entries put away when the app is left.

const snap = (id) => ({ ...floss, id, recur: null, lastDone: null });

test('saved record round trip keeps check-off order and the away set', () => {
  const todos = new Map([['a', snap('a')], ['b', snap('b')], ['c', snap('c')]]);
  const away = new Set(['b']);
  const back = parseFinished(serializeFinished(day, todos, away), day);
  assert.deepEqual([...back.todos.keys()], ['a', 'b', 'c']);
  assert.deepEqual(back.todos.get('a'), snap('a'));
  assert.deepEqual([...back.away], ['b']);
});

test('an old record without away loads every entry in place', () => {
  const back = parseFinished(JSON.stringify({ date: day, todos: [snap('a')] }), day);
  assert.deepEqual([...back.todos.keys()], ['a']);
  assert.equal(back.away.size, 0);
});

test('missing, unreadable, or stray-id records load safely', () => {
  for (const raw of [null, '', '{', '{"date":"2026-11-07"}']) {
    const back = parseFinished(raw, day);
    assert.equal(back.todos.size, 0);
    assert.equal(back.away.size, 0);
  }
  const back = parseFinished(JSON.stringify({ date: day, todos: [snap('a')], away: ['a', 'gone'] }), day);
  assert.deepEqual([...back.away], ['a']);
});

test('a new day clears the entries and the away set', () => {
  const raw = serializeFinished(day, new Map([['a', snap('a')]]), new Set(['a']));
  const back = parseFinished(raw, '2026-11-08');
  assert.equal(back.todos.size, 0);
  assert.equal(back.away.size, 0);
});

test('putting away moves every entry, once', () => {
  const todos = new Map([['a', snap('a')], ['b', snap('b')]]);
  const away = new Set(['a']);
  assert.equal(putAway(todos, away), true);
  assert.deepEqual([...away].sort(), ['a', 'b']);
  assert.equal(putAway(todos, away), false);
  assert.equal(putAway(new Map(), new Set()), false);
});

test('split keeps check-off order on both sides', () => {
  const todos = new Map([['a', snap('a')], ['b', snap('b')], ['c', snap('c')], ['d', snap('d')]]);
  const { inPlace, away } = splitFinished(todos, new Set(['c', 'a']));
  assert.deepEqual(inPlace.map((t) => t.id), ['b', 'd']);
  assert.deepEqual(away.map((t) => t.id), ['a', 'c']);
});

test('undo drops the entry from the away set; checked off again it starts in place', () => {
  const todos = new Map([['a', snap('a')], ['b', snap('b')]]);
  const away = new Set(['a', 'b']);
  dropFinished(todos, away, 'a');
  assert.deepEqual([...todos.keys()], ['b']);
  assert.deepEqual([...away], ['b']);
  todos.set('a', snap('a'));
  const split = splitFinished(todos, away);
  assert.deepEqual(split.inPlace.map((t) => t.id), ['a']);
  assert.deepEqual(split.away.map((t) => t.id), ['b']);
  assert.deepEqual(JSON.parse(serializeFinished(day, todos, away)).todos.map((t) => t.id), ['b', 'a']);
});

test('an entry reconcile drops (deleted or rescheduled) leaves the away set', () => {
  const todos = new Map([['f', floss], ['g', { ...floss, id: 'g' }], ['h', { ...floss, id: 'h' }]]);
  const away = new Set(['f', 'g', 'h']);
  const live = {
    f: { ...checkedOff, title: 'Floss well' }, // edited since: kept, brought up to date
    g: { ...checkedOff, id: 'g', due: '2026-11-12' }, // rescheduled: dropped
    // h deleted: dropped
  };
  assert.equal(reconcileAll(todos, away, (id) => live[id], day), true);
  assert.deepEqual([...todos.keys()], ['f']);
  assert.deepEqual([...away], ['f']);
  assert.equal(todos.get('f').title, 'Floss well');
  assert.equal(todos.get('f').due, floss.due);
  assert.equal(reconcileAll(todos, away, (id) => live[id], day), false);
});

test('a put-away repeating todo keeps its pre-check-off snapshot, and undo reverts it', () => {
  const todos = new Map([['f', floss]]);
  const away = new Set();
  putAway(todos, away);
  assert.deepEqual(splitFinished(todos, away).away, [floss]);
  reconcileAll(todos, away, () => checkedOff, day);
  assert.deepEqual(todos.get('f'), { ...floss, updatedAt: 'b' });
  assert.deepEqual([...away], ['f']);
});
