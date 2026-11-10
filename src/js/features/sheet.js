// The edit sheet: the whole form for one todo, or for a new one (planner:new, from the add field or
// the + button). A new todo is only created on Save or Done; Cancel or tapping outside discards it.
// Nothing is focused on open unless the opener asks (the + button, so the keyboard comes up).

import { addDays, weekday } from '../core/date.js';
import { isPart, sortGroups } from '../core/model.js';
import { partAt } from '../core/today.js';
import { editPatch, presetRule, repeatChoice } from '../core/edit.js';
import { WEEK_ORDER, shortDate, weekdayName } from '../ui/format.js';

const NEW_GROUP = '__new__';
const $ = (id) => document.getElementById(id);

export function init({ store, clock }) {
  const sheet = $('sheet');
  const form = $('sheetForm');
  // A contenteditable div, not a form field, so iOS has nothing to offer AutoFill Contact on.
  // It gets the .value of an input so the rest of this file reads it like one.
  const titleEl = $('todoText');
  Object.defineProperty(titleEl, 'value', {
    get: () => titleEl.textContent.replace(/\s*\n\s*/g, ' '),
    set: (v) => { titleEl.textContent = v; },
  });
  const dateInput = $('dateInput');
  const dateLabel = $('dateLabel');
  const groupEl = $('group');
  const newGroupEl = $('newGroup');
  const priorityEl = $('priority');
  const weekdaysEl = $('weekdays');
  const intervalEl = $('intervalFields');
  const intervalN = $('intervalN');
  const intervalUnit = $('intervalUnit');
  const errorEl = $('formError');
  const submitBtn = $('submitBtn');
  const deleteBtn = $('deleteBtn');
  const cancelBtn = $('cancelBtn');
  const headingEl = $('sheetTitle');

  let editing = null; // the todo being edited, or a draft with no id for a new one

  for (const n of WEEK_ORDER) {
    const label = document.createElement('label');
    label.className = 'chip';
    label.innerHTML = '<input type="checkbox" name="weekday"><span></span>';
    label.querySelector('input').value = n;
    label.querySelector('span').textContent = weekdayName(n);
    weekdaysEl.append(label);
  }

  const radio = (name) => form.querySelector(`input[name="${name}"]:checked`).value;
  const setRadio = (name, value) => { form.querySelector(`input[name="${name}"][value="${value}"]`).checked = true; };
  const weekdayBoxes = () => [...weekdaysEl.querySelectorAll('input')];

  function dueValue() {
    const today = clock.today();
    const which = radio('due');
    if (which === 'today') return today;
    if (which === 'tomorrow') return addDays(today, 1);
    return dateInput.value || today;
  }

  function chosenRecur() {
    const freq = radio('repeat');
    if (freq === 'never') return null;
    if (presetRule(freq)) return presetRule(freq);
    if (freq === 'weekly') {
      const days = weekdayBoxes().filter((b) => b.checked).map((b) => Number(b.value));
      return { freq, weekdays: days.length ? days : [weekday(dueValue())] };
    }
    if (freq === 'interval') return { freq, n: intervalCount(), unit: intervalUnit.value };
    return { freq };
  }

  const intervalCount = () => Math.min(365, Math.max(1, Math.floor(Number(intervalN.value)) || 1));

  function refreshRepeat() {
    const freq = radio('repeat');
    weekdaysEl.hidden = freq !== 'weekly';
    intervalEl.hidden = freq !== 'interval';
    if (freq === 'weekly' && !weekdayBoxes().some((b) => b.checked)) {
      const box = weekdayBoxes().find((b) => Number(b.value) === weekday(dueValue()));
      if (box) box.checked = true;
    }
  }

  function fillGroups(selected) {
    groupEl.replaceChildren(new Option('No group', ''));
    for (const g of sortGroups(store.groups())) groupEl.append(new Option(g.name, g.id));
    groupEl.append(new Option('New group…', NEW_GROUP));
    groupEl.value = selected ?? '';
    if (groupEl.value !== (selected ?? '')) groupEl.value = '';
    newGroupEl.hidden = groupEl.value !== NEW_GROUP;
  }

  function showError(text) {
    errorEl.textContent = text;
    errorEl.hidden = !text;
  }

  function setDate(value) {
    dateInput.value = value ?? '';
    dateLabel.textContent = value ? shortDate(value) : 'Date…';
  }

  function open(todo, { focus = false } = {}) {
    editing = todo;
    const isNew = !todo.id;
    headingEl.textContent = isNew ? 'New todo' : 'Edit todo';
    deleteBtn.hidden = isNew;
    cancelBtn.hidden = !isNew;
    const today = clock.today();
    form.reset();
    showError('');
    newGroupEl.value = '';

    setDate(null);
    for (const b of weekdayBoxes()) b.checked = false;
    titleEl.value = todo.title;
    priorityEl.checked = todo.priority === 1;
    setRadio('part', isPart(todo.part) ? todo.part : 'morning');
    if (todo.due === today) setRadio('due', 'today');
    else if (todo.due === addDays(today, 1)) setRadio('due', 'tomorrow');
    else { setRadio('due', 'date'); setDate(todo.due); }
    setRadio('repeat', repeatChoice(todo.recur));
    for (const b of weekdayBoxes()) b.checked = todo.recur?.weekdays?.includes(Number(b.value)) ?? false;
    if (todo.recur?.freq === 'interval') { intervalN.value = todo.recur.n; intervalUnit.value = todo.recur.unit; }
    fillGroups(todo.groupId);
    refreshRepeat();

    sheet.showModal(); // focus lands on the dialog itself (autofocus), so no keyboard opens
    // iOS opens the keyboard only for a focus() inside the tap's own handler, so this stays synchronous.
    if (focus) titleEl.focus();
  }

  function close() {
    if (sheet.open) sheet.close();
  }

  let saving = false;

  async function submit(e) {
    e.preventDefault();
    const todo = editing;
    if (saving || !todo) return;
    const title = titleEl.value.trim();
    if (!title) { showError('Add a task name.'); titleEl.focus(); return; }
    showError('');
    saving = true;
    submitBtn.disabled = true;
    try {
      let groupId = groupEl.value || null;
      if (groupEl.value === NEW_GROUP) {
        if (!newGroupEl.value.trim()) { showError('Name the group.'); newGroupEl.focus(); return; }
        groupId = (await store.addGroup(newGroupEl.value)).id;
      }
      const due = dueValue();
      const recur = chosenRecur();
      const priority = priorityEl.checked ? 1 : 0;
      const part = radio('part');

      if (!todo.id) {
        await store.addTodo({ title, part, groupId, priority, due, recur });
        close();
        return;
      }

      // Send only what changed, so editing a title never re-snaps a pushed-off due date.
      const patch = editPatch(todo, { title, part, groupId, priority, due, recur });
      if (!Object.keys(patch).length) { close(); return; }
      await store.updateTodo(todo.id, patch);
      close();
    } catch (err) {
      showError(err.message || "Couldn't save. Try again.");
    } finally {
      saving = false;
      submitBtn.disabled = false;
    }
  }

  document.addEventListener('planner:edit', (e) => {
    const todo = store.todo(e.detail.id);
    if (todo) open(todo);
  });

  // detail: { title, focus }. Due today, in the part of the day it is now, like the add field used to.
  document.addEventListener('planner:new', (e) => {
    const { title = '', focus = false } = e.detail ?? {};
    open({ title, due: clock.today(), part: partAt(new Date()), groupId: null, priority: 0, recur: null }, { focus });
  });

  form.addEventListener('submit', submit);
  cancelBtn.addEventListener('click', close);
  $('sheetDone').addEventListener('click', () => form.requestSubmit());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  sheet.addEventListener('close', () => { editing = null; });

  deleteBtn.addEventListener('click', async () => {
    const todo = editing;
    if (!todo) return;
    try {
      await store.deleteTodo(todo.id);
      close();
    } catch {
      showError("Couldn't delete. Try again.");
    }
  });

  titleEl.addEventListener('input', () => showError(''));
  // The div has no implicit submit, so Return does it.
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  groupEl.addEventListener('change', () => {
    newGroupEl.hidden = groupEl.value !== NEW_GROUP;
    if (!newGroupEl.hidden) newGroupEl.focus();
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'due' || e.target.name === 'repeat' || e.target.name === 'weekday') refreshRepeat();
  });

  dateInput.addEventListener('click', () => { try { dateInput.showPicker?.(); } catch { /* the tap opens it natively */ } });
  dateInput.addEventListener('change', () => {
    setDate(dateInput.value || null);
    if (dateInput.value) setRadio('due', 'date');
    refreshRepeat();
  });

  // iOS overlays the keyboard instead of resizing the layout, and pans the visible area to the
  // focused field. So the sheet follows the visible area (--vv-top, --vvh) rather than the layout.
  // Only while a field has focus: iOS 26 can leave offsetTop and height stuck after the keyboard closes.
  const FORM_BAR = 56; // the floating prev/next/done strip above the keyboard isn't in the viewport
  const vv = window.visualViewport;
  if (vv) {
    const typing = () => Boolean(document.activeElement?.matches('input, select, textarea, [contenteditable]'));
    const fit = () => {
      const root = document.documentElement.style;
      const on = typing();
      const top = on ? Math.max(0, vv.offsetTop) : 0;
      const height = on ? vv.height : window.innerHeight;
      const kb = on ? Math.max(0, window.innerHeight - (top + vv.height)) : 0;
      const open = kb > 100;
      root.setProperty('--kb', `${kb}px`);
      root.setProperty('--vvh', `${height}px`);
      root.setProperty('--vv-top', `${top}px`);
      root.setProperty('--kb-open', open ? '1' : '0');
      root.setProperty('--kb-pad', open ? `${FORM_BAR}px` : '0px');
      document.documentElement.classList.toggle('kb-open', open);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    document.addEventListener('focusin', fit);
    document.addEventListener('focusout', () => setTimeout(fit, 150));
    fit();
  }
}
