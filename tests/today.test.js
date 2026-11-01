import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToday } from '../src/js/core/today.js';

const t = (id, extra = {}) => ({
  id, title: id, due: '2026-11-01', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: `2026-10-0${id.length}`, updatedAt: 'x', ...extra,
});
const groups = [{ id: 'w', name: 'work' }, { id: 'e', name: 'Errands' }, { id: 'h', name: 'Home' }];
const ids = (sections) => sections.map((s) => [s.group?.name ?? 'Other', s.todos.map((x) => x.id)]);

test('groups A to Z, Other last, empty groups hidden', () => {
  const out = buildToday([t('a', { groupId: 'w' }), t('b'), t('c', { groupId: 'e' })], groups, '2026-11-01');
  assert.deepEqual(ids(out), [['Errands', ['c']], ['work', ['a']], ['Other', ['b']]]);
});

test('only today and overdue appear', () => {
  const out = buildToday([t('a'), t('b', { due: '2026-11-02' }), t('c', { due: '2026-10-30' })], groups, '2026-11-01');
  assert.deepEqual(ids(out), [['Other', ['c', 'a']]]);
});

test('inside a group: top priority first, then oldest due, then creation order', () => {
  const todos = [
    t('aaa', { due: '2026-11-01' }),
    t('bb', { due: '2026-10-28' }),
    t('c', { due: '2026-11-01', priority: 1 }),
    t('dd', { due: '2026-10-25', priority: 1 }),
  ];
  assert.deepEqual(ids(buildToday(todos, groups, '2026-11-01')), [['Other', ['dd', 'c', 'bb', 'aaa']]]);
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
