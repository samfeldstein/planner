import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE, anchorRule, complete, effectiveDue, firstOnOrAfter, isInToday, isOverdue, nextAfter, schedule, skip, tomorrow,
} from '../src/js/core/recur.js';

const daily = { freq: 'daily' };
const weekly = (...weekdays) => ({ freq: 'weekly', weekdays });
const monthly = (monthDay) => ({ freq: 'monthly', monthDay });
const yearly = (month, monthDay) => ({ freq: 'yearly', month, monthDay });
const todo = (recur, due, extra = {}) => ({ id: 'a', title: 't', due, recur, lastDone: null, ...extra });

const chain = (rule, start, n) => {
  const out = [];
  let d = start;
  for (let i = 0; i < n; i++) out.push((d = nextAfter(rule, d)));
  return out;
};

test('yearly Feb 29 clamps and returns (cases 12-14)', () => {
  assert.deepEqual(chain(yearly(2, 29), '2028-02-29', 4), ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  assert.equal(firstOnOrAfter(yearly(2, 29), '2027-01-10'), '2027-02-28');
  assert.equal(complete(todo(yearly(2, 29), '2027-02-28'), '2027-03-01').due, '2028-02-29');
});

test('monthly on the 31st keeps its anchor (cases 17-21, 23)', () => {
  assert.deepEqual(chain(monthly(31), '2027-01-31', 4), ['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
  assert.equal(nextAfter(monthly(31), '2028-01-31'), '2028-02-29');
  assert.equal(complete(todo(monthly(31), '2027-04-30'), '2027-04-30').due, '2027-05-31');
  assert.equal(complete(todo(monthly(31), '2027-01-31'), '2027-03-05').due, '2027-03-31');
  assert.deepEqual(chain(monthly(30), '2027-01-30', 2), ['2027-02-28', '2027-03-30']);
  assert.equal(complete(todo(monthly(15), '2027-05-15'), '2027-05-20').due, '2027-06-15');
  assert.equal(nextAfter(monthly(31), '2026-12-31'), '2027-01-31');
  assert.equal(nextAfter(yearly(12, 31), '2026-12-31'), '2027-12-31');
});

test('weekly (cases 25-31)', () => {
  assert.equal(complete(todo(weekly(1), '2026-11-02'), '2026-11-02').due, '2026-11-09');
  // Mon/Wed/Fri overdue from Mon 2 Nov, completed Thu 5 Nov -> Fri
  assert.equal(complete(todo(weekly(1, 3, 5), '2026-11-02'), '2026-11-05').due, '2026-11-06');
  // skip the same item on Wed (today is scheduled) and on Thu
  assert.equal(skip(todo(weekly(1, 3, 5), '2026-11-02'), '2026-11-04').due, '2026-11-04');
  assert.equal(skip(todo(weekly(1, 3, 5), '2026-11-02'), '2026-11-05').due, '2026-11-06');
  assert.equal(nextAfter(weekly(0), '2026-12-27'), '2027-01-03');
  assert.equal(schedule(weekly(1), '2026-11-04').due, '2026-11-09'); // Wed -> next Mon
  const all7 = todo(weekly(0, 1, 2, 3, 4, 5, 6), '2026-11-01');
  assert.equal(isOverdue(all7, '2026-11-03'), true); // not daily, so it can be overdue
});

test('daily is never overdue (cases 5, 9, 16)', () => {
  const t = todo(daily, '2026-10-29');
  assert.equal(effectiveDue(t, '2026-11-01'), '2026-11-01');
  assert.equal(isOverdue(t, '2026-11-01'), false);
  assert.equal(isInToday(t, '2026-11-01'), true);
  assert.equal(complete(t, '2026-11-01').due, '2026-11-02');
  assert.equal(nextAfter(daily, '2028-02-28'), '2028-02-29');
  assert.equal(nextAfter(daily, '2028-02-29'), '2028-03-01');
});

test('one-offs: overdue and today (case 9)', () => {
  const t = todo(null, '2026-10-31');
  assert.equal(isOverdue(t, '2026-11-01'), true);
  assert.equal(isInToday(t, '2026-11-01'), true);
  assert.equal(isInToday(todo(null, '2026-11-02'), '2026-11-01'), false);
});

test('complete: one-off deletes, recurring records lastDone, early completion advances past due', () => {
  assert.equal(complete(todo(null, '2026-11-01'), '2026-11-01'), DELETE);
  const done = complete(todo(weekly(1), '2026-11-02'), '2026-11-02');
  assert.equal(done.lastDone, '2026-11-02');
  // due in the future, completed early: moves past that due date
  assert.equal(complete(todo(weekly(1), '2026-11-09'), '2026-11-04').due, '2026-11-16');
});

test('tomorrow (cases 8, 32-35)', () => {
  assert.equal(tomorrow(todo(weekly(1), '2026-11-02'), '2026-11-02').due, '2026-11-03');
  // done on Tue -> next Mon
  assert.equal(complete(tomorrow(todo(weekly(1), '2026-11-02'), '2026-11-02'), '2026-11-03').due, '2026-11-09');
  // not done Tue -> overdue Wed
  assert.equal(isOverdue(tomorrow(todo(weekly(1), '2026-11-02'), '2026-11-02'), '2026-11-04'), true);
  // Mon/Tue rule pushed to Tue: one item, next after completion is Mon
  const pushed = tomorrow(todo(weekly(1, 2), '2026-11-02'), '2026-11-02');
  assert.equal(complete(pushed, '2026-11-03').due, '2026-11-09');
  // overdue one-off is no longer overdue
  const moved = tomorrow(todo(null, '2026-10-28'), '2026-11-01');
  assert.equal(moved.due, '2026-11-02');
  assert.equal(isOverdue(moved, '2026-11-01'), false);
  // uses the day it runs, not a stale render (case 8)
  assert.equal(tomorrow(todo(null, '2026-11-01'), '2026-11-02').due, '2026-11-03');
});

test('skip (cases 36-37)', () => {
  const d = todo(daily, '2026-10-29');
  assert.equal(skip(d, '2026-11-01').due, '2026-11-02');
  const r = todo(weekly(1), '2026-11-02', { lastDone: '2026-10-26' });
  assert.equal(skip(r, '2026-11-02').lastDone, '2026-10-26');
  assert.equal(skip(r, '2026-11-02').due, '2026-11-09');
  assert.throws(() => skip(todo(null, '2026-11-01'), '2026-11-01'));
});

test('schedule and anchorRule', () => {
  assert.deepEqual(schedule(null, '2026-11-01'), { recur: null, due: '2026-11-01' });
  assert.deepEqual(schedule(monthly(1), '2027-01-31'), { recur: monthly(31), due: '2027-01-31' });
  assert.deepEqual(anchorRule(yearly(1, 1), '2028-02-29'), yearly(2, 29));
  assert.deepEqual(anchorRule(weekly(3, 1, 3), '2026-11-01'), weekly(1, 3));
  assert.deepEqual(schedule(yearly(1, 1), '2027-01-10').recur, yearly(1, 10));
});

test('transitions do not mutate the input', () => {
  const t = Object.freeze(todo(weekly(1), '2026-11-02'));
  complete(t, '2026-11-02');
  tomorrow(t, '2026-11-02');
  skip(t, '2026-11-02');
});

const every = (n, unit) => ({ freq: 'interval', n, unit });

test('interval repeats count from the day it was finished', () => {
  assert.equal(nextAfter(every(14, 'days'), '2026-11-01'), '2026-11-15');
  assert.equal(nextAfter(every(2, 'weeks'), '2026-11-01'), '2026-11-15');
  assert.equal(firstOnOrAfter(every(2, 'weeks'), '2026-11-01'), '2026-11-01');
  assert.equal(schedule(every(28, 'days'), '2026-11-01').due, '2026-11-01');
  assert.equal(complete(todo(every(14, 'days'), '2026-11-01'), '2026-11-01').due, '2026-11-15');
  assert.equal(complete(todo(every(14, 'days'), '2026-10-20'), '2026-11-01').due, '2026-11-15');
  assert.equal(complete(todo(every(1, 'days'), '2026-11-01'), '2026-11-01').lastDone, '2026-11-01');
});

test('interval counts from today even when the due date is in the future', () => {
  assert.equal(complete(todo(every(14, 'days'), '2026-11-10'), '2026-11-01').due, '2026-11-15');
  assert.equal(skip(todo(every(14, 'days'), '2026-11-10'), '2026-11-01').due, '2026-11-15');
});

test('skipping an interval todo restarts the count from today', () => {
  assert.equal(skip(todo(every(14, 'days'), '2026-11-01'), '2026-11-01').due, '2026-11-15');
  assert.equal(skip(todo(every(14, 'days'), '2026-10-20'), '2026-11-01').due, '2026-11-15');
});

test('anchorRule keeps an interval rule as it is', () => {
  assert.deepEqual(anchorRule({ freq: 'interval', n: 2, unit: 'weeks', extra: 1 }, '2026-11-01'), every(2, 'weeks'));
});
