// Record shapes, normalize (strip unknown fields), validate, and format upgrades.
// Used by IndexedDB migrations and by backup import, so both share one path.

import { isValid } from './date.js';

export const CURRENT_FORMAT = 2;

// The parts of the day. Every todo is in exactly one; they are sections, not groups.
export const PARTS = ['morning', 'afternoon', 'night'];
export const PART_NAMES = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };
export const isPart = (p) => PARTS.includes(p);

const TODO_KEYS = ['id', 'title', 'due', 'part', 'groupId', 'priority', 'recur', 'lastDone', 'createdAt', 'updatedAt'];
const GROUP_KEYS = ['id', 'name', 'order', 'createdAt'];

const pick = (rec, keys) => Object.fromEntries(keys.filter((k) => k in rec).map((k) => [k, rec[k]]));

// Append a step per format bump: (rec) => rec for fromFormat -> fromFormat + 1.
const todoSteps = {
  1: (rec) => ({ ...rec, part: isPart(rec.part) ? rec.part : 'morning' }),
};
const groupSteps = {
  1: (rec) => rec,
};

function run(steps, rec, fromFormat) {
  let out = rec;
  for (let f = fromFormat; f < CURRENT_FORMAT; f++) out = steps[f](out);
  return out;
}

export const upgradeTodo = (rec, fromFormat) => run(todoSteps, rec, fromFormat);
export const upgradeGroup = (rec, fromFormat) => run(groupSteps, rec, fromFormat);

// Upgrades whole lists, for steps that need both stores. Format 1 -> 2: a group named Morning,
// Afternoon, or Night (the old app's import made them) becomes that part: its todos move into
// the part, ungrouped, and the group goes. Every other todo lands in Morning.
export function upgradeAll({ todos, groups }, fromFormat) {
  let t = todos.map((rec) => upgradeTodo(rec, fromFormat));
  let g = groups.map((rec) => upgradeGroup(rec, fromFormat));
  if (fromFormat < 2) {
    const partOf = new Map();
    for (const grp of g) {
      const key = typeof grp.name === 'string' ? grp.name.trim().toLowerCase() : '';
      if (isPart(key)) partOf.set(grp.id, key);
    }
    t = t.map((rec) => (partOf.has(rec.groupId) ? { ...rec, part: partOf.get(rec.groupId), groupId: null } : rec));
    g = g.filter((grp) => !partOf.has(grp.id));
  }
  return { todos: t, groups: g };
}

export function normalizeTodo(rec) {
  const t = pick(rec, TODO_KEYS);
  t.title = typeof t.title === 'string' ? t.title.trim() : t.title;
  t.groupId = t.groupId ?? null;
  t.priority = t.priority ?? 0;
  t.recur = t.recur ?? null;
  t.lastDone = t.lastDone ?? null;
  return t;
}

export const normalizeGroup = (rec) => pick(rec, GROUP_KEYS);

// Groups in the order the user arranged them; groups without an order, then ties, go A to Z.
export const sortGroups = (groups) =>
  [...groups].sort((a, b) =>
    (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

// "Other" and the part names can't be group names.
export const isReservedGroupName = (name) => ['other', ...PARTS].includes(name.trim().toLowerCase());

function validRecur(r) {
  if (r === null) return true;
  if (!r || typeof r !== 'object') return false;
  switch (r.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return Array.isArray(r.weekdays) && r.weekdays.length > 0 &&
        r.weekdays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    case 'interval':
      return Number.isInteger(r.n) && r.n >= 1 && r.n <= 365 && (r.unit === 'days' || r.unit === 'weeks');
    case 'monthly':
      return Number.isInteger(r.monthDay) && r.monthDay >= 1 && r.monthDay <= 31;
    case 'yearly':
      return Number.isInteger(r.month) && r.month >= 1 && r.month <= 12 &&
        Number.isInteger(r.monthDay) && r.monthDay >= 1 && r.monthDay <= 31;
    default:
      return false;
  }
}

// Returns an error string, or null when valid.
export function validateTodo(t) {
  if (typeof t.id !== 'string' || !t.id) return 'todo has no id';
  if (typeof t.title !== 'string' || !t.title) return 'todo has an empty title';
  if (!isValid(t.due)) return `todo "${t.title}" has an invalid due date`;
  if (!isPart(t.part)) return `todo "${t.title}" has no morning, afternoon, or night`;
  if (t.priority !== 0 && t.priority !== 1) return `todo "${t.title}" has an invalid priority`;
  if (!validRecur(t.recur)) return `todo "${t.title}" has an invalid repeat rule`;
  if (t.lastDone !== null && !isValid(t.lastDone)) return `todo "${t.title}" has an invalid last-done date`;
  return null;
}

export function validateGroup(g) {
  if (typeof g.id !== 'string' || !g.id) return 'group has no id';
  if (typeof g.name !== 'string' || !g.name.trim()) return 'group has an empty name';
  if (isReservedGroupName(g.name)) return `a group cannot be named "${g.name.trim()}"`;
  if (g.order !== undefined && !Number.isFinite(g.order)) return `group "${g.name}" has an invalid order`;
  return null;
}
