// Upcoming list model: todos due after today, one entry per day, earliest first. A repeating todo
// shows once, on its stored due date (its next instance); later occurrences are never expanded.
// Inside a day: Morning, Afternoon, then Night, then creation order.

import { PARTS } from './model.js';
import { isInToday } from './recur.js';

const partRank = (t) => Math.max(0, PARTS.indexOf(t.part));

export function buildUpcoming(todos, today) {
  const later = todos
    .filter((t) => !isInToday(t, today))
    .sort((a, b) =>
      (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) ||
      partRank(a) - partRank(b) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const days = [];
  for (const t of later) {
    if (days.at(-1)?.date !== t.due) days.push({ date: t.due, todos: [] });
    days.at(-1).todos.push(t);
  }
  return days;
}
