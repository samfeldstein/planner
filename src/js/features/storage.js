// Asks iOS to keep the data (navigator.storage.persist) once there is something worth keeping,
// and shows the result on the More screen. A grant is heuristic and never blocks the app;
// the backup banner is the real safety net.

export function init({ store }) {
  const line = document.getElementById('storageStatus');

  async function refresh() {
    if (!navigator.storage?.persisted) {
      line.textContent = 'Storage: status unknown here. Keep backups current.';
      return;
    }
    const persisted = await navigator.storage.persisted().catch(() => false);
    line.textContent = persisted
      ? 'Storage: protected from automatic clearing.'
      : 'Storage: iOS may clear it. Keep backups current.';
  }

  async function ask() {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch { /* not granted; the status line says so */ }
    refresh();
  }

  store.on((e) => { if (e.type === 'add') ask(); });
  document.getElementById('moreBtn').addEventListener('click', refresh);
  if (store.todos().length) ask();
  else refresh();
}
