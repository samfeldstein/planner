import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpcoming } from '../src/js/core/upcoming.js';

const t = (id, extra = {}) => ({
  id, title: id, due: '2026-11-02', part: 'morning', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: `2026-10-0${id.length}`, updatedAt: 'x', ...extra,
});
const shape = (days) => days.map((d) => [d.date, d.todos.map((x) => x.id)]);
const build = (todos) => shape(buildUpcoming(todos, '2026-11-01'));

test('only todos due after today, never today or overdue', () => {
  assert.deepEqual(build([t('a', { due: '2026-11-01' }), t('b', { due: '2026-10-20' }), t('c')]), [['2026-11-02', ['c']]]);
});

test('one entry per day, earliest day first', () => {
  const todos = [t('a', { due: '2026-11-10' }), t('b'), t('c', { due: '2026-11-10' }), t('d', { due: '2026-12-01' })];
  assert.deepEqual(build(todos), [['2026-11-02', ['b']], ['2026-11-10', ['a', 'c']], ['2026-12-01', ['d']]]);
});

test('inside a day: Morning, Afternoon, Night, then creation order', () => {
  const todos = [t('a', { part: 'night' }), t('bbb'), t('cc', { part: 'afternoon' }), t('d')];
  assert.deepEqual(build(todos), [['2026-11-02', ['d', 'bbb', 'cc', 'a']]]);
});

test('a repeating todo shows once, on its stored due date', () => {
  const weekly = t('w', { due: '2026-11-03', recur: { freq: 'weekly', weekdays: [2] } });
  const daily = t('d', { due: '2026-11-02', recur: { freq: 'daily' } });
  assert.deepEqual(build([weekly, daily]), [['2026-11-02', ['d']], ['2026-11-03', ['w']]]);
});

test('a stale daily counts as today, so it is not upcoming', () => {
  assert.deepEqual(build([t('d', { due: '2026-10-20', recur: { freq: 'daily' } })]), []);
});

test('nothing upcoming gives no days', () => {
  assert.deepEqual(build([]), []);
});
