// Boot: open storage, load the store, start the clock, then start each feature.
// Features talk through the store, the clock, and "planner:*" document events, never by importing each other.

import { createClock } from './core/clock.js';
import { createIdbAdapter } from './data/db.js';
import { createStore } from './data/store.js';
import * as sheet from './features/sheet.js';
import * as todayView from './features/today-view.js';
import * as toast from './features/toast.js';

const features = [todayView, sheet, toast];

function fail(message) {
  document.getElementById('list').innerHTML = '';
  const p = document.createElement('p');
  p.className = 'empty';
  p.setAttribute('role', 'alert');
  p.textContent = message;
  document.getElementById('list').append(p);
  document.getElementById('addBtn').disabled = true;
}

async function boot() {
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
