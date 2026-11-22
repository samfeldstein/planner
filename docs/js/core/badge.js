// Counts for the app-icon badge and the daily notification. Pure: todos and civil dates in,
// numbers and text out. sw.js keeps a copy of notificationText (it can't import); a test keeps them equal.

import { addDays } from './date.js';
import { isInToday } from './recur.js';

// Undone todos due on `day` or overdue. Checked-off rows are already gone or moved by complete().
export const dueCount = (todos, day) => todos.filter((t) => isInToday(t, day)).length;

// { "YYYY-MM-DD": n } for `days` days starting today. Exact: a day's count depends only on the todos.
export function forecast(todos, today, days = 31) {
  const counts = {};
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    counts[day] = dueCount(todos, day);
  }
  return counts;
}

// n may be null for "unknown" (no forecast for today). The line is the title, with no body:
// iOS already names the app above it, so a "Planner" title read as "Planner, from Planner".
export function notificationText(n) {
  const title = n === null || n === undefined ? 'Open Planner to see today'
    : n === 0 ? 'Nothing due today'
    : `${n} due today`;
  return { title };
}

// A VAPID public key arrives as base64url; subscribe() wants bytes.
export function base64UrlToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
