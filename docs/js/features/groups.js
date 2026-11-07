// Group management inside the More screen: rename in place, reorder, delete with a confirm.
// Deleting a group leaves its todos ungrouped, in their sections. Groups are created from the Add sheet.

import { sortGroups } from '../core/model.js';
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
    const groups = sortGroups(store.groups());
    empty.hidden = groups.length > 0;
    list.replaceChildren();
    groups.forEach((g, i) => {
      const li = document.createElement('li');
      li.dataset.id = g.id;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = g.name;
      input.setAttribute('aria-label', `Group name: ${g.name}`);
      input.autocomplete = 'off';

      const button = (act, text, className = 'text-btn') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        b.dataset.act = act;
        b.textContent = text;
        b.setAttribute('aria-label', `${text === 'Delete' ? 'Delete group' : `Move ${text.toLowerCase()}`} ${g.name}`);
        return b;
      };
      const up = button('up', 'Up');
      up.disabled = i === 0;
      const down = button('down', 'Down');
      down.disabled = i === groups.length - 1;

      li.append(input, up, down, button('delete', 'Delete', 'text-btn danger'));
      list.append(li);
    });
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
    if (btn.dataset.act !== 'delete') {
      try {
        await store.moveGroup(id, btn.dataset.act === 'up' ? -1 : 1);
      } catch {
        showError("Couldn't reorder. Try again.");
        return;
      }
      // The list re-rendered; keep focus on the moved row, on whichever arrow still works.
      const row = list.querySelector(`li[data-id="${CSS.escape(id)}"]`);
      (row?.querySelector(`[data-act="${btn.dataset.act}"]:not(:disabled)`) ?? row?.querySelector('[data-act="up"]:not(:disabled), [data-act="down"]:not(:disabled)'))?.focus();
      return;
    }
    const ok = await confirmDialog({
      title: `Delete ${group.name}?`,
      message: `Its todos stay in their sections, without a group.`,
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
