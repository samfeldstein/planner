// The Today list: todos due today plus overdue, grouped. Tap a task to complete it;
// tap its arrow (or right-click) to open Tomorrow, Skip (recurring only), and Edit.

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
  const progressEl = document.getElementById('progress');

  // Completed todos leave the list (or move on), so today's finished count is kept here.
  const DONE_KEY = 'planner:done';
  function doneToday(today, delta = 0) {
    let n = 0;
    try {
      const saved = JSON.parse(localStorage.getItem(DONE_KEY));
      if (saved?.date === today) n = saved.n;
      if (delta) localStorage.setItem(DONE_KEY, JSON.stringify({ date: today, n: Math.max(0, n + delta) }));
    } catch { /* storage unavailable: count restarts */ }
    return Math.max(0, n + delta);
  }
  const quickAdd = document.getElementById('quickAdd');

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

    const more = el('button', 'row-more');
    more.type = 'button';
    more.dataset.act = 'more';
    more.setAttribute('aria-label', `Options: ${todo.title}`);
    more.setAttribute('aria-expanded', 'false');

    li.append(task, more, actions);
    return li;
  }

  function render() {
    const today = clock.today();
    const active = document.activeElement;
    const openId = list.querySelector('.actions:not([hidden])')?.closest('[data-id]')?.dataset.id;
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
    const done = doneToday(today);
    const total = done + count;
    countEl.textContent = total ? `${done} of ${total}` : '';
    progressEl.hidden = !total;
    progressEl.firstElementChild.style.width = total ? `${(done / total) * 100}%` : '0';
    progressEl.setAttribute('aria-valuenow', done);
    progressEl.setAttribute('aria-valuemax', total);

    list.replaceChildren();
    if (!count) list.append(el('p', 'empty', 'Nothing due today.'));

    sections.forEach((s, i) => {
      const section = el('section');
      const h = el('h2', '', s.priority ? 'Priority' : s.group ? s.group.name : 'Other');
      h.id = `grp${i}`;
      section.setAttribute('aria-labelledby', h.id);
      const ul = el('ul');
      for (const todo of s.todos) ul.append(row(todo, today));
      section.append(h, ul);
      list.append(section);
    });

    if (openId) {
      const open = list.querySelector(`[data-id="${CSS.escape(openId)}"]`);
      if (open) setOpen(open, true);
    }

    if (focusKey?.id) {
      list.querySelector(`[data-id="${CSS.escape(focusKey.id)}"] [data-act="${focusKey.act}"]`)?.focus();
    }
  }

  const checks = () => [...list.querySelectorAll('[data-act="complete"]')];

  // After an action removes a row, keep the keyboard and VoiceOver position useful.
  function refocus(index) {
    const all = checks();
    (all[Math.min(index, all.length - 1)] ?? quickAdd).focus();
  }

  function setOpen(li, open) {
    li.querySelector('.actions').hidden = !open;
    li.querySelector('.row-more').setAttribute('aria-expanded', String(open));
  }

  function toggle(li) {
    const actions = li.querySelector('.actions');
    const wasOpen = !actions.hidden;
    for (const other of list.querySelectorAll('.actions:not([hidden])')) setOpen(other.closest('.row'), false);
    setOpen(li, !wasOpen);
  }

  // Rows with an action in flight ignore further taps, so a double-tap can't complete twice.
  const busy = new Set();

  async function act(kind, li) {
    const id = li.dataset.id;
    if (busy.has(id)) return;
    busy.add(id);
    const title = store.todo(id)?.title ?? '';
    const index = checks().indexOf(li.querySelector('[data-act="complete"]'));
    try {
      if (kind === 'complete') {
        li.classList.add('done');
        if (!reduceMotion()) await sleep(80);
      }
      // Count first: the store's change event re-renders before this call returns.
      const day = clock.today();
      if (kind === 'complete') doneToday(day, 1);
      let storeUndo;
      try {
        ({ undo: storeUndo } = await store[kind](id));
      } catch (err) {
        if (kind === 'complete') doneToday(day, -1);
        throw err;
      }
      const undo = kind === 'complete' && storeUndo
        ? () => { doneToday(day, -1); return storeUndo(); }
        : storeUndo;
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
    } finally {
      busy.delete(id);
    }
  }

  // Right-click also opens the actions on desktop; it blocks the iOS callout too.
  list.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.task')?.closest('.row');
    if (!li) return;
    e.preventDefault();
    toggle(li);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('.row');
    const kind = btn.dataset.act;
    if (kind === 'more') toggle(li);
    else if (kind === 'edit') document.dispatchEvent(new CustomEvent('planner:edit', { detail: { id: li.dataset.id } }));
    else act(kind, li);
  });

  store.on((e) => { if (e.type !== 'backup') render(); });
  clock.on(render);
  render();
}
