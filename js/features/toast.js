// One toast at a time, 5 s, with Undo. A new toast replaces the old one (the old action stays committed).
// It is a popover so it stays above an open sheet. Pauses while it holds focus. Shown with a "planner:toast" event: { message, undo }.

const DURATION = 5000;

export function init() {
  const el = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  const undoBtn = document.getElementById('toastUndo');
  let timer = null;
  let undo = null;
  let remaining = DURATION;
  let started = 0;

  const hide = () => {
    clearTimeout(timer);
    el.classList.remove('is-open');
    undo = null;
  };

  const run = (ms) => {
    clearTimeout(timer);
    remaining = ms;
    started = Date.now();
    timer = setTimeout(hide, ms);
  };

  document.addEventListener('planner:toast', (e) => {
    const { message, undo: fn, actionLabel } = e.detail;
    undo = fn ?? null;
    msg.textContent = message;
    undoBtn.textContent = actionLabel ?? 'Undo';
    undoBtn.hidden = !undo;
    if (el.matches(':popover-open')) el.hidePopover(); // re-show to land above any sheet opened since
    el.showPopover();
    el.classList.add('is-open');
    run(DURATION);
  });

  el.addEventListener('focusin', () => {
    if (!el.classList.contains('is-open')) return;
    clearTimeout(timer);
    remaining = Math.max(1000, remaining - (Date.now() - started));
  });
  el.addEventListener('focusout', () => {
    if (el.classList.contains('is-open')) run(remaining);
  });

  undoBtn.addEventListener('click', async () => {
    const fn = undo;
    hide();
    try {
      await fn?.();
    } catch {
      document.dispatchEvent(new CustomEvent('planner:toast', { detail: { message: "Couldn't undo" } }));
    }
  });
}
