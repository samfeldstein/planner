import test from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../tools/convert-assistant-export.mjs';
import { parseBackup } from '../src/js/data/backup.js';

const now = new Date('2026-11-01T17:00:00.000Z');
let n = 0;
const opts = { today: '2026-11-01', now, uuid: () => `id-${++n}` };

const routine = (id, extra) => ({ id, label: id, group: 'morning', lastDone: null, nextDue: '2026-11-02', order: 0, skips: 0, ...extra });
const data = {
  routines: [
    routine('Floss', { group: 'night', rule: { t: 'weekly', dow: [6, 0] }, note: 'dropped', subtasks: ['x'], batch: 'b' }),
    routine('Email', { rule: { t: 'daily' }, order: 3 }),
    routine('Fruit', { rule: { t: 'daily' }, order: 1 }),
    routine('Trade', { group: 'priority', rule: { t: 'weekdays' }, order: -1 }),
    routine('Rent', { group: 'allday', rule: { t: 'monthday', day: 1 }, nextDue: '2026-12-01' }),
    routine('Profiles', { group: 'allday', rule: { t: 'months', n: 1 }, nextDue: '2026-11-13' }),
    routine('Towels', { group: 'allday', rule: { t: 'interval', n: 14, dow: [6] } }),
    routine('Movie', { group: 'allday', rule: { t: 'interval', n: 10 } }),
    routine('Snow', { rule: { t: 'daily' }, until: '2026-10-29' }),
    routine('Odd', { rule: { t: 'quarterly' } }),
  ],
  items: [
    { id: 'a', label: 'Eye doctor', group: 'afternoon', due: '2026-11-04', done: false, order: 0 },
    { id: 'b', label: 'Photo', group: 'oneoff', done: false, order: 1 },
    { id: 'c', label: 'Old thing', group: 'oneoff', done: true, order: 0 },
    { id: 'd', label: 'Party', kind: 'event', done: false, start: '2026-11-12' },
  ],
};

test('converts a representative export into a backup Planner accepts', () => {
  const { backup, report } = convert(data, opts);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.todos.length, report.imported);
  assert.deepEqual(backup.groups.map((g) => g.name), ['Morning', 'Afternoon', 'Night', 'All day', 'One-off']);
  assert.deepEqual(backup.groups.map((g) => g.order), [1, 2, 3, 4, 5]);
  assert.equal(report.completed, 1);
});

test('maps each repeat rule', () => {
  const { backup } = convert(data, opts);
  const by = (title) => backup.todos.find((t) => t.title === title);
  assert.deepEqual(by('Floss').recur, { freq: 'weekly', weekdays: [0, 6] });
  assert.deepEqual(by('Email').recur, { freq: 'daily' });
  assert.deepEqual(by('Trade').recur, { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
  assert.deepEqual(by('Rent').recur, { freq: 'monthly', monthDay: 1 });
  assert.deepEqual(by('Profiles').recur, { freq: 'monthly', monthDay: 13 });
  assert.deepEqual(by('Towels').recur, { freq: 'interval', n: 2, unit: 'weeks' });
  assert.deepEqual(by('Movie').recur, { freq: 'interval', n: 10, unit: 'days' });
});

test('the priority group becomes the top-priority flag with no group', () => {
  const { backup } = convert(data, opts);
  const trade = backup.todos.find((t) => t.title === 'Trade');
  assert.equal(trade.priority, 1);
  assert.equal(trade.groupId, null);
  const floss = backup.todos.find((t) => t.title === 'Floss');
  assert.equal(floss.priority, 0);
  assert.equal(floss.groupId, backup.groups.find((g) => g.name === 'Night').id);
});

test('keeps the old order inside a group through creation times', () => {
  const { backup } = convert(data, opts);
  const morning = backup.groups.find((g) => g.name === 'Morning').id;
  const titles = backup.todos.filter((t) => t.groupId === morning).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((t) => t.title);
  assert.deepEqual(titles, ['Fruit', 'Email']);
});

test('open items import; undated ones are due today; events and finished ones do not', () => {
  const { backup, report } = convert(data, opts);
  const photo = backup.todos.find((t) => t.title === 'Photo');
  assert.equal(photo.due, '2026-11-01');
  assert.equal(backup.todos.find((t) => t.title === 'Eye doctor').due, '2026-11-04');
  assert.ok(!backup.todos.some((t) => ['Party', 'Old thing'].includes(t.title)));
  assert.deepEqual(report.dropped.map((d) => [d.label, d.reason]), [
    ['Snow', 'ended'],
    ['Odd', 'unsupported repeat rule (quarterly)'],
    ['Party', 'event'],
  ]);
});
