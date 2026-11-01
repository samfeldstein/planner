// Tells the app when the local day changes. iOS freezes timers in the background,
// so visibility events are the main trigger; the midnight timer covers an app left open.

import { todayLocal } from './date.js';

export const msUntilMidnight = (now) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;

export function createClock({ now = () => new Date() } = {}) {
  const bus = new EventTarget();
  let current = todayLocal(now());
  let timer = null;

  const check = () => {
    const t = todayLocal(now());
    if (t === current) return;
    current = t;
    bus.dispatchEvent(new CustomEvent('daychange', { detail: t }));
  };

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { check(); arm(); }, msUntilMidnight(now()) + 1000);
  };

  return {
    today: () => current,
    check,
    on: (fn) => bus.addEventListener('daychange', (e) => fn(e.detail)),
    start({ doc = globalThis.document, win = globalThis.window } = {}) {
      doc?.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') check(); });
      win?.addEventListener('pageshow', check);
      win?.addEventListener('focus', check);
      arm();
    },
    stop: () => clearTimeout(timer),
  };
}
