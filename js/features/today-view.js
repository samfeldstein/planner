// The Today list: todos due today plus overdue, grouped. Tap a task to complete it;
// long-press it (or right-click) to open Tomorrow, Skip (recurring only), and Edit.

import { effectiveDue, isOverdue } from '../core/recur.js';
import { buildToday } from '../core/today.js';
import { dateParts, longDate, recurSummary, shortDate } from '../ui/format.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toast = (message, undo) => document.dispatchEvent(new CustomEvent('planner:toast', { detail: { message, undo } }));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function init({ store, clock }) {
  const list = document.getElementById('list');
  const dateEl = document.getElementById('date');
  const countEl = document.getElementById('count');
  const addBtn = document.getElementById('addBtn');

  function row(todo, today) {
    const overdue = isOverdue(todo, today);
    const li = el('li', `row${todo.priority ? ' top' : ''}`);
    li.dataset.id = todo.id;

    const task = el('button', 'task');
    task.type = 'button';
    task.dataset.act = 'complete';
    task.setAttribute('aria-label', `Complete: ${todo.title}`);

    task.append(el('span', 'title', todo.title));
    if (todo.priority) task.append(el('span', 'vh', ', top priority'));
    if (overdue) {
      task.append(el('span', 'meta overdue', `Due ${shortDate(effectiveDue(todo, today))}`));
    } else if (todo.recur) {
      task.append(el('span', 'meta', recurSummary(todo.recur)));
    }

    const actions = el('div', 'actions');
    actions.hidden = true;
    if (overdue && todo.recur) actions.append(el('p', 'detail', recurSummary(todo.recur)));
    for (const [act, label] of [['tomorrow', 'Tomorrow'], ['skip', 'Skip'], ['edit', 'Edit']]) {
      if (act === 'skip' && !todo.recur) continue;
      const b = el('button', 'action', label);
      b.type = 'button';
      b.dataset.act = act;
      actions.append(b);
    }

    li.append(task, actions);
    return li;
  }

  function render() {
    const today = clock.today();
    const active = document.activeElement;
    const focusKey = list.contains(active)
      ? { id: active.closest('[data-id]')?.dataset.id, act: active.dataset.act }
      : null;

    const parts = dateParts(today);
    dateEl.setAttribute('aria-label', longDate(today));
    document.getElementById('dayNum').textContent = parts.day;
    document.getElementById('weekday').textContent = parts.weekday;
    document.getElementById('monthYear').textContent = parts.monthYear;
    const sections = buildToday(store.todos(), store.groups(), today);
    const count = sections.reduce((n, s) => n + s.todos.length, 0);
    countEl.textContent = count ? `${count} to do` : '';

    list.replaceChildren();
    if (!count) list.append(el('p', 'empty', 'Nothing due today.'));

    sections.forEach((s, i) => {
      const section = el('section');
      const h = el('h2', '', s.group ? s.group.name : 'Other');
      h.id = `grp${i}`;
      section.setAttribute('aria-labelledby', h.id);
      const ul = el('ul');
      for (const todo of s.todos) ul.append(row(todo, today));
      section.append(h, ul);
      list.append(section);
    });

    if (focusKey?.id) {
      list.querySelector(`[data-id="${CSS.escape(focusKey.id)}"] [data-act="${focusKey.act}"]`)?.focus();
    }
  }

  const checks = () => [...list.querySelectorAll('[data-act="complete"]')];

  // After an action removes a row, keep the keyboard and VoiceOver position useful.
  function refocus(index) {
    const all = checks();
    (all[Math.min(index, all.length - 1)] ?? addBtn).focus();
  }

  function toggle(li) {
    const actions = li.querySelector('.actions');
    const wasOpen = !actions.hidden;
    for (const other of list.querySelectorAll('.actions:not([hidden])')) other.hidden = true;
    actions.hidden = wasOpen;
  }

  async function act(kind, li) {
    const id = li.dataset.id;
    const title = store.todo(id)?.title ?? '';
    const index = checks().indexOf(li.querySelector('[data-act="complete"]'));
    try {
      if (kind === 'complete') {
        li.classList.add('done');
        if (!reduceMotion()) await sleep(160);
      }
      const { undo } = await store[kind](id);
      const message = {
        complete: () => `Completed: ${title}`,
        tomorrow: () => 'Moved to tomorrow',
        skip: () => `Skipped to ${shortDate(store.todo(id).due)}`,
      }[kind]();
      toast(message, undo);
      refocus(index);
    } catch (err) {
      console.error(err);
      li.classList.remove('done');
      toast("Couldn't save. Try again.");
    }
  }

  // A long press opens the actions and swallows the click that follows the release.
  const HOLD_MS = 500;
  let hold = null;
  let held = false;
  let origin = null;
  const cancelHold = () => { clearTimeout(hold); hold = null; };

  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.task')?.closest('.row');
    if (!li || e.button) return;
    held = false;
    cancelHold();
    hold = setTimeout(() => { held = true; toggle(li); }, HOLD_MS);
    origin = { clientX: e.clientX, clientY: e.clientY };
  });
  list.addEventListener('pointermove', (e) => {
    if (hold && origin && Math.hypot(e.clientX - origin.clientX, e.clientY - origin.clientY) > 8) cancelHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) list.addEventListener(type, cancelHold);

  list.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.task')?.closest('.row');
    if (!li) return;
    e.preventDefault();
    if (!held) toggle(li);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (held) { held = false; return; }
    const li = btn.closest('.row');
    const kind = btn.dataset.act;
    if (kind === 'edit') document.dispatchEvent(new CustomEvent('planner:edit', { detail: { id: li.dataset.id } }));
    else act(kind, li);
  });

  store.on(render);
  clock.on(render);
  render();
}
