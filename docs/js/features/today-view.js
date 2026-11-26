// The Today list: todos due today plus overdue, as one list with groups inside. Tap a task to complete it; it stays
// struck through until the app is left, and tapping it again undoes it. Swipe it right (or right-click, or tab to
// them) to show Tomorrow, Skip (recurring only), and Edit in the row; the swipe lives in ui/row-swipe.js.
// Leaving the app (hidden or pagehide), or launching it, puts the todos checked off so far away: they leave the
// list for good, though the header still counts them as done today.
// Below the list, a collapsed Upcoming list shows later todos by day; tapping one opens the edit sheet.

import { effectiveDue, isOverdue } from '../core/recur.js';
import { addDays } from '../core/date.js';
import { FINISHED_KEY, dropFinished, parseFinished, putAway, reconcile, reconcileAll, serializeFinished, splitFinished } from '../core/finished.js';
import { buildToday, listTodos } from '../core/today.js';
import { buildUpcoming } from '../core/upcoming.js';
import { dateParts, longDate, recurSummary, shortDate } from '../ui/format.js';
import * as rowSwipe from '../ui/row-swipe.js';


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

  // Checked-off todos leave the store's due list (or move on), so today's finished ones are kept
  // here as pre-completion snapshots until the day rolls over: struck through in place, or, once
  // put away (see core/finished.js), hidden but still counted.
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

  // Where focus was when the app was left; iOS may clear focus while it's in the background.
  let pendingKey = null;
  let mode = null; // 'leave' or 'resume' for the next render
  function leave() {
    if (finishedDay !== null && putAway(finished, away)) saveFinished(); // now: the page may not get another chance
    leaveStruckRow();
    mode = 'leave';
    render();
    pendingKey = captureKey() ?? pendingKey;
  }
  function resume() {
    mode = 'resume';
    render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave();
    else resume();
  });
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  const addBtn = document.getElementById('addBtn');

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
      const repeat = todo.recur ? ` · ${recurSummary(todo.recur)}` : '';
      task.append(el('span', 'meta overdue', `Due ${shortDate(effectiveDue(todo, today))}${repeat}`));
    } else if (todo.recur) {
      task.append(el('span', 'meta', recurSummary(todo.recur)));
    }

    if (isDone) {
      li.append(task);
      return li;
    }

    // The row's actions wait off the left edge, shown by a swipe right (or keyboard focus); see ui/row-swipe.js.
    const actions = el('div', 'actions');
    let n = 0;
    for (const [act, label] of [['tomorrow', 'Tomorrow'], ['skip', 'Skip'], ['edit', 'Edit']]) {
      if (act === 'skip' && !todo.recur) continue;
      const b = el('button', 'action', label);
      b.type = 'button';
      b.dataset.act = act;
      b.setAttribute('aria-label', `${label}: ${todo.title}`);
      actions.append(b);
      n += 1;
    }
    li.style.setProperty('--n', String(n)); // sizes the strip and how far the task slides

    li.append(task, actions);
    return li;
  }

  function render() {
    const today = clock.today();
    const renderMode = mode;
    mode = null;
    const { key: focusKey, quiet } = focusKeyForRender(renderMode);

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
    // put away ones.
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
    // The section is always drawn, so the ruled line above Upcoming stays. With nothing
    // in it: no todos due today, or all of them checked off and put away. (A todo moved to Tomorrow isn't counted.)
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
    list.append(upcoming(today));

    if (focusKey) restoreFocus(focusKey, quiet);
  }

  // Focus survives a redraw. A key says what had focus: the Upcoming summary, or a row
  // button (its todo, action, and section).
  const sectionOf = (node) => node.closest('section')?.className;
  const rowKey = (btn) => ({ id: btn.closest('[data-id]').dataset.id, act: btn.dataset.act, section: sectionOf(btn) });
  function captureKey() {
    const node = document.activeElement;
    if (!node || !list.contains(node)) return null;
    if (node.tagName === 'SUMMARY') return { summary: sectionOf(node) };
    return node.dataset.act && node.closest('[data-id]') ? rowKey(node) : null;
  }

  // The last tapped check-off button: Safari doesn't focus buttons on tap, and VoiceOver's cursor may
  // not move activeElement. Recorded before act() runs, since a check-off renders synchronously.
  let lastTap = null;
  const TAP_MS = 2000;

  // The key to restore after this render. A tap's key (focused without scrolling) stands in when
  // nothing has focus; coming back to the app prefers the key saved on leaving. Leaving ignores taps.
  function focusKeyForRender(renderMode) {
    const key = captureKey();
    const resuming = renderMode === 'resume';
    const saved = pendingKey;
    if (resuming) pendingKey = null;
    const quietly = renderMode !== null; // a hidden page or a return must not scroll the list
    const active = document.activeElement;
    const free = active === document.body || list.contains(active);
    // (Only a plain render: leaving ignores taps, and a return uses the key saved on leaving.)
    // A tap on a row other than the focused one wins: a click (or VoiceOver) may not move focus.
    const tap = renderMode === null && free && lastTap && performance.now() - lastTap.at < TAP_MS ? lastTap.key : null;
    if (!key && active === document.body && resuming && saved) return { key: saved, quiet: true };
    if (tap && key?.id !== tap.id) return { key: tap, quiet: true };
    return { key, quiet: quietly };
  }

  // Focus the node and say whether it took: a button in a closed details or a detached node refuses.
  // (A row's action buttons take focus off-screen, and focus slides the row open.)
  function tryFocus(node, opts) {
    if (!node) return false;
    node.focus(opts);
    return document.activeElement === node;
  }

  function restoreFocus(key, quiet) {
    const opts = quiet ? { preventScroll: true } : undefined;
    const q = (sel) => list.querySelector(sel);
    if (key.summary) {
      // The list is gone (a day change, a failed save): the first check button, else Upcoming, else +.
      if (!tryFocus(q(`.${key.summary} summary`), opts)) refocus(0, opts);
      return;
    }
    const row = `[data-id="${CSS.escape(key.id)}"]`;
    if (tryFocus(q(`.${key.section} ${row} [data-act="${key.act}"]`), opts)) return;
    if (key.section === 'upcoming') return; // never chase an Upcoming row into the other sections
    // The todo's row in the list (an undone row is back there; a just checked-off one is struck). Not
    // Upcoming: a repeating todo's next instance shares the id.
    tryFocus(q(`.today ${row} .task`), opts);
  }

  // Leaving puts every struck row away, so focus on one moves first, without scrolling, to the nearest unstruck
  // row after it in the list, else before it, else the Upcoming summary, else +. Then the usual key capture keeps it.
  function leaveStruckRow() {
    const from = document.activeElement?.closest?.('.today .row.done');
    if (!from || !list.contains(from)) return;
    const opts = { preventScroll: true };
    const rows = [...list.querySelectorAll('.today .row')];
    const at = rows.indexOf(from);
    const open = (r) => !r.classList.contains('done');
    const order = [...rows.slice(at + 1).filter(open), ...rows.slice(0, at).filter(open).reverse()];
    if (order.some((r) => tryFocus(r.querySelector('.task'), opts))) return;
    if (!tryFocus(list.querySelector('.upcoming summary'), opts)) addBtn.focus(opts);
  }

  const checks = () => [...list.querySelectorAll('[data-act="complete"], [data-act="uncomplete"]')];

  // After an action removes a row, keep the keyboard and VoiceOver position useful.
  function refocus(index, opts) {
    const all = checks();
    const at = Math.min(index, all.length - 1);
    // Nearest first; rows that refuse focus are skipped.
    const order = [...all.slice(at), ...all.slice(0, Math.max(at, 0)).reverse()];
    // None left: the Upcoming summary (always drawn, and in the list, so the next render keeps it), else +.
    if (!order.some((node) => tryFocus(node, opts)) && !tryFocus(list.querySelector('.upcoming summary'), opts)) addBtn.focus(opts);
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
        if (snap) {
          try {
            await store.restoreTodo(snap);
          } catch (err) {
            render(); // the row stays struck; keep focus in the list
            if (!list.contains(document.activeElement)) refocus(index);
            throw err;
          }
        }
        dropFinished(finished, away, id);
        saveFinished();
        render();
        if (!list.contains(document.activeElement)) refocus(index);
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

  // Where keyboard focus goes after the edit sheet closes, if a save or delete redrew the list under it. Only one
  // unstruck row has a given id (a struck row is a finished snapshot; Upcoming rows are never struck), so that row
  // is the todo wherever a save moved it. Gone (deleted) or hidden (in a collapsed Upcoming): the Upcoming summary
  // if the Edit came from there, else the nearest check-off, as after Tomorrow or Skip. Only an Edit from a focused
  // row is recorded: on touch nothing had focus, and focus left on a far row would scroll the page on the next render.
  let edited = null; // { id, index }: the index among check-off buttons, -1 from Upcoming
  const sheetEl = document.getElementById('sheet');
  sheetEl?.addEventListener('close', () => {
    // The close event comes a moment after close(): one from a sheet already reopened is stale.
    if (sheetEl.open) return;
    const was = edited;
    edited = null;
    // Focus is lost (body) or left on a button inside the closed sheet.
    const lost = document.activeElement === document.body || sheetEl.contains(document.activeElement);
    if (!was || !lost) return;
    const opts = { preventScroll: true };
    if (tryFocus(list.querySelector(`.row:not(.done)[data-id="${CSS.escape(was.id)}"] .task`), opts)) return;
    if (was.index < 0 && tryFocus(list.querySelector('.upcoming summary'), opts)) return;
    refocus(Math.max(was.index, 0), opts);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('.row');
    const kind = btn.dataset.act;
    if (kind === 'complete' || kind === 'uncomplete') lastTap = { key: rowKey(btn), at: performance.now() };
    // Focus on an action button moves to the todo itself before the row closes, so it has somewhere to be.
    const own = li.querySelector('.task');
    const focused = li.contains(document.activeElement);
    if (own && btn !== own && focused) own.focus({ preventScroll: true });
    li.classList.remove('swiped'); // any row action closes the row (Edit's sheet must not see an open row)
    if (kind === 'edit') {
      edited = focused ? { id: li.dataset.id, index: own ? checks().indexOf(own) : -1 } : null;
      document.dispatchEvent(new CustomEvent('planner:edit', { detail: { id: li.dataset.id } }));
    } else act(kind, li);
  });

  rowSwipe.init({ list });
  store.on((e) => { if (e.type !== 'backup') render(); });
  clock.on(render);
  render();
}
