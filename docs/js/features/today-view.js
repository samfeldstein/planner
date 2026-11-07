// The Today list: todos due today plus overdue, in Morning, Afternoon, and Night, grouped inside. Tap a task to complete it; it stays
// struck through until the day ends, and tapping it again undoes it. Tap its arrow (or right-click) to open Tomorrow, Skip (recurring only), and Edit.
// Below Night, a collapsed Upcoming list shows later todos by day; tapping one opens the edit sheet.

import { effectiveDue, isOverdue } from '../core/recur.js';
import { PART_NAMES } from '../core/model.js';
import { addDays } from '../core/date.js';
import { FINISHED_KEY, reconcile } from '../core/finished.js';
import { buildToday, sectionTodos } from '../core/today.js';
import { buildUpcoming } from '../core/upcoming.js';
import { dateParts, longDate, recurSummary, shortDate } from '../ui/format.js';


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

  // Completed todos leave the store's due list (or move on), so today's finished ones are kept
  // here as pre-completion snapshots and drawn struck through, in place, until the day rolls over.
  const finished = new Map();
  let finishedDay = null;
  function loadFinished(today) {
    if (finishedDay === today) return;
    finishedDay = today;
    finished.clear();
    try {
      const saved = JSON.parse(localStorage.getItem(FINISHED_KEY));
      if (saved?.date === today) for (const t of saved.todos) finished.set(t.id, t);
    } catch { /* storage unavailable: finished rows restart */ }
  }
  function saveFinished() {
    try {
      localStorage.setItem(FINISHED_KEY, JSON.stringify({ date: finishedDay, todos: [...finished.values()] }));
    } catch { /* storage unavailable */ }
  }
  // Bring each snapshot up to date with the live todo (see core/finished.js); drop the ones that
  // can no longer be undone.
  function reconcileFinished() {
    let changed = false;
    for (const [id, snap] of finished) {
      const next = reconcile(snap, store.todo(id), finishedDay);
      if (next && JSON.stringify(next) === JSON.stringify(snap)) continue;
      if (next) finished.set(id, next);
      else finished.delete(id);
      changed = true;
    }
    if (changed) saveFinished();
  }
  const quickAdd = document.getElementById('quickAdd');

  // Whether Upcoming is open, remembered on this device only. Starts collapsed.
  const OPEN_KEY = 'planner:upcomingOpen';
  let upcomingOpen = false;
  try { upcomingOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* storage unavailable */ }
  list.addEventListener('toggle', (e) => {
    if (!e.target.matches('.upcoming details')) return;
    upcomingOpen = e.target.open;
    try { localStorage.setItem(OPEN_KEY, upcomingOpen ? '1' : '0'); } catch { /* storage unavailable */ }
  }, true); // toggle doesn't bubble

  // An upcoming row: tapping it opens the edit sheet.
  function upcomingRow(todo) {
    const li = el('li', `row${todo.priority ? ' top' : ''}`);
    li.dataset.id = todo.id;
    const task = el('button', 'task');
    task.type = 'button';
    task.dataset.act = 'edit';
    task.setAttribute('aria-label', `Edit: ${todo.title}`);
    task.append(el('span', 'title', todo.title));
    if (todo.priority) task.append(el('span', 'vh', ', top priority'));
    const meta = [PART_NAMES[todo.part], todo.recur && recurSummary(todo.recur)].filter(Boolean).join(', ');
    if (meta) task.append(el('span', 'meta', meta));
    li.append(task);
    return li;
  }

  function upcoming(today) {
    const section = el('section', 'upcoming');
    const details = el('details');
    const days = buildUpcoming(store.todos(), today);
    const summary = el('summary', '', 'Upcoming');
    const n = days.reduce((sum, d) => sum + d.todos.length, 0);
    if (n) {
      summary.append(el('span', 'count', String(n)));
      summary.setAttribute('aria-label', `Upcoming, ${n} ${n === 1 ? 'todo' : 'todos'}`);
    }
    details.append(summary);
    if (!days.length) details.append(el('p', 'empty', 'Nothing coming up.'));
    const tomorrow = addDays(today, 1);
    days.forEach((day, i) => {
      const sub = el('div', 'group');
      const h3 = el('h3', '', day.date === tomorrow ? 'Tomorrow' : shortDate(day.date));
      h3.id = `upcoming-d${i}`;
      sub.setAttribute('role', 'group');
      sub.setAttribute('aria-labelledby', h3.id);
      const ul = el('ul');
      for (const todo of day.todos) ul.append(upcomingRow(todo));
      sub.append(h3, ul);
      details.append(sub);
    });
    details.open = upcomingOpen;
    section.append(details);
    return section;
  }

  function row(todo, today) {
    const isDone = finished.has(todo.id);
    const overdue = !isDone && isOverdue(todo, today);
    const li = el('li', `row${todo.priority ? ' top' : ''}${isDone ? ' done' : ''}`);
    li.dataset.id = todo.id;

    const task = el('button', 'task');
    task.type = 'button';
    task.dataset.act = isDone ? 'uncomplete' : 'complete';
    task.setAttribute('aria-label', `${isDone ? 'Undo complete' : 'Complete'}: ${todo.title}`);

    task.append(el('span', 'title', todo.title));
    if (todo.priority) task.append(el('span', 'vh', ', top priority'));
    if (overdue) {
      task.append(el('span', 'meta overdue', `Due ${shortDate(effectiveDue(todo, today))}`));
    } else if (todo.recur) {
      task.append(el('span', 'meta', recurSummary(todo.recur)));
    }

    if (isDone) {
      li.append(task);
      return li;
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
    loadFinished(today);
    reconcileFinished();
    const live = store.todos().filter((t) => !finished.has(t.id));
    const sections = buildToday([...live, ...finished.values()], store.groups(), today);
    const all = sections.flatMap(sectionTodos);
    const total = all.length;
    const done = all.filter((t) => finished.has(t.id)).length;
    const count = total - done;
    countEl.textContent = total ? `${done} of ${total}` : '';
    progressEl.hidden = !total;
    progressEl.firstElementChild.style.width = total ? `${(done / total) * 100}%` : '0';
    progressEl.setAttribute('aria-valuenow', done);
    progressEl.setAttribute('aria-valuemax', total);

    list.replaceChildren();
    if (!total) list.append(el('p', 'empty', 'Nothing due today.'));

    // Each part always shows its heading. Groups are smaller subheadings inside it.
    const rows = (todos) => {
      const ul = el('ul');
      for (const todo of todos) ul.append(row(todo, today));
      return ul;
    };
    for (const s of sections) {
      const section = el('section', 'part');
      const h = el('h2', '', PART_NAMES[s.part]);
      h.id = `part-${s.part}`;
      section.setAttribute('aria-labelledby', h.id);
      section.append(h);
      if (s.priority.length) section.append(rows(s.priority));
      s.groups.forEach((g, i) => {
        const sub = el('div', 'group');
        const h3 = el('h3', '', g.group.name);
        h3.id = `${h.id}-g${i}`;
        sub.setAttribute('role', 'group');
        sub.setAttribute('aria-labelledby', h3.id);
        sub.append(h3, rows(g.todos));
        section.append(sub);
      });
      if (s.ungrouped.length) section.append(rows(s.ungrouped));
      list.append(section);
    }
    list.append(upcoming(today));

    if (openId) {
      const open = list.querySelector(`[data-id="${CSS.escape(openId)}"]`);
      if (open) setOpen(open, true);
    }

    if (focusKey?.id) {
      list.querySelector(`[data-id="${CSS.escape(focusKey.id)}"] [data-act="${focusKey.act}"]`)?.focus();
    }
  }

  const checks = () => [...list.querySelectorAll('[data-act="complete"], [data-act="uncomplete"]')];

  // After an action removes a row, keep the keyboard and VoiceOver position useful.
  function refocus(index) {
    const all = checks();
    (all[Math.min(index, all.length - 1)] ?? quickAdd).focus();
  }

  function setOpen(li, open) {
    const actions = li.querySelector('.actions');
    if (!actions) return; // a finished row has no actions to open
    actions.hidden = !open;
    li.querySelector('.row-more').setAttribute('aria-expanded', String(open));
  }

  function toggle(li) {
    const actions = li.querySelector('.actions');
    if (!actions) return; // finished rows have none
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
    const index = checks().indexOf(li.querySelector('[data-act]'));
    try {
      if (kind === 'uncomplete') {
        // Put the todo back as it was before it was completed, keeping any edit made since,
        // then draw it unstruck. If it was deleted or rescheduled since, only the mark goes.
        const snap = finished.get(id) && reconcile(finished.get(id), store.todo(id), finishedDay);
        if (snap) await store.restoreTodo(snap);
        finished.delete(id);
        saveFinished();
        render();
        return;
      }
      const before = kind === 'complete' ? store.todo(id) : null;
      if (before) {
        // Strike the row first: the store's change event re-renders before this call returns.
        finished.set(id, before);
        saveFinished();
        try { render(); } catch (err) { console.error(err); } // never skip the save below
      }
      try {
        await store[kind](id);
      } catch (err) {
        if (before) {
          finished.delete(id);
          saveFinished();
          render();
        }
        throw err;
      }
      if (!before) refocus(index);
    } catch (err) {
      console.error(err);
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
