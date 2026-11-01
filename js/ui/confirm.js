// Confirmation sheet for bulk actions only (delete group, import). Resolves true or false.

export function confirmDialog({ title, message, action, danger = false }) {
  const dialog = document.getElementById('confirm');
  const yes = document.getElementById('confirmYes');
  const no = document.getElementById('confirmNo');
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = message;
  yes.textContent = action;
  yes.classList.toggle('danger', danger);

  return new Promise((resolve) => {
    const finish = (result) => {
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('click', onBackdrop);
      if (dialog.open) dialog.close();
      resolve(result);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onClose = () => finish(false);
    const onBackdrop = (e) => { if (e.target === dialog) finish(false); };
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('click', onBackdrop);
    dialog.showModal();
    no.focus();
  });
}
