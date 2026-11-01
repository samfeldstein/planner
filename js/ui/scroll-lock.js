// Keeps the page behind an open dialog from scrolling. iOS Safari lets a drag scroll the document
// under a modal <dialog>, and overflow:hidden doesn't stop it, so the body is pinned with
// position:fixed (scroll position saved and restored). Watching the `open` attribute covers every
// dialog and every way of closing one without touching the code that opens them.

const PINNED = ['position', 'top', 'left', 'right', 'width'];

export function init() {
  const body = document.body;
  let savedY = null;

  function lock() {
    if (savedY !== null) return;
    savedY = window.scrollY;
    Object.assign(body.style, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0', width: '100%' });
  }

  function unlock() {
    if (savedY === null) return;
    const y = savedY;
    savedY = null;
    for (const prop of PINNED) body.style[prop] = '';
    window.scrollTo(0, y);
  }

  const sync = () => (document.querySelector('dialog[open]') ? lock() : unlock());

  // A dialog with nothing of its own to scroll must not move at all; one that scrolls keeps working.
  // Fields are exempt so caret and selection drags still work.
  function guard(e) {
    const dialog = e.currentTarget;
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (dialog.scrollHeight <= dialog.clientHeight) e.preventDefault();
  }

  const observer = new MutationObserver(sync);
  for (const dialog of document.querySelectorAll('dialog')) {
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('touchmove', guard, { passive: false });
  }
  sync();
}
