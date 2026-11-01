import test from 'node:test';
import assert from 'node:assert/strict';
import { daysAgo, ordinal, recurSummary } from '../src/js/ui/format.js';

test('ordinal', () => {
  const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal);
  assert.deepEqual(got, ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
});

test('recurSummary', () => {
  assert.equal(recurSummary({ freq: 'daily' }), 'Every day');
  assert.equal(recurSummary({ freq: 'monthly', monthDay: 15 }), 'Every month on the 15th');
  assert.equal(recurSummary({ freq: 'monthly', monthDay: 31 }), 'Every month on the 31st, or the last day');
  assert.equal(recurSummary({ freq: 'interval', n: 2, unit: 'weeks' }), 'Every 2 weeks');
  assert.equal(recurSummary({ freq: 'interval', n: 1, unit: 'days' }), 'Every day');
  assert.match(recurSummary({ freq: 'weekly', weekdays: [4, 1] }), /^Every .+, .+$/);
  assert.match(recurSummary({ freq: 'yearly', month: 2, monthDay: 29 }), /29/);
});

test('daysAgo floors whole days', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  assert.equal(daysAgo('2026-11-01T12:00:00Z', now), 9);
  assert.equal(daysAgo('2026-11-01T13:00:00Z', now), 8);
});
