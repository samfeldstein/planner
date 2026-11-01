// Display helpers shared by features. Dates arrive as civil "YYYY-MM-DD" strings.

import { parse } from '../core/date.js';

const civil = (s) => {
  const [y, m, d] = parse(s);
  return new Date(y, m - 1, d);
};

const fmt = (options) => {
  const f = new Intl.DateTimeFormat(undefined, options);
  return (s) => f.format(civil(s));
};

export const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = fmt({ day: 'numeric', month: 'short' });

const dayOnly = fmt({ day: 'numeric' });
const weekdayOnly = fmt({ weekday: 'long' });
const monthYear = fmt({ month: 'long', year: 'numeric' });

// The header sets the day number large, so it needs the date in pieces.
export const dateParts = (s) => ({ day: dayOnly(s), weekday: weekdayOnly(s), monthYear: monthYear(s) });

export const mediumDate = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

export const daysAgo = (iso, now = new Date()) => Math.floor((now - new Date(iso)) / 864e5);

// Sunday is 0; 2026-11-01 is a Sunday.
export const weekdayName = (n) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 10, 1 + n));

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

// `rule` must be anchored (see anchorRule in core/recur.js).
export function recurSummary(rule) {
  switch (rule.freq) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Every ${WEEK_ORDER.filter((n) => rule.weekdays.includes(n)).map(weekdayName).join(', ')}`;
    case 'monthly':
      return `Every month on the ${ordinal(rule.monthDay)}${rule.monthDay > 28 ? ', or the last day' : ''}`;
    case 'yearly':
      return `Every year on ${dayMonth(`2028-${String(rule.month).padStart(2, '0')}-${String(rule.monthDay).padStart(2, '0')}`)}`;
    default:
      return '';
  }
}
