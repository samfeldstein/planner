// Service worker registration and the update flow. An installed iOS app is usually resumed, not
// relaunched, so the app asks for updates itself on resume. A waiting version is applied while the
// app is hidden; if one is ready while visible, it waits for the next hide or the Update button.

import { VERSION } from '../version.js';

const CHECK_EVERY = 10 * 60 * 1000;

function installed(worker) {
  if (!worker) return Promise.resolve(null);
  if (worker.state === 'installed') return Promise.resolve(worker);
  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') resolve(worker);
      else if (worker.state === 'redundant') resolve(null);
    });
  });
}

export function init() {
  const versionLine = document.getElementById('versionLine');
  const updateBtn = document.getElementById('updateBtn');
  const updateNote = document.getElementById('updateNote');
  versionLine.textContent = `Version ${VERSION}`;

  if (!('serviceWorker' in navigator)) {
    updateBtn.hidden = true;
    return;
  }

  // Only reload for a version switch, not for the first install claiming the page.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reg = null;
  let lastCheck = 0;
  let reloading = false;

  const apply = () => reg?.waiting?.postMessage('SKIP_WAITING');

  function ready() {
    if (document.hidden) apply();
  }

  function check(force = false) {
    if (!reg || (!force && Date.now() - lastCheck < CHECK_EVERY)) return Promise.resolve();
    lastCheck = Date.now();
    return reg.update().catch(() => {});
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then((r) => {
    reg = r;
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) ready();
      });
    });
    if (reg.waiting && navigator.serviceWorker.controller) ready();
    check(true);
  }).catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) apply();
    else check();
  });

  updateBtn.addEventListener('click', async () => {
    updateNote.textContent = 'Checking…';
    await check(true);
    const waiting = reg?.waiting ?? await installed(reg?.installing);
    if (waiting && navigator.serviceWorker.controller) {
      updateNote.textContent = 'Updating…';
      apply();
    } else {
      updateNote.textContent = 'You have the latest version.';
    }
  });
}
