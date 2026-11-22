// The Today list: todos due today plus overdue, as one list with groups inside. Tap a task to complete it; it stays
// struck through until the day ends, and tapping it again undoes it. Tap its arrow (or right-click) to open Tomorrow, Skip (recurring only), and Edit.
// Leaving the app (hidden or pagehide) puts the todos checked off so far away: on return they're in a
// collapsed Completed list below the list, struck through, and tapping one there undoes it the same way.
// Below that, a collapsed Upcoming list shows later todos by day; tapping one opens the edit sheet.

import { effectiveDue, isOverdue } from '../core/recur.js';
import { addDays } from '../core/date.js';
import { FINISHED_KEY, dropFinished, parseFinished, putAway, reconcile, reconcileAll, serializeFinished, splitFinished } from '../core/finished.js';
import { buildToday, listTodos } from '../core/today.js';
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
  // here as pre-completion snapshots until the day rolls over: struck through in place, or, once
  // put away (see core/finished.js), in the Completed list.
  let finished = new Map();
  let away = new Set();
  let finishedDay = null;
  function loadFinished(today) {
    if (finishedDay === today) return;
    const boot = finishedDay === null;
    finishedDay = today;
    let saved = null;
    try { saved = localStorage.getItem(FINISHED_KEY); } catch { /* storage unavailable: finished rows restart */ }
    ({ todos: finished, away } = parseFinished(saved, today));
    // On launch everything saved is put away: iOS may have killed the app without a hide event.
    if (boot && putAway(finished, away)) saveFinished();
  }
  function saveFinished() {
    try {
      localStorage.setItem(FINISHED_KEY, serializeFinished(finishedDay, finished, away));
    } catch { /* storage unavailable */ }
  }
  // Bring each snapshot up to date with the live todo; drop the ones that can no longer be undone.
  function reconcileFinished() {
    if (reconcileAll(finished, away, (id) => store.todo(id), finishedDay)) saveFinished();
  }

  // Whether Completed is open. Closed at launch and again each time the app is left; kept across
  // re-renders in between.
  let completedOpen = false;
  function leave() {
    if (finishedDay !== null && putAway(finished, away)) saveFinished(); // now: the page may not get another chance
    completedOpen = false;
    render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave();
    else render();
  });
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
  const quickAdd = document.getElementById('quickAdd');

  // Whether Upcoming is open, remembered on this device only. Starts collapsed.
  const OPEN_KEY = 'planner:upcomingOpen';
  let upcomingOpen = false;
  try { upcomingOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* storage unavailable */ }
  list.addEventListener('toggle', (e) => {
    if (e.target.matches('.completed details')) { completedOpen = e.target.open; return; }
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
    if (todo.recur) task.append(el('span', 'meta', recurSummary(todo.recur)));
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
      const h = el('h2', '', day.date === tomorrow ? 'Tomorrow' : shortDate(day.date));
      h.id = `upcoming-d${i}`;
      sub.setAttribute('role', 'group');
      sub.setAttribute('aria-labelledby', h.id);
      const ul = el('ul');
      for (const todo of day.todos) ul.append(upcomingRow(todo));
      sub.append(h, ul);
      details.append(sub);
    });
    details.open = upcomingOpen;
    section.append(details);
    return section;
  }

  // Completed: the put-away todos, in check-off order, drawn like finished rows. Only shown when
  // there's at least one.
  function completed(todos, today) {
    const section = el('section', 'completed');
    const details = el('details');
    const summary = el('summary', '', 'Completed');
    const n = todos.length;
    summary.append(el('span', 'count', String(n)));
    summary.setAttribute('aria-label', `Completed, ${n} ${n === 1 ? 'todo' : 'todos'}`);
    const ul = el('ul');
    for (const todo of todos) ul.append(row(todo, today));
    details.append(summary, ul);
    details.open = completedOpen;
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
    const split = splitFinished(finished, away);
    // Counted with every finished todo (put away ones are still done today), drawn without the
    // put away ones, which go in Completed.
    const all = listTodos(buildToday([...live, ...finished.values()], store.groups(), today));
    const shown = buildToday([...live, ...split.inPlace], store.groups(), today);
    const total = all.length;
    const done = all.filter((t) => finished.has(t.id)).length;
    const count = total - done;
    countEl.textContent = total ? `${done} of ${total}` : '';
    progressEl.hidden = !total;
    progressEl.firstElementChild.style.width = total ? `${(done / total) * 100}%` : '0';
    progressEl.setAttribute('aria-valuenow', done);
    progressEl.setAttribute('aria-valuemax', total);

    list.replaceChildren();

    // One list: priority todos, then each group under its heading, then ungrouped todos.
    const rows = (todos) => {
      const ul = el('ul');
      for (const todo of todos) ul.append(row(todo, today));
      return ul;
    };
    // The section is always drawn, so the ruled line above Completed and Upcoming stays. With nothing
    // in it: no todos due today, or all of them checked off and put away (or moved to Tomorrow).
    {
      const section = el('section', 'today');
      if (!listTodos(shown).length) section.append(el('p', 'empty', total ? 'All done for today.' : 'Nothing due today.'));
      if (shown.priority.length) section.append(rows(shown.priority));
      shown.groups.forEach((g, i) => {
        const sub = el('div', 'group');
        const h = el('h2', '', g.group.name);
        h.id = `group-${i}`;
        sub.setAttribute('role', 'group');
        sub.setAttribute('aria-labelledby', h.id);
        sub.append(h, rows(g.todos));
        section.append(sub);
      });
      if (shown.ungrouped.length) section.append(rows(shown.ungrouped));
      list.append(section);
    }
    if (split.away.length) list.append(completed(split.away, today));
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
        dropFinished(finished, away, id);
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
          dropFinished(finished, away, id);
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
