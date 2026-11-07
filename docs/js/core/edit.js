// What an edit-sheet save sends to the store: only the fields that changed. Pure.
// The form's repeat rule has no anchor (monthly and yearly take it from the date), so it is
// compared by kind, not re-anchored from the due date: a pushed instance's due date is off the
// rule's schedule, and anchoring from it would move the whole rule to the pushed day.

const days = (r) => [...new Set(r.weekdays)].sort((a, b) => a - b).join();

export function sameRule(rule, form) {
  if (!rule || !form) return !rule && !form;
  if (rule.freq !== form.freq) return false;
  if (rule.freq === 'weekly') return days(rule) === days(form);
  if (rule.freq === 'interval') return rule.n === form.n && rule.unit === form.unit;
  return true;
}

export function editPatch(todo, form) {
  const patch = {};
  if (form.title !== todo.title) patch.title = form.title;
  if (form.part !== todo.part) patch.part = form.part;
  if (form.groupId !== todo.groupId) patch.groupId = form.groupId;
  if (form.priority !== todo.priority) patch.priority = form.priority;
  if (form.due !== todo.due || !sameRule(todo.recur, form.recur)) {
    patch.due = form.due;
    patch.recur = form.recur;
  }
  return patch;
}

// Weekdays and Weekends are shortcuts in the picker, stored as a plain weekly rule, so backups
// and validation see nothing new. A weekly rule whose days match one exactly shows as it.
export const PRESETS = { weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };

export function repeatChoice(rule) {
  if (!rule) return 'never';
  if (rule.freq === 'weekly') {
    for (const [name, list] of Object.entries(PRESETS)) if (days(rule) === list.join()) return name;
  }
  return rule.freq;
}

export const presetRule = (choice) => (PRESETS[choice] ? { freq: 'weekly', weekdays: [...PRESETS[choice]] } : null);
