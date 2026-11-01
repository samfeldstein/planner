import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, clampDay, daysInMonth, fmt, isValid, parse, todayLocal, weekday } from '../src/js/core/date.js';

test('addDays across US and Europe DST changes (cases 1-3)', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('addDays steps one day at a time through every DST month', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 730; i++) {
    const n = addDays(d, 1);
    assert.equal(addDays(n, -1), d);
    assert.ok(n > d);
    d = n;
  }
  assert.equal(d, '2028-01-01');
});

test('leap years (cases 15-16)', () => {
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
});

test('weekday and year rollover', () => {
  assert.equal(weekday('2026-11-01'), 0);
  assert.equal(weekday('2026-11-02'), 1);
  assert.equal(addDays('2026-12-27', 7), '2027-01-03');
});

test('clampDay and parse/fmt round trip', () => {
  assert.equal(clampDay(2027, 2, 31), '2027-02-28');
  assert.equal(clampDay(2028, 2, 31), '2028-02-29');
  assert.equal(clampDay(2027, 4, 31), '2027-04-30');
  assert.deepEqual(parse('2026-02-08'), [2026, 2, 8]);
  assert.equal(fmt(2026, 2, 8), '2026-02-08');
});

test('isValid rejects impossible dates', () => {
  for (const s of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-1', '', null, 20260101]) {
    assert.equal(isValid(s), false, String(s));
  }
  assert.equal(isValid('2028-02-29'), true);
  assert.equal(isValid('2027-02-29'), false);
});

test('todayLocal reads local calendar fields', () => {
  assert.equal(todayLocal(new Date(2026, 10, 1, 23, 59, 59)), '2026-11-01');
  assert.equal(todayLocal(new Date(2026, 10, 2, 0, 0, 1)), '2026-11-02');
});

test('todayLocal advances by exactly one day across 30-minute steps over DST changes (case 4)', () => {
  for (const [y, m] of [[2026, 2], [2026, 3], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2027, 3]]) {
    let t = new Date(y, m, 1).getTime() - 36e5 * 12;
    const end = t + 36e5 * 24 * 40;
    let prev = todayLocal(new Date(t));
    for (; t < end; t += 18e5) {
      const cur = todayLocal(new Date(t));
      if (cur !== prev) {
        assert.equal(cur, addDays(prev, 1), `${prev} -> ${cur}`);
        prev = cur;
      }
    }
  }
});
