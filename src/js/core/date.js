// Civil dates as "YYYY-MM-DD" strings. All arithmetic goes through Date.UTC so
// DST cannot shift a day. Compare with plain < > === (string order is date order).

const pad = (n, w = 2) => String(n).padStart(w, '0');

export const fmt = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export const parse = (s) => s.split('-').map(Number);

const fromUTC = (dt) => fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

export const addDays = (s, n) => {
  const [y, m, d] = parse(s);
  return fromUTC(new Date(Date.UTC(y, m - 1, d + n)));
};

export const weekday = (s) => {
  const [y, m, d] = parse(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const clampDay = (y, m, d) => fmt(y, m, Math.min(d, daysInMonth(y, m)));

export const todayLocal = (now = new Date()) =>
  fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());

export const isValid = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parse(s);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
};
