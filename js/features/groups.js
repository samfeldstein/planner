// Group management inside the More screen: rename in place, delete with a confirm.
// Deleting a group moves its todos to "Other". Groups are created from the Add sheet.

import { confirmDialog } from '../ui/confirm.js';

export function init({ store }) {
  const list = document.getElementById('groupsList');
  const empty = document.getElementById('groupsEmpty');
  const errorEl = document.getElementById('groupsError');

  const showError = (text) => {
    errorEl.textContent = text;
    errorEl.hidden = !text;
  };

  function render() {
    const groups = [...store.groups()].sort((a, b) => a.name.localeCompare(b.name));
    empty.hidden = groups.length > 0;
    list.replaceChildren();
    for (const g of groups) {
      const li = document.createElement('li');
      li.dataset.id = g.id;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = g.name;
      input.setAttribute('aria-label', `Group name: ${g.name}`);
      input.autocomplete = 'off';

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'text-btn danger';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete group ${g.name}`);

      li.append(input, del);
      list.append(li);
    }
  }

  list.addEventListener('change', async (e) => {
    const input = e.target.closest('input');
    if (!input) return;
    showError('');
    try {
      await store.renameGroup(input.closest('li').dataset.id, input.value);
    } catch (err) {
      showError(err.message);
      render();
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const group = store.groups().find((g) => g.id === id);
    if (!group) return;
    showError('');
    const ok = await confirmDialog({
      title: `Delete ${group.name}?`,
      message: `Todos in ${group.name} move to Other.`,
      action: 'Delete group',
      danger: true,
    });
    if (!ok) return;
    try {
      await store.deleteGroup(id);
    } catch {
      showError("Couldn't delete the group. Try again.");
    }
  });

  store.on((e) => { if (['group', 'undo', 'import'].includes(e.type)) render(); });
  render();
}
