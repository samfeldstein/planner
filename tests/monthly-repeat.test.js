// The user's report: a monthly todo due on the 5th was moved to the 6th, maybe moved again on the
// 6th, and on the 7th showed the right date but not as overdue. Each path that could lead there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { editPatch } from '../src/js/core/edit.js';
import { anchorRule, isOverdue, nextAfter, schedule } from '../src/js/core/recur.js';
import { makeEnv } from './helpers.js';

const monthly = (monthDay) => ({ freq: 'monthly', monthDay });
const yearly = (month, monthDay) => ({ freq: 'yearly', month, monthDay });

async function rentOnThe5th() {
  const env = await makeEnv('2026-11-05');
  const { id } = await env.store.addTodo({ title: 'Rent', recur: { freq: 'monthly' }, due: '2026-11-05' });
  return { env, id, todo: () => env.store.todo(id) };
}

// What the sheet sends when Done is tapped with the form as it opened.
const untouched = (todo) => ({ title: todo.title, part: todo.part, groupId: todo.groupId, priority: todo.priority, due: todo.due, recur: todo.recur && { freq: todo.recur.freq } });

test('Tomorrow on the 5th, not done on the 6th: overdue on the 7th, rule still the 5th', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.tomorrow(id);
  assert.equal(todo().due, '2026-11-06');
  assert.deepEqual(todo().recur, monthly(5));
  env.day = '2026-11-07';
  assert.equal(isOverdue(todo(), env.day), true);
});

test('Tomorrow on the 5th and again on the 6th: due today on the 7th, not overdue (spec)', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.tomorrow(id);
  env.day = '2026-11-06';
  await env.store.tomorrow(id);
  env.day = '2026-11-07';
  assert.equal(todo().due, '2026-11-07');
  assert.equal(isOverdue(todo(), env.day), false);
  assert.deepEqual(todo().recur, monthly(5));
  await env.store.complete(id);
  assert.equal(todo().due, '2026-12-05');
});

test('Skip after Tomorrow goes to the next scheduled 5th', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.tomorrow(id);
  env.day = '2026-11-06';
  await env.store.skip(id);
  assert.equal(todo().due, '2026-12-05');
  assert.deepEqual(todo().recur, monthly(5));
});

test('Skip on an overdue monthly lands on the next 5th', async () => {
  const { env, id, todo } = await rentOnThe5th();
  env.day = '2026-11-07';
  await env.store.skip(id);
  assert.equal(todo().due, '2026-12-05');
});

test('check off and undo on a pushed monthly restores it exactly', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.tomorrow(id);
  env.day = '2026-11-06';
  const before = structuredClone(todo());
  await env.store.complete(id);
  assert.equal(todo().due, '2026-12-05');
  await env.store.restoreTodo(before);
  assert.deepEqual(todo(), before);
  env.day = '2026-11-07';
  assert.equal(isOverdue(todo(), env.day), true);
});

test('changing the date in the sheet moves the whole rule (spec: the date is the anchor)', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.updateTodo(id, editPatch(todo(), { ...untouched(todo()), due: '2026-11-06' }));
  assert.deepEqual(todo().recur, monthly(6));
  env.day = '2026-11-07';
  assert.equal(isOverdue(todo(), env.day), true);
});

test('Done in the sheet on a pushed monthly changes nothing (was: re-anchored to the pushed day)', async () => {
  const { env, id, todo } = await rentOnThe5th();
  await env.store.tomorrow(id);
  env.day = '2026-11-06';
  assert.deepEqual(editPatch(todo(), untouched(todo())), {});
  await env.store.updateTodo(id, editPatch(todo(), { ...untouched(todo()), title: 'Pay rent' }));
  assert.deepEqual(todo().recur, monthly(5));
  assert.equal(todo().due, '2026-11-06');
  await env.store.complete(id);
  assert.equal(todo().due, '2026-12-05');
});

test('editPatch on a pushed yearly keeps its anchor', () => {
  const t = { title: 'Tax', groupId: null, priority: 0, due: '2027-03-11', recur: yearly(3, 10) };
  assert.deepEqual(editPatch(t, untouched(t)), {});
});

test('editPatch sends due and recur when the repeat kind or weekdays change', () => {
  const t = { title: 'Gym', groupId: null, priority: 0, due: '2026-11-03', recur: { freq: 'weekly', weekdays: [1] } };
  assert.deepEqual(editPatch(t, { ...t, recur: { freq: 'weekly', weekdays: [1] } }), {});
  assert.deepEqual(editPatch(t, { ...t, recur: { freq: 'weekly', weekdays: [2, 1] } }), { due: t.due, recur: { freq: 'weekly', weekdays: [2, 1] } });
  assert.deepEqual(editPatch(t, { ...t, recur: { freq: 'monthly' } }), { due: t.due, recur: { freq: 'monthly' } });
  assert.deepEqual(editPatch(t, { ...t, recur: null }), { due: t.due, recur: null });
  const every = { ...t, recur: { freq: 'interval', n: 2, unit: 'weeks' } };
  assert.deepEqual(editPatch(every, { ...every, recur: { freq: 'interval', n: 2, unit: 'weeks' } }), {});
  assert.deepEqual(editPatch(every, { ...every, recur: { freq: 'interval', n: 3, unit: 'weeks' } }).recur.n, 3);
  const once = { ...t, recur: null };
  assert.deepEqual(editPatch(once, { ...once, title: 'Gym!' }), { title: 'Gym!' });
});

test('monthly and yearly edge cases', () => {
  // created on the 31st, or Feb 29, keeps that anchor through short months and years
  assert.deepEqual(schedule({ freq: 'monthly' }, '2027-01-31'), { recur: monthly(31), due: '2027-01-31' });
  assert.equal(nextAfter(monthly(31), '2027-02-28'), '2027-03-31');
  assert.equal(nextAfter(monthly(29), '2027-01-29'), '2027-02-28');
  assert.equal(nextAfter(monthly(29), '2028-01-29'), '2028-02-29');
  assert.equal(nextAfter(monthly(31), '2027-11-30'), '2027-12-31');
  assert.equal(nextAfter(monthly(1), '2026-12-01'), '2027-01-01');
  assert.deepEqual(anchorRule({ freq: 'yearly' }, '2028-02-29'), yearly(2, 29));
  assert.equal(nextAfter(yearly(2, 29), '2028-02-29'), '2029-02-28');
  assert.equal(schedule({ freq: 'yearly' }, '2026-12-31').due, '2026-12-31');
  // pushed past the clamped end of a short month still finds the next month's anchor
  assert.equal(nextAfter(monthly(31), '2027-03-01'), '2027-03-31');
});
