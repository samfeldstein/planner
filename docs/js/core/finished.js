// Finished rows: a todo checked off today stays drawn struck through, from a snapshot taken just
// before the check-off, and tapping it again puts that snapshot back. Pure.
//
// The todo can change in between: Upcoming opens a repeating todo's next instance for editing or
// deletion. So before a finished row is drawn or undone, its snapshot is brought up to date:
// undo reverts only the check-off (due, rule, last done) and keeps every later edit.

import { DELETE, complete } from './recur.js';

export const FINISHED_KEY = 'planner:finished';

// Rules compared field by field, so key order doesn't matter.
const ruleKey = (r) => (r ? JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]])) : '');
const sameSchedule = (a, b) => a.due === b.due && a.lastDone === b.lastDone && ruleKey(a.recur) === ruleKey(b.recur);

// The record to keep for a finished row, given the live todo now (or undefined) and the day it
// was checked off. Null means the check-off can no longer be undone and the row should go: the
// todo was deleted, or its schedule was edited since, so the edit wins.
export function reconcile(snapshot, current, day) {
  const after = complete(snapshot, day);
  if (!current) return after === DELETE ? snapshot : null;
  // Before the check-off is saved the live todo still matches the snapshot; after, it matches
  // what the check-off made. Either way only the schedule is reverted.
  const pending = sameSchedule(current, snapshot);
  if (!pending && (after === DELETE || !sameSchedule(current, after))) return null;
  return { ...current, due: snapshot.due, recur: snapshot.recur, lastDone: snapshot.lastDone };
}
