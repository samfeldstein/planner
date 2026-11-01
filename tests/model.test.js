import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_FORMAT, isReservedGroupName, normalizeGroup, sortGroups, normalizeTodo, upgradeGroup, upgradeTodo, validateGroup, validateTodo,
} from '../src/js/core/model.js';

const good = {
  id: 'a', title: 'Pay rent', due: '2026-11-01', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: '2026-11-01T17:30:00.000Z', updatedAt: '2026-11-01T17:30:00.000Z',
};

test('a good todo validates', () => assert.equal(validateTodo(good), null));

test('bad todos are rejected (case 41)', () => {
  const bad = [
    { ...good, id: '' },
    { ...good, title: '' },
    { ...good, due: '2026-02-30' },
    { ...good, priority: 2 },
    { ...good, recur: { freq: 'weekly', weekdays: [] } },
    { ...good, recur: { freq: 'weekly', weekdays: [7] } },
    { ...good, recur: { freq: 'monthly', monthDay: 32 } },
    { ...good, recur: { freq: 'yearly', month: 13, monthDay: 1 } },
    { ...good, recur: { freq: 'hourly' } },
    { ...good, recur: { freq: 'interval', n: 0, unit: 'days' } },
    { ...good, recur: { freq: 'interval', n: 2, unit: 'months' } },
    { ...good, recur: { freq: 'interval', n: 2.5, unit: 'days' } },
    { ...good, lastDone: '2026-13-01' },
  ];
  for (const t of bad) assert.notEqual(validateTodo(t), null, JSON.stringify(t));
});

test('normalize strips unknown fields, trims, and fills defaults', () => {
  const n = normalizeTodo({ id: 'a', title: '  hi  ', due: '2026-11-01', junk: 1 });
  assert.deepEqual(n, { id: 'a', title: 'hi', due: '2026-11-01', groupId: null, priority: 0, recur: null, lastDone: null });
  assert.deepEqual(normalizeGroup({ id: 'g', name: 'Work', order: 1, createdAt: 'x', junk: 1 }), {
    id: 'g', name: 'Work', order: 1, createdAt: 'x',
  });
});

test('groups: "Other" is reserved, case-insensitively', () => {
  assert.equal(isReservedGroupName(' oTHER '), true);
  assert.notEqual(validateGroup({ id: 'g', name: 'other' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: '  ' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: 'Home', order: 'x' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: 'Home', order: null }), null);
  assert.equal(validateGroup({ id: 'g', name: 'Work' }), null);
});

test('upgrade at the current format is a no-op', () => {
  assert.equal(CURRENT_FORMAT, 1);
  assert.equal(upgradeTodo(good, CURRENT_FORMAT), good);
  const g = { id: 'g', name: 'Work' };
  assert.equal(upgradeGroup(g, CURRENT_FORMAT), g);
});

test('an interval rule validates', () => {
  assert.equal(validateTodo({ ...good, recur: { freq: 'interval', n: 14, unit: 'days' } }), null);
  assert.equal(validateTodo({ ...good, recur: { freq: 'interval', n: 2, unit: 'weeks' } }), null);
});

test('sortGroups: saved order first, then A to Z', () => {
  const list = [{ id: 'a', name: 'Zed' }, { id: 'b', name: 'Beta', order: 2 }, { id: 'c', name: 'Alpha', order: 1 }, { id: 'd', name: 'Able' }];
  assert.deepEqual(sortGroups(list).map((g) => g.id), ['c', 'b', 'd', 'a']);
});
