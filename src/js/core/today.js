// Today view model: todos due today or overdue, in three fixed sections (Morning, Afternoon,
// Night), each always present. Inside a section: top-priority todos first, then the groups in the
// user's order, then ungrouped todos. Empty groups are hidden. Inside a list: oldest due first,
// then creation order. Overdue todos stay in their own section.

import { PARTS, isPart, sortGroups } from './model.js';
import { effectiveDue, isInToday } from './recur.js';

// The part a new todo lands in: Morning before noon, Afternoon until 5 pm, Night after.
export function partAt(date) {
  const h = date.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night';
}

// A record from before parts existed (a finished-row snapshot, say) counts as Morning.
const partOf = (t) => (isPart(t.part) ? t.part : 'morning');

export function buildToday(todos, groups, today) {
  const known = new Set(groups.map((g) => g.id));
  const due = todos
    .filter((t) => isInToday(t, today))
    .sort((a, b) =>
      (effectiveDue(a, today) < effectiveDue(b, today) ? -1 : effectiveDue(a, today) > effectiveDue(b, today) ? 1 : 0) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const ordered = sortGroups(groups);

  return PARTS.map((part) => {
    const mine = due.filter((t) => partOf(t) === part);
    const rest = mine.filter((t) => !t.priority);
    return {
      part,
      priority: mine.filter((t) => t.priority),
      groups: ordered
        .map((group) => ({ group, todos: rest.filter((t) => t.groupId === group.id) }))
        .filter((g) => g.todos.length > 0),
      ungrouped: rest.filter((t) => t.groupId === null || !known.has(t.groupId)),
    };
  });
}

// Every todo in a section, in the order it is drawn.
export const sectionTodos = (s) => [...s.priority, ...s.groups.flatMap((g) => g.todos), ...s.ungrouped];
