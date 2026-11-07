import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_FORMAT, isReservedGroupName, normalizeGroup, sortGroups, normalizeTodo, upgradeAll, upgradeGroup, upgradeTodo, validateGroup, validateTodo,
} from '../src/js/core/model.js';

const good = {
  id: 'a', title: 'Pay rent', due: '2026-11-01', part: 'morning', groupId: null, priority: 0, recur: null, lastDone: null,
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
    { ...good, part: undefined },
    { ...good, part: 'evening' },
    { ...good, part: 'Morning' },
  ];
  for (const t of bad) assert.notEqual(validateTodo(t), null, JSON.stringify(t));
});

test('normalize strips unknown fields, trims, and fills defaults', () => {
  const n = normalizeTodo({ id: 'a', title: '  hi  ', due: '2026-11-01', part: 'night', junk: 1 });
  assert.deepEqual(n, { id: 'a', title: 'hi', due: '2026-11-01', part: 'night', groupId: null, priority: 0, recur: null, lastDone: null });
  assert.deepEqual(normalizeGroup({ id: 'g', name: 'Work', order: 1, createdAt: 'x', junk: 1 }), {
    id: 'g', name: 'Work', order: 1, createdAt: 'x',
  });
});

test('groups: "Other" and the part names are reserved, case-insensitively', () => {
  assert.equal(isReservedGroupName(' oTHER '), true);
  for (const name of ['Morning', ' afternoon', 'NIGHT ']) {
    assert.equal(isReservedGroupName(name), true);
    assert.match(validateGroup({ id: 'g', name }), /cannot be named/);
  }
  assert.equal(isReservedGroupName('Mornings'), false);
  assert.notEqual(validateGroup({ id: 'g', name: 'other' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: '  ' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: 'Home', order: 'x' }), null);
  assert.notEqual(validateGroup({ id: 'g', name: 'Home', order: null }), null);
  assert.equal(validateGroup({ id: 'g', name: 'Work' }), null);
});

test('upgrade at the current format is a no-op', () => {
  assert.equal(CURRENT_FORMAT, 2);
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

test('format 1 -> 2: a todo gets Morning; a part it already has is kept', () => {
  const { part, ...old } = good;
  assert.equal(upgradeTodo(old, 1).part, 'morning');
  assert.equal(upgradeTodo({ ...old, part: 'night' }, 1).part, 'night');
  assert.equal(validateTodo(normalizeTodo(upgradeTodo(old, 1))), null);
});

test('format 1 -> 2: groups named for a part fold into it; other todos go to Morning', () => {
  const { part, ...old } = good;
  const groups = [{ id: 'm', name: 'Morning' }, { id: 'a', name: ' afternoon ' }, { id: 'n', name: 'NIGHT' }, { id: 'w', name: 'Work' }];
  const todos = ['m', 'a', 'n', 'w', null].map((groupId, i) => ({ ...old, id: `t${i}`, groupId }));
  const out = upgradeAll({ todos, groups }, 1);
  assert.deepEqual(out.groups.map((g) => g.id), ['w']);
  assert.deepEqual(out.todos.map((t) => [t.part, t.groupId]),
    [['morning', null], ['afternoon', null], ['night', null], ['morning', 'w'], ['morning', null]]);
  assert.deepEqual(todos[0].groupId, 'm', 'inputs are not mutated');
});

test('upgradeAll at the current format changes nothing', () => {
  const groups = [{ id: 'w', name: 'Work' }];
  const out = upgradeAll({ todos: [good], groups }, CURRENT_FORMAT);
  assert.deepEqual(out, { todos: [good], groups });
});
