# Focus after a put-away, browser test gaps, "All done for today" (plan, 2026-11-21, revised after plan review 1)

Three roadmap items, one batch: all touch `src/js/features/today-view.js` and `tests/browser/checkoff.html`.

## 1. Focus after a put-away

Today `render()` remembers focus as `{ id, act }` and, after redrawing, focuses `[data-id=id] [data-act=act]`. Cases that lose it (focus falls to `<body>`, so VoiceOver and the keyboard restart at the top):

- **(a) Leaving the app with focus on a checked-off row.** `leave()` puts the row away; it's redrawn inside the closed Completed `<details>`, where its button can't take focus.
- **(a2) Coming back.** iOS often fires `pagehide` and `visibilitychange` (hidden, then visible); each calls `render()`. Once focus is on the Completed `<summary>` (no `data-id`), the next render throws the summary away and focus lands on `<body>`.
- **(b) Undoing a row from Completed.** The row comes back in the list with `act` "complete", not "uncomplete", so the exact match fails; if it was the last Completed row, the whole section is gone.
- **(c) A failed undo** (todo deleted or rescheduled since): the `uncomplete` branch in `act()` returns before `refocus(index)`.

**The focus key.** Captured at the top of `render()`:
- `{ summary: 'completed' | 'upcoming' }` when focus is on one of those summaries.
- `{ id, act, section: 'today' | 'completed' | 'upcoming' }` when focus is on a row button.
- **iOS tap fallback:** Safari doesn't focus buttons on tap, and VoiceOver's cursor may not set `document.activeElement` (unchecked). So the list's `click` handler also records the last tapped `{ id, act, section }` with a timestamp; `render()` uses it when `activeElement` is `<body>` and the tap was within the last 2 s (the tap triggers the render). Leaving the app doesn't use it.

**Restore,** after redrawing, trying each candidate with `tryFocus(el)`: call `el.focus()` and accept only if `document.activeElement === el` (rejects buttons in a closed `<details>`, in `[hidden]` `.actions`, or detached). Order:
1. Summary key → the same summary.
2. Row key → the exact `[data-id] [data-act]` match in the same section.
3. The todo's `.task` in the Today section (covers (b): the undone row back in the list).
4. If the todo is now in Completed → the Completed `<summary>` (covers (a)).
5. Otherwise leave focus alone; `act()` handles removals with `refocus(index)`.

Never search Upcoming for a Today or Completed key: a checked-off repeating todo's next instance is there under the same `data-id`.

Only restore when focus (or the tap fallback) was in the list before the render, so the edit sheet and More keep their own focus.

**(c):** in `act()`'s `uncomplete` branch, after `render()`, call `refocus(index)` if focus isn't in the list.

## 2. Browser test gaps (`tests/browser/checkoff.html`)

The test covers the put-away only via `pagehide`. Add:
- **visibilitychange:** `Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'hidden' })`, dispatch `new frame.contentWindow.Event('visibilitychange')`, check the row went to Completed; then `delete doc.visibilityState` and dispatch again.
- **Launch put-away:** navigate the iframe to `about:blank` first (so the old page's `pagehide` can't overwrite the record), then write a finished record `{ date: todayLocal(), todos: [pre-check-off snapshot], away: [] }` while IndexedDB holds the checked-off todo (due moved on), then load `index.html`, re-read `doc`, re-attach the error hooks, and check the row is in Completed.
- **Focus (a):** focus a checked-off row's button, fire the put-away, check `doc.activeElement` is the Completed summary; then fire `pagehide` and `visibilitychange` (hidden, visible) in a row and check it's still there.
- **Focus with Upcoming open:** same as (a) with Upcoming open and the todo's next instance in it; focus must not land in Upcoming.
- **Focus (b):** open Completed, focus a row's button, click it (undo), check focus is on that todo's `.task` in Today, including when it was the last Completed row.
- **Tap fallback:** click a row's button without focusing it first (activeElement is body), and check focus ends on the expected element after the render.
- **"All done for today":** check off the only todo, put it away, check the line; undo, check it's gone.

Make sure all of `npm run test:browser`'s pages still pass (checkoff, new-todo, new-group, badge).

## 3. "All done for today" (Sam, 2026-11-21; wording approved)

When todos were due today (`total > 0`) but nothing is drawn in the list (every one checked off and put away, or the rest moved to Tomorrow), the list's section shows `All done for today.` in the same `p.empty` style as `Nothing due today.` Struck-through rows still in place block it. Implementation: always draw `section.today`; its empty line is `Nothing due today.` when `total === 0`, `All done for today.` when `total > 0` and nothing is drawn. (Plan review 1 confirmed the condition against how `total`, `shown`, and `split` are computed.)

## Tests and checks

- Node: no pure logic changes; `npm test` must still pass.
- Browser: run in the Claude browser pane (headless Chrome can't start in the sandbox): serve the repo root on a fresh port and open the test pages.
- VoiceOver on the phone is the only proof of the iOS focus behavior; noted as unchecked.

## Additions from plan review 2

1. **Pending key across a hide.** `leave()` saves the focus key it restored to as `pendingKey`. The next visible `visibilitychange` or `pageshow` render uses it when `activeElement` is `<body>`, then clears it (focus may be cleared while backgrounded on iOS; unchecked).
2. **`refocus(index)` through `tryFocus`:** skip candidates it rejects (e.g. Completed rows in a closed list), then fall back to `quickAdd`. Used by (c) too.
3. **Order:** the list's click handler records the tap key before calling `act()` (`act('complete')` renders synchronously).
4. **No scroll jump for touch users:** keys from the tap fallback focus with `{ preventScroll: true }`.
5. **Test steps:** dispatch `visibilitychange` on `doc`; blur before the tap-fallback step; the "not the last Completed row" case needs a second todo, so add it after the existing single-todo checks (or on a new page); clear `planner:upcomingOpen` at the start and end; for the launch put-away, read the `planner:finished` record just before the reload and reuse it with `away: []`.
