// Today view model: todos due today or overdue, as one list. Top-priority todos first, then the
// groups in the user's order, then ungrouped todos. Empty groups are hidden. Inside a list: oldest
// due first, then creation order. A todo's stored part of the day isn't shown or used for order.

import { sortGroups } from './model.js';
import { effectiveDue, isInToday } from './recur.js';

// The part a new todo is stored with: Morning before noon, Afternoon until 5 pm, Night after.
export function partAt(date) {
  const h = date.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night';
}

export function buildToday(todos, groups, today) {
  const known = new Set(groups.map((g) => g.id));
  const due = todos
    .filter((t) => isInToday(t, today))
    .sort((a, b) =>
      (effectiveDue(a, today) < effectiveDue(b, today) ? -1 : effectiveDue(a, today) > effectiveDue(b, today) ? 1 : 0) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const rest = due.filter((t) => !t.priority);

  return {
    priority: due.filter((t) => t.priority),
    groups: sortGroups(groups)
      .map((group) => ({ group, todos: rest.filter((t) => t.groupId === group.id) }))
      .filter((g) => g.todos.length > 0),
    ungrouped: rest.filter((t) => t.groupId === null || !known.has(t.groupId)),
  };
}

// Every todo in the list, in the order it is drawn.
export const listTodos = (s) => [...s.priority, ...s.groups.flatMap((g) => g.todos), ...s.ungrouped];
