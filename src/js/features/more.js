// The More screen: backup status, export, and import. Groups render into it from groups.js.

import { BackupError, parseBackup } from '../data/backup.js';
import { confirmDialog } from '../ui/confirm.js';
import { exportBackup } from '../ui/export.js';
import { mediumDate } from '../ui/format.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function init({ store }) {
  const dialog = document.getElementById('more');
  const status = document.getElementById('backupStatus');
  const note = document.getElementById('importNote');
  const errorEl = document.getElementById('importError');
  const file = document.getElementById('importFile');

  const showError = (text) => {
    errorEl.textContent = text;
    errorEl.hidden = !text;
  };

  function refresh() {
    const last = store.lastBackupAt();
    status.textContent = last ? `Last backup: ${mediumDate(last)}.` : 'No backup yet. A backup is a file you can keep in Files.';
  }

  const close = () => { if (dialog.open) dialog.close(); };

  document.getElementById('moreBtn').addEventListener('click', () => {
    note.textContent = '';
    showError('');
    refresh();
    dialog.showModal();
  });
  document.getElementById('moreDone').addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  document.getElementById('exportBtn').addEventListener('click', () => {
    note.textContent = '';
    showError('');
    exportBackup(store).then(
      (result) => { if (result !== 'cancelled') note.textContent = 'Backup saved.'; },
      () => showError("Couldn't back up. Try again."),
    );
  });

  document.getElementById('importBtn').addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const picked = file.files[0];
    file.value = '';
    if (!picked) return;
    note.textContent = '';
    showError('');
    try {
      const parsed = parseBackup(await picked.text());
      const ok = await confirmDialog({
        title: 'Replace all todos?',
        message: `Your ${plural(store.todos().length, 'todo', 'todos')} and ${plural(store.groups().length, 'group', 'groups')} will be replaced by ` +
          `${plural(parsed.todos.length, 'todo', 'todos')} and ${plural(parsed.groups.length, 'group', 'groups')} from the backup of ${mediumDate(parsed.exportedAt)}. This can't be undone.`,
        action: 'Replace all',
        danger: true,
      });
      if (!ok) return;
      await store.replaceAll(parsed);
      refresh();
      note.textContent = `Imported ${plural(parsed.todos.length, 'todo', 'todos')}.`;
    } catch (err) {
      showError(err instanceof BackupError ? err.message : "Couldn't import. Try again.");
    }
  });

  store.on(refresh);
}
