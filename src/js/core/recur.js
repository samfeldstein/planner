// Recurrence and todo transitions. Pure: records and civil dates in, records out.
// Readers must use effectiveDue, never todo.due, so a stale daily is never overdue.

import { addDays, clampDay, parse, weekday } from './date.js';

export const DELETE = Symbol('delete');

const maxDate = (a, b) => (a > b ? a : b);

export const intervalDays = (rule) => (rule.unit === 'weeks' ? rule.n * 7 : rule.n);

// First scheduled date strictly after d. An interval rule counts from d, which complete()
// and skip() set to the day the todo was finished or skipped.
export function nextAfter(rule, d) {
  const [y, m] = parse(d);
  switch (rule.freq) {
    case 'interval':
      return addDays(d, intervalDays(rule));
    case 'daily':
      return addDays(d, 1);
    case 'weekly':
      for (let i = 1; i <= 7; i++) {
        const c = addDays(d, i);
        if (rule.weekdays.includes(weekday(c))) return c;
      }
      throw new Error('weekly rule has no weekdays');
    case 'monthly': {
      const c = clampDay(y, m, rule.monthDay);
      if (c > d) return c;
      return m === 12 ? clampDay(y + 1, 1, rule.monthDay) : clampDay(y, m + 1, rule.monthDay);
    }
    case 'yearly': {
      const c = clampDay(y, rule.month, rule.monthDay);
      return c > d ? c : clampDay(y + 1, rule.month, rule.monthDay);
    }
    default:
      throw new Error(`unknown freq ${rule.freq}`);
  }
}

export const firstOnOrAfter = (rule, d) => (rule.freq === 'interval' ? d : nextAfter(rule, addDays(d, -1)));

// What the UI and sorting read. Never written back.
export const effectiveDue = (todo, today) =>
  todo.recur?.freq === 'daily' && todo.due < today ? today : todo.due;

export const isOverdue = (todo, today) => effectiveDue(todo, today) < today;

export const isInToday = (todo, today) => effectiveDue(todo, today) <= today;

// Fill the rule's anchor from the chosen start date.
export function anchorRule(rule, start) {
  const [, m, d] = parse(start);
  if (rule.freq === 'monthly') return { freq: 'monthly', monthDay: d };
  if (rule.freq === 'yearly') return { freq: 'yearly', month: m, monthDay: d };
  if (rule.freq === 'interval') return { freq: 'interval', n: rule.n, unit: rule.unit };
  if (rule.freq === 'weekly') return { freq: 'weekly', weekdays: [...new Set(rule.weekdays)].sort((a, b) => a - b) };
  return { freq: 'daily' };
}

// Used by create and by edit-save: returns the anchored rule and first due date.
export function schedule(recur, start) {
  if (!recur) return { recur: null, due: start };
  const rule = anchorRule(recur, start);
  return { recur: rule, due: firstOnOrAfter(rule, start) };
}

export function complete(todo, today) {
  if (!todo.recur) return DELETE;
  const base = todo.recur.freq === 'interval' ? today : maxDate(effectiveDue(todo, today), today);
  return { ...todo, due: nextAfter(todo.recur, base), lastDone: today };
}

export const tomorrow = (todo, today) => ({ ...todo, due: addDays(today, 1) });

// Recurring only. Overdue items land on the first scheduled date on or after today.
export function skip(todo, today) {
  if (!todo.recur) throw new Error('skip is recurring-only');
  const eff = effectiveDue(todo, today);
  if (todo.recur.freq === 'interval') return { ...todo, due: nextAfter(todo.recur, today) };
  const from = eff < today ? addDays(today, -1) : eff;
  return { ...todo, due: nextAfter(todo.recur, from) };
}
