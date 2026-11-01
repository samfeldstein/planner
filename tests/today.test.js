import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToday } from '../src/js/core/today.js';

const t = (id, extra = {}) => ({
  id, title: id, due: '2026-11-01', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: `2026-10-0${id.length}`, updatedAt: 'x', ...extra,
});
const groups = [{ id: 'w', name: 'work' }, { id: 'e', name: 'Errands' }, { id: 'h', name: 'Home' }];
const ids = (sections) => sections.map((s) => [s.priority ? 'Priority' : s.group?.name ?? 'Other', s.todos.map((x) => x.id)]);

test('groups A to Z without an order, Other last, empty groups hidden', () => {
  const out = buildToday([t('a', { groupId: 'w' }), t('b'), t('c', { groupId: 'e' })], groups, '2026-11-01');
  assert.deepEqual(ids(out), [['Errands', ['c']], ['work', ['a']], ['Other', ['b']]]);
});

test('groups follow their saved order, ahead of A to Z', () => {
  const ordered = [{ id: 'w', name: 'work', order: 2 }, { id: 'e', name: 'Errands', order: 3 }, { id: 'h', name: 'Home', order: 1 }];
  const out = buildToday([t('a', { groupId: 'w' }), t('c', { groupId: 'e' }), t('d', { groupId: 'h' })], ordered, '2026-11-01');
  assert.deepEqual(ids(out), [['Home', ['d']], ['work', ['a']], ['Errands', ['c']]]);
});

test('top-priority todos form one section above the groups, whatever their group', () => {
  const todos = [t('a', { groupId: 'w' }), t('bb', { groupId: 'e', priority: 1 }), t('c', { priority: 1, due: '2026-10-30' })];
  assert.deepEqual(ids(buildToday(todos, groups, '2026-11-01')), [['Priority', ['c', 'bb']], ['work', ['a']]]);
});

test('only today and overdue appear', () => {
  const out = buildToday([t('a'), t('b', { due: '2026-11-02' }), t('c', { due: '2026-10-30' })], groups, '2026-11-01');
  assert.deepEqual(ids(out), [['Other', ['c', 'a']]]);
});

test('inside a section: oldest due first, then creation order', () => {
  const todos = [
    t('aaa', { due: '2026-11-01' }),
    t('bb', { due: '2026-10-28' }),
    t('c', { due: '2026-11-01' }),
    t('dd', { due: '2026-10-25' }),
  ];
  assert.deepEqual(ids(buildToday(todos, groups, '2026-11-01')), [['Other', ['dd', 'bb', 'c', 'aaa']]]);
});

test('a stale daily counts as today, never overdue', () => {
  const daily = t('d', { due: '2026-10-20', recur: { freq: 'daily' } });
  assert.deepEqual(ids(buildToday([daily, t('o', { due: '2026-10-30' })], groups, '2026-11-01')), [['Other', ['o', 'd']]]);
});

test('a todo whose group vanished shows under Other', () => {
  assert.deepEqual(ids(buildToday([t('a', { groupId: 'gone' })], groups, '2026-11-01')), [['Other', ['a']]]);
});

test('nothing due gives no sections', () => {
  assert.deepEqual(buildToday([], groups, '2026-11-01'), []);
});
