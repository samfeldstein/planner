// Swipe right on a todo row to show its Options button. Pure rules, so they can be tested without a DOM.

export const SWIPE_X = 16; // px sideways before a drag counts as a swipe
export const SCROLL_Y = 10; // px up or down before it counts as a scroll

// What a drag is so far: 'pending' until it has moved far enough, then 'swipe' or 'scroll' (decided once).
export function classify(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_X && ay < SCROLL_Y) return 'pending';
  return ax > ay ? 'swipe' : 'scroll';
}

// How far the row's content has slid: the finger's distance right, from closed, kept within 0..max.
export function offset(dx, max) {
  return Math.min(Math.max(dx, 0), max);
}

// On release: open from halfway.
export function settle(off, max) {
  return max > 0 && off >= max / 2 ? 'open' : 'closed';
}
