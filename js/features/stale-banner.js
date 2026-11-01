// One-line nag at the top of Today when the last backup is over 7 days old (or there has never
// been one). Not dismissible; it goes away when a backup succeeds. Hidden when there are no todos.

import { exportBackup } from '../ui/export.js';
import { daysAgo } from '../ui/format.js';

export function init({ store, clock }) {
  const banner = document.getElementById('banner');
  const text = document.getElementById('bannerText');
  const btn = document.getElementById('bannerBtn');

  function update() {
    const stale = store.backupStale();
    banner.hidden = !stale;
    if (!stale) return;
    const last = store.lastBackupAt();
    text.textContent = last ? `Last backup ${daysAgo(last)} days ago` : 'No backup yet';
  }

  btn.addEventListener('click', () => {
    exportBackup(store).catch(() => {
      document.dispatchEvent(new CustomEvent('planner:toast', { detail: { message: "Couldn't back up. Try again." } }));
    });
  });

  store.on(update);
  clock.on(update);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') update(); });
  update();
}
