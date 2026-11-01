// Today view model: todos due today or overdue, grouped. Groups A to Z, "Other" last,
// empty groups hidden. Inside a group: top priority first, then oldest due, then creation order.

import { effectiveDue, isInToday } from './recur.js';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function buildToday(todos, groups, today) {
  const known = new Set(groups.map((g) => g.id));
  const due = todos
    .filter((t) => isInToday(t, today))
    .sort((a, b) =>
      b.priority - a.priority ||
      (effectiveDue(a, today) < effectiveDue(b, today) ? -1 : effectiveDue(a, today) > effectiveDue(b, today) ? 1 : 0) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const sections = [...groups].sort(byName)
    .map((group) => ({ group, todos: due.filter((t) => t.groupId === group.id) }));
  sections.push({ group: null, todos: due.filter((t) => t.groupId === null || !known.has(t.groupId)) });
  return sections.filter((s) => s.todos.length > 0);
}
