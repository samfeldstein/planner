// Weekdays and Weekends: picker shortcuts stored as ordinary weekly rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { editPatch, presetRule, repeatChoice } from '../src/js/core/edit.js';
import { validateTodo } from '../src/js/core/model.js';
import { nextAfter, schedule } from '../src/js/core/recur.js';
import { recurSummary } from '../src/js/ui/format.js';
import { makeEnv } from './helpers.js';

test('presets are weekly rules', () => {
  assert.deepEqual(presetRule('weekdays'), { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
  assert.deepEqual(presetRule('weekends'), { freq: 'weekly', weekdays: [0, 6] });
  assert.equal(presetRule('weekly'), null);
  assert.equal(presetRule('never'), null);
});

test('repeatChoice shows a preset only when the days match exactly', () => {
  assert.equal(repeatChoice(null), 'never');
  assert.equal(repeatChoice({ freq: 'weekly', weekdays: [5, 4, 3, 2, 1] }), 'weekdays');
  assert.equal(repeatChoice({ freq: 'weekly', weekdays: [6, 0] }), 'weekends');
  assert.equal(repeatChoice({ freq: 'weekly', weekdays: [1, 2, 3, 4] }), 'weekly');
  assert.equal(repeatChoice({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }), 'weekly');
  assert.equal(repeatChoice({ freq: 'weekly', weekdays: [6] }), 'weekly');
  assert.equal(repeatChoice({ freq: 'monthly', monthDay: 5 }), 'monthly');
});

test('weekdays skips the weekend, weekends skips the week', () => {
  const wd = presetRule('weekdays');
  assert.equal(nextAfter(wd, '2026-11-06'), '2026-11-09'); // Fri -> Mon
  assert.equal(nextAfter(wd, '2026-11-09'), '2026-11-10');
  const we = presetRule('weekends');
  assert.equal(nextAfter(we, '2026-11-07'), '2026-11-08'); // Sat -> Sun
  assert.equal(nextAfter(we, '2026-11-08'), '2026-11-14'); // Sun -> Sat
  assert.equal(schedule(we, '2026-11-09').due, '2026-11-14'); // set up on a Monday
});

test('choosing the preset for a matching weekly rule changes nothing', () => {
  const todo = { title: 'Gym', groupId: null, priority: 0, due: '2026-11-09', recur: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] } };
  assert.deepEqual(editPatch(todo, { ...todo, recur: presetRule('weekdays') }), {});
  assert.deepEqual(Object.keys(editPatch(todo, { ...todo, recur: presetRule('weekends') })), ['due', 'recur']);
});

test('summary names the presets', () => {
  assert.equal(recurSummary(presetRule('weekdays')), 'Every weekday');
  assert.equal(recurSummary(presetRule('weekends')), 'Every weekend');
});

test('a preset todo validates and survives completion', async () => {
  const env = await makeEnv('2026-11-06'); // Friday
  const { id } = await env.store.addTodo({ title: 'Stand-up', recur: presetRule('weekdays'), due: '2026-11-06' });
  const t = env.store.todo(id);
  assert.equal(validateTodo(t), null);
  assert.deepEqual(t.recur, { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
  await env.store.complete(id);
  assert.equal(env.store.todo(id).due, '2026-11-09');
});
