// Swipe right on a todo in today's list to show its actions (the row's .actions strip: Tomorrow, Skip, and Edit)
// in the row: they slide in from the left edge and the task slides right, so nothing above or below moves.
// Touch and pen only; a mouse uses right-click. A row is open when swiped, or slid open by keyboard focus on one
// of its actions. Any tap while a row is open only closes it (its click is swallowed, so it can't complete a
// todo), except a tap on that row's own actions, which goes through and closes any other open row; today-view
// closes that row when one of its buttons is tapped. The open state is the row's .swiped class; render()
// redraws rows closed.

import { classify, offset, settle } from '../core/swipe.js';

const CLICK_GRACE_MS = 500; // a swallowed tap's click must arrive this soon after the finger lifts

export function init({ list }) {
  let gesture = null; // { pointerId, li, x, y, kind, max, off }
  let suppress = false;
  let suppressTimer = 0;

  // Open by a swipe, or slid open by keyboard focus on one of its actions (CSS).
  const openRows = () => [...list.querySelectorAll('.row.swiped, .row:has(.actions :focus-visible)')];
  // The row's own actions work as usual; none of them completes a todo.
  const inOwnControls = (li, target) => !!li.querySelector('.actions')?.contains(target);
  const swipeable = (li) => li && list.contains(li) && li.closest('.today') && li.querySelector('.actions');

  function clearSuppress() {
    suppress = false;
    clearTimeout(suppressTimer);
  }

  // Leaves the row as it should rest: dragging and the inline offset gone.
  function end() {
    if (gesture?.li.isConnected) {
      gesture.li.classList.remove('dragging');
      gesture.li.style.removeProperty('--swipe');
    }
    gesture = null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return; // a second finger leaves the first one's swipe or dismiss alone
    clearSuppress();
    end();
    const open = openRows();
    if (open.length) {
      // A right-click closes open rows and goes through (it opens its own row).
      const own = e.button === 0 ? open.find((li) => inOwnControls(li, e.target)) : null;
      for (const li of open) {
        if (li === own) continue; // closed by today-view on its click (the button must not slide away under the finger)
        li.classList.remove('swiped');
        if (li.contains(document.activeElement)) document.activeElement.blur();
      }
      if (own || e.button !== 0) return;
      suppress = true; // the timer starts when the finger lifts
      return;
    }
    if (e.button !== 0 || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
    const li = e.target.closest('.task')?.closest('.row');
    if (!swipeable(li)) return;
    gesture = { pointerId: e.pointerId, li, x: e.clientX, y: e.clientY, kind: 'pending', max: 0, off: 0 };
  });

  document.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (!gesture.li.isConnected) { end(); return; }
    const dx = e.clientX - gesture.x;
    if (gesture.kind === 'pending') {
      gesture.kind = classify(dx, e.clientY - gesture.y);
      if (gesture.kind === 'scroll') { end(); return; }
      if (gesture.kind === 'pending') return;
      gesture.max = gesture.li.querySelector('.actions').getBoundingClientRect().width;
      gesture.li.classList.add('dragging');
    }
    gesture.off = offset(dx, gesture.max);
    gesture.li.style.setProperty('--swipe', `${gesture.off}px`);
  });

  document.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return; // a second finger lifting leaves the first one's swallow alone
    if (suppress) {
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(clearSuppress, CLICK_GRACE_MS);
    }
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const { li, kind, off, max } = gesture;
    if (kind === 'swipe' && li.isConnected) {
      const opening = settle(off, max) === 'open';
      end(); // the transition runs from the finger's position to the rest position
      li.classList.toggle('swiped', opening);
      suppress = true; // in case a click follows the drag
      suppressTimer = setTimeout(clearSuppress, CLICK_GRACE_MS);
      return;
    }
    end();
  });

  // The browser took the touch (a scroll began): back to closed. No setPointerCapture: a touch is
  // already captured to the element under the finger, and moving it would fire lostpointercapture.
  document.addEventListener('pointercancel', (e) => {
    if (!e.isPrimary) return; // the browser took only a second finger
    clearSuppress();
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    end();
  });

  // Before anything else sees it: the click of a dismiss tap or a drag.
  document.addEventListener('click', (e) => {
    if (!suppress) return;
    clearSuppress();
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
