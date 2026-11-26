// Finished rows: a todo checked off today stays drawn struck through, from a snapshot taken just
// before the check-off, and tapping it again puts that snapshot back. Pure.
//
// Each finished entry is either in place (struck through in the list, where tapping it undoes it) or
// put away (hidden, and only counted in the header's done of total). Leaving the app puts every entry
// away, so todos checked off so far are out of the way on return; one checked off after that stays in
// place until the next time. Put-away entries are kept so the count holds until the day rolls over.
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

// The saved record is { date, todos: [snapshots, in check-off order], away: [ids] }. Records from
// before put-away existed have no `away`; their entries load in place. Another day's record loads empty.
// `todos` is a Map of id -> snapshot (its order is the check-off order); `away` a Set of ids.
export function parseFinished(json, today) {
  const todos = new Map();
  const away = new Set();
  try {
    const saved = JSON.parse(json);
    if (saved?.date === today && Array.isArray(saved.todos)) {
      for (const t of saved.todos) todos.set(t.id, t);
      for (const id of Array.isArray(saved.away) ? saved.away : []) if (todos.has(id)) away.add(id);
    }
  } catch { /* unreadable: start empty */ }
  return { todos, away };
}

export const serializeFinished = (date, todos, away) =>
  JSON.stringify({ date, todos: [...todos.values()], away: [...away].filter((id) => todos.has(id)) });

// Puts every finished entry away. True if any moved.
export function putAway(todos, away) {
  let changed = false;
  for (const id of todos.keys()) {
    if (away.has(id)) continue;
    away.add(id);
    changed = true;
  }
  return changed;
}

// Snapshots drawn in the list, and those put away, each in check-off order.
export function splitFinished(todos, away) {
  const inPlace = [];
  const put = [];
  for (const [id, t] of todos) (away.has(id) ? put : inPlace).push(t);
  return { inPlace, away: put };
}

// Forgets an entry (undone, or no longer undoable). A later check-off starts it in place.
export function dropFinished(todos, away, id) {
  todos.delete(id);
  away.delete(id);
}

// Brings every snapshot up to date with the live todo (`lookup(id)`), dropping those that can no
// longer be undone. True if anything changed.
export function reconcileAll(todos, away, lookup, day) {
  let changed = false;
  for (const [id, snap] of todos) {
    const next = reconcile(snap, lookup(id), day);
    if (next && JSON.stringify(next) === JSON.stringify(snap)) continue;
    if (next) todos.set(id, next);
    else dropFinished(todos, away, id);
    changed = true;
  }
  return changed;
}
