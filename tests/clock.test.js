import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, msUntilMidnight } from '../src/js/core/clock.js';
import { addDays, todayLocal } from '../src/js/core/date.js';

test('daychange fires once when the local date changes (cases 6-7)', () => {
  let now = new Date(2026, 10, 1, 23, 59, 59);
  const clock = createClock({ now: () => now });
  const seen = [];
  clock.on((d) => seen.push(d));
  clock.check();
  assert.deepEqual(seen, []);
  now = new Date(2026, 10, 2, 0, 0, 1);
  clock.check();
  clock.check();
  assert.deepEqual(seen, ['2026-11-02']);
  assert.equal(clock.today(), '2026-11-02');
});

test('reopening after hours in the background catches up (case 7)', () => {
  let now = new Date(2026, 10, 1, 22, 0, 0);
  const clock = createClock({ now: () => now });
  const seen = [];
  clock.on((d) => seen.push(d));
  now = new Date(2026, 10, 2, 8, 0, 0);
  clock.check();
  assert.deepEqual(seen, ['2026-11-02']);
});

test('phone date moved back a week does not crash (case 10)', () => {
  let now = new Date(2026, 10, 8, 12);
  const clock = createClock({ now: () => now });
  now = new Date(2026, 10, 1, 12);
  clock.check();
  assert.equal(clock.today(), '2026-11-01');
});

test('msUntilMidnight lands on the next local day, including DST days', () => {
  for (const [y, m, d] of [[2026, 2, 8], [2026, 2, 29], [2026, 9, 25], [2026, 10, 1], [2026, 8, 6], [2026, 9, 4], [2027, 2, 14]]) {
    for (const h of [0, 1, 2, 3, 12, 23]) {
      const now = new Date(y, m, d, h, 15);
      const ms = msUntilMidnight(now);
      const today = todayLocal(now);
      assert.ok(ms > 0 && ms <= 25 * 36e5, `${today} ${h}h: ${ms}`);
      assert.equal(todayLocal(new Date(now.getTime() + ms + 1000)), addDays(today, 1), `${today} ${h}h`);
    }
  }
});

test('start and stop run without a DOM', () => {
  const clock = createClock();
  clock.start({ doc: undefined, win: undefined });
  clock.stop();
});
