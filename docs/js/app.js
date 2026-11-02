// Boot: open storage, load the store, start the clock, then start each feature.
// Features talk through the store, the clock, and "planner:*" document events, never by importing each other.

import { createClock } from './core/clock.js';
import { createIdbAdapter } from './data/db.js';
import { createStore } from './data/store.js';
import * as groups from './features/groups.js';
import * as more from './features/more.js';
import * as quickAdd from './features/quick-add.js';
import * as sheet from './features/sheet.js';
import * as staleBanner from './features/stale-banner.js';
import * as storage from './features/storage.js';
import * as todayView from './features/today-view.js';
import * as updates from './features/updates.js';
import { needsInstall } from './ui/install.js';
import * as scrollLock from './ui/scroll-lock.js';

const features = [todayView, sheet, quickAdd, groups, more, staleBanner, storage, updates, scrollLock];

// Not installed: show the install guide and write nothing, so two datasets can't drift apart.
function showGate() {
  document.getElementById('app').hidden = true;
  document.getElementById('gate').hidden = false;
}

function fail(message) {
  document.getElementById('list').innerHTML = '';
  const p = document.createElement('p');
  p.className = 'empty';
  p.setAttribute('role', 'alert');
  p.textContent = message;
  document.getElementById('list').append(p);
  document.getElementById('quickAdd').contentEditable = 'false';
  document.getElementById('addBtn').hidden = true;
}

async function boot() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (needsInstall({ hostname: location.hostname, standalone })) {
    showGate();
    return;
  }
  const clock = createClock();
  const adapter = createIdbAdapter({
    onVersionChange: () => location.reload(),
    onBlocked: () => fail('Close other Planner windows to finish updating.'),
  });
  // Actions read the day when they run, so check the clock first.
  const store = createStore({ adapter, today: () => { clock.check(); return clock.today(); } });

  try {
    await store.init();
  } catch {
    fail("Planner can't save on this device. Storage is blocked.");
    return;
  }

  clock.start();
  for (const feature of features) feature.init({ store, clock });
}

boot();
