// The add / edit bottom sheet. Return adds and keeps the sheet open for the next todo.
// showModal() and title.focus() run synchronously in the tap handler so iOS opens the keyboard.

import { addDays, weekday } from '../core/date.js';
import { anchorRule } from '../core/recur.js';
import { WEEK_ORDER, recurSummary, shortDate, weekdayName } from '../ui/format.js';

const NEW_GROUP = '__new__';
const toast = (message, undo) => document.dispatchEvent(new CustomEvent('planner:toast', { detail: { message, undo } }));
const $ = (id) => document.getElementById(id);

export function init({ store, clock }) {
  const sheet = $('sheet');
  const form = $('sheetForm');
  const titleEl = $('title');
  const dateInput = $('dateInput');
  const dateLabel = $('dateLabel');
  const groupEl = $('group');
  const newGroupEl = $('newGroup');
  const priorityEl = $('priority');
  const weekdaysEl = $('weekdays');
  const summaryEl = $('repeatSummary');
  const noteEl = $('formNote');
  const errorEl = $('formError');
  const submitBtn = $('submitBtn');
  const deleteBtn = $('deleteBtn');

  let editing = null; // the todo being edited, or null when adding

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
    if (freq === 'weekly') {
      const days = weekdayBoxes().filter((b) => b.checked).map((b) => Number(b.value));
      return { freq, weekdays: days.length ? days : [weekday(dueValue())] };
    }
    return { freq };
  }

  function refreshRepeat() {
    const freq = radio('repeat');
    weekdaysEl.hidden = freq !== 'weekly';
    if (freq === 'weekly' && !weekdayBoxes().some((b) => b.checked)) {
      const box = weekdayBoxes().find((b) => Number(b.value) === weekday(dueValue()));
      if (box) box.checked = true;
    }
    const rule = chosenRecur();
    summaryEl.hidden = !rule;
    summaryEl.textContent = rule ? recurSummary(anchorRule(rule, dueValue())) : '';
  }

  function fillGroups(selected) {
    groupEl.replaceChildren(new Option('No group', ''));
    for (const g of [...store.groups()].sort((a, b) => a.name.localeCompare(b.name))) groupEl.append(new Option(g.name, g.id));
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

  function open(todo) {
    editing = todo ?? null;
    const today = clock.today();
    form.reset();
    showError('');
    noteEl.textContent = '';
    newGroupEl.value = '';
    $('sheetTitle').textContent = todo ? 'Edit todo' : 'New todo';
    submitBtn.textContent = todo ? 'Save' : 'Add';
    deleteBtn.hidden = !todo;

    setDate(null);
    for (const b of weekdayBoxes()) b.checked = false;
    if (todo) {
      titleEl.value = todo.title;
      priorityEl.checked = todo.priority === 1;
      if (todo.due === today) setRadio('due', 'today');
      else if (todo.due === addDays(today, 1)) setRadio('due', 'tomorrow');
      else { setRadio('due', 'date'); setDate(todo.due); }
      setRadio('repeat', todo.recur?.freq ?? 'never');
      for (const b of weekdayBoxes()) b.checked = todo.recur?.weekdays?.includes(Number(b.value)) ?? false;
    }
    fillGroups(todo?.groupId);
    refreshRepeat();

    sheet.showModal();
    titleEl.focus();
  }

  function close() {
    if (sheet.open) sheet.close();
  }

  async function submit(e) {
    e.preventDefault();
    const title = titleEl.value.trim();
    if (!title) { showError('Add a title.'); titleEl.focus(); return; }
    showError('');
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

      if (!editing) {
        await store.addTodo({ title, due, groupId, priority, recur });
        // Keep the sheet open for the next one; keep due and group, reset the rest.
        if (titleEl.value.trim() === title) titleEl.value = ''; // keep anything typed during the save
        priorityEl.checked = false;
        setRadio('repeat', 'never');
        for (const b of weekdayBoxes()) b.checked = false;
        newGroupEl.value = '';
        fillGroups(groupId);
        refreshRepeat();
        noteEl.textContent = `Added: ${title}`;
        titleEl.focus();
        return;
      }

      // Send only what changed, so editing a title never re-snaps a pushed-off due date.
      const patch = {};
      if (title !== editing.title) patch.title = title;
      if (groupId !== editing.groupId) patch.groupId = groupId;
      if (priority !== editing.priority) patch.priority = priority;
      const anchored = recur ? anchorRule(recur, due) : null;
      if (due !== editing.due || JSON.stringify(anchored) !== JSON.stringify(editing.recur)) {
        patch.due = due;
        patch.recur = recur;
      }
      if (!Object.keys(patch).length) { close(); return; }
      const { undo } = await store.updateTodo(editing.id, patch);
      close();
      toast('Saved', undo);
    } catch (err) {
      showError(err.message || "Couldn't save. Try again.");
    } finally {
      submitBtn.disabled = false;
    }
  }

  $('addBtn').addEventListener('click', () => open(null));
  document.addEventListener('planner:edit', (e) => {
    const todo = store.todo(e.detail.id);
    if (todo) open(todo);
  });

  form.addEventListener('submit', submit);
  $('sheetDone').addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  sheet.addEventListener('close', () => { editing = null; });

  deleteBtn.addEventListener('click', async () => {
    if (!editing) return;
    try {
      const { undo } = await store.deleteTodo(editing.id);
      close();
      toast('Deleted', undo);
    } catch {
      showError("Couldn't delete. Try again.");
    }
  });

  titleEl.addEventListener('input', () => { noteEl.textContent = ''; showError(''); });

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

  // iOS overlays the keyboard instead of resizing the layout, so lift the sheet by hand.
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      const root = document.documentElement.style;
      root.setProperty('--kb', `${Math.max(0, window.innerHeight - (vv.offsetTop + vv.height))}px`);
      root.setProperty('--vvh', `${vv.height}px`);
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }
}
