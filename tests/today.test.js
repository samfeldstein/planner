import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToday, partAt, sectionTodos } from '../src/js/core/today.js';

const t = (id, extra = {}) => ({
  id, title: id, due: '2026-11-01', part: 'morning', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: `2026-10-0${id.length}`, updatedAt: 'x', ...extra,
});
const groups = [{ id: 'w', name: 'work' }, { id: 'e', name: 'Errands' }, { id: 'h', name: 'Home' }];
const ids = (list) => list.map((x) => x.id);
// One section as [priority ids, [group name, ids]..., ungrouped ids].
const shape = (s) => [ids(s.priority), ...s.groups.map((g) => [g.group.name, ids(g.todos)]), ids(s.ungrouped)];
const build = (todos, gs = groups) => buildToday(todos, gs, '2026-11-01');
const morning = (todos, gs) => shape(build(todos, gs)[0]);

test('Morning, Afternoon, and Night are always there, in that order, even when empty', () => {
  const out = build([]);
  assert.deepEqual(out.map((s) => s.part), ['morning', 'afternoon', 'night']);
  for (const s of out) assert.deepEqual(shape(s), [[], []]);
});

test('every todo lands in its own part', () => {
  const out = build([t('a', { part: 'night' }), t('b', { part: 'afternoon' }), t('c')]);
  assert.deepEqual(out.map((s) => ids(sectionTodos(s))), [['c'], ['b'], ['a']]);
});

test('inside a part: priority first, then groups, then ungrouped last', () => {
  const todos = [t('a', { groupId: 'w' }), t('b'), t('cc', { groupId: 'e', priority: 1 }), t('d', { groupId: 'e' })];
  assert.deepEqual(morning(todos), [['cc'], ['Errands', ['d']], ['work', ['a']], ['b']]);
});

test('groups A to Z without an order; empty groups hidden', () => {
  assert.deepEqual(morning([t('a', { groupId: 'w' }), t('c', { groupId: 'e' })]), [[], ['Errands', ['c']], ['work', ['a']], []]);
});

test('groups follow their saved order, ahead of A to Z', () => {
  const ordered = [{ id: 'w', name: 'work', order: 2 }, { id: 'e', name: 'Errands', order: 3 }, { id: 'h', name: 'Home', order: 1 }];
  const out = morning([t('a', { groupId: 'w' }), t('c', { groupId: 'e' }), t('d', { groupId: 'h' })], ordered);
  assert.deepEqual(out, [[], ['Home', ['d']], ['work', ['a']], ['Errands', ['c']], []]);
});

test('a group shows in each part that has its todos, and only there', () => {
  const out = build([t('a', { groupId: 'w' }), t('b', { groupId: 'w', part: 'night' })]);
  assert.deepEqual(out.map(shape), [[[], ['work', ['a']], []], [[], []], [[], ['work', ['b']], []]]);
});

test('priority todos sort first in their own part, whatever their group', () => {
  const todos = [t('a', { groupId: 'w' }), t('bb', { groupId: 'e', priority: 1 }), t('c', { priority: 1, due: '2026-10-30', part: 'night' })];
  const out = build(todos);
  assert.deepEqual(shape(out[0]), [['bb'], ['work', ['a']], []]);
  assert.deepEqual(shape(out[2]), [['c'], []]);
});

test('only today and overdue appear; overdue stays in its part', () => {
  const out = build([t('a'), t('b', { due: '2026-11-02' }), t('c', { due: '2026-10-30', part: 'afternoon' })]);
  assert.deepEqual(out.map((s) => ids(sectionTodos(s))), [['a'], ['c'], []]);
});

test('inside a list: oldest due first, then creation order', () => {
  const todos = [
    t('aaa', { due: '2026-11-01' }),
    t('bb', { due: '2026-10-28' }),
    t('c', { due: '2026-11-01' }),
    t('dd', { due: '2026-10-25' }),
  ];
  assert.deepEqual(morning(todos), [[], ['dd', 'bb', 'c', 'aaa']]);
});

test('a stale daily counts as today, never overdue', () => {
  const daily = t('d', { due: '2026-10-20', recur: { freq: 'daily' } });
  assert.deepEqual(morning([daily, t('o', { due: '2026-10-30' })]), [[], ['o', 'd']]);
});

test('a todo whose group vanished is ungrouped', () => {
  assert.deepEqual(morning([t('a', { groupId: 'gone' })]), [[], ['a']]);
});

test('a record with no part (an old finished-row snapshot) counts as Morning', () => {
  const { part, ...old } = t('a');
  assert.deepEqual(build([old]).map((s) => ids(sectionTodos(s))), [['a'], [], []]);
});

test('partAt: Morning before noon, Afternoon until 5 pm, Night from 5 pm', () => {
  const at = (h, m = 0) => partAt(new Date(2026, 10, 1, h, m));
  assert.deepEqual([at(0), at(11, 59), at(12), at(16, 59), at(17), at(23, 59)],
    ['morning', 'morning', 'afternoon', 'afternoon', 'night', 'night']);
});
