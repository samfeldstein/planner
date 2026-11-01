// Today view model: todos due today or overdue. Top-priority todos form one section above the
// groups. Groups follow the user's order, "Other" last, empty sections hidden. Inside a section:
// oldest due first, then creation order.

import { sortGroups } from './model.js';
import { effectiveDue, isInToday } from './recur.js';

export function buildToday(todos, groups, today) {
  const known = new Set(groups.map((g) => g.id));
  const due = todos
    .filter((t) => isInToday(t, today))
    .sort((a, b) =>
      (effectiveDue(a, today) < effectiveDue(b, today) ? -1 : effectiveDue(a, today) > effectiveDue(b, today) ? 1 : 0) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const rest = due.filter((t) => !t.priority);
  const sections = [{ group: null, priority: true, todos: due.filter((t) => t.priority) }];
  for (const group of sortGroups(groups)) sections.push({ group, todos: rest.filter((t) => t.groupId === group.id) });
  sections.push({ group: null, todos: rest.filter((t) => t.groupId === null || !known.has(t.groupId)) });
  return sections.filter((s) => s.todos.length > 0);
}
