// Export a backup through the iOS share sheet, falling back to a download.
// navigator.share must run inside the tap, so the file is built synchronously from memory
// and nothing is awaited before the call. Resolves "shared", "downloaded", or "cancelled";
// only the first two count as a backup.

import { serializeBackup } from '../data/backup.js';

export function exportBackup(store, now = new Date()) {
  const { name, json } = serializeBackup(store.snapshot(), now);
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).then(
      async () => { await store.markBackedUp(); return 'shared'; },
      (err) => {
        if (err?.name === 'AbortError') return 'cancelled';
        throw err;
      },
    );
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return store.markBackedUp().then(() => 'downloaded');
}
