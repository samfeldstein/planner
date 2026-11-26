# Remove Completed, plus four review leftovers (2026-11-25)

Start: 196c1ba.

## 1. Remove the Completed section

Sam decided 2026-11-25 (roadmap, To do): struck-off todos stay in the list until the app is left, which is time
enough to undo an accidental check-off. On leaving (visibilitychange hidden, pagehide) and at launch, they're put
away as now, but put-away todos just leave the screen; there's no list to undo them from.

Changes:
- `features/today-view.js`: drop `completed()`, `completedOpen`, the `.completed details` toggle branch, and every
  focus path that targets the Completed summary or a Completed row.
- Focus when a focused row is put away (leaving the app with focus on a struck row): the row is gone, so focus goes
  to the nearest check-off button by its old position, else the Upcoming summary, else + (the same `refocus()` used
  after Tomorrow or Skip), without scrolling. To do that a row key also records its index among check-off buttons.
  On return, the saved key (now the neighbor's) is restored as today.
- Header count: kept as today (every todo checked off today counts as done, put away or not); Sam picked this
  (option A of three) on 2026-11-25. "All done for today." still shows when every todo due
  today is checked off and put away.
- `core/finished.js`: keeps `away` (it now means "hidden"), snapshots, and the saved format, so nothing migrates and
  the count can still include put-away todos. Comments updated; nothing reads put-away snapshots except the count
  and reconcile (a deleted or rescheduled todo's entry drops out of the count, as now).
- `css/app.css`: drop the `.completed` selectors.
- `design.md`: drop the Completed component; Upcoming sits right below the list.
- Tests: `tests/browser/checkoff.html` loses the Completed cases and gains: leaving puts the row out of the DOM;
  focus on a struck row moves to its neighbor quietly on leave and stays on return; launch hides saved entries;
  the header count after leaving. Unit tests in `finished.test.js` stay (the format is unchanged).

Edge cases: a struck row focused when it's the only row (focus to Upcoming summary); leaving twice; a day change
while away (loadFinished resets as now); an old saved record (loads in place, put away at launch, as now).

## 2. Leftovers

a. **Strip pressed state.** `.actions .action:active` (and `:hover` on hover devices) gets a colour distinct from
   the strip's `--hairline`: `color-mix(in srgb, var(--ink) 12%, var(--hairline))`, both themes.
b. **Second right-click on an open row leaves it open.** The pointerdown in `row-swipe.js` closes open rows, then
   the contextmenu handler reopens it. Move the contextmenu handler into `row-swipe.js`, and have it toggle: a row
   that was open when the press began (closed by that pointerdown) stays closed; otherwise it opens and closes the
   others. Keyboard context-menu key (no pointerdown): toggle by its current state.
c. **Options group name under the form bar.** The keyboard fit in `sheet.js` only reveals fields in `#sheet`, and
   `dialog.screen .sheet-body` has no form-bar padding. Generalise `reveal()` to whichever of `#sheet` / `#more` is
   open and holds focus, and give `dialog.screen .sheet-body` the same bottom padding as `#sheet .sheet-body`.
d. **Dev server blames Wi-Fi.** When the Mac has IPv4 addresses but none private, say that its address isn't a
   private one (so the phone would get the install gate) instead of telling it to join Wi-Fi; keep the Wi-Fi line
   for no address at all. Pull the message choice into a small pure function with a unit test.

## Tests

`npm test` (unit, five timezones). Browser tests (`npm run test:browser`) can't run in the sandbox: the orchestrator
runs them. swipe.html gains a right-click toggle case.

## Revisions after the plan review (2026-11-25)

- **Focus on leave, simpler:** in `leave()`, before `render()`, if focus is in a struck row, move it (preventScroll)
  to the next unstruck row's task in DOM order, else the previous one, else the Upcoming summary, else +. The
  existing key capture and restore then work unchanged; no index in the key. (An index among all check-offs pointed
  at the wrong row when several struck rows leave together.) Test: leave with two struck rows above the focused one.
- **checkoff.html is a rewrite, not a trim:** the tap-stands-in, tap-wins, and no-scroll cases still test live paths;
  they reset with fresh todos per case instead of an undo from Completed.
- **Dev-server message** goes in `tools/lan.mjs` (dev-server.mjs listens at import). With non-private addresses
  only, it prints them and still says to join the phone's Wi-Fi (a VPN or self-assigned address is the usual cause).
- **Right-click toggle:** the record of rows a press closed is set at pointerdown, consumed by contextmenu, and
  cleared at the next pointerdown and keydown. Ctrl+click (button 0 with ctrlKey) counts as a right press. The
  handler still blocks the menu on struck and Upcoming rows. The test sends a real pointerdown(button 2).
- **Pressed state on iOS:** a passive no-op `touchstart` listener on the list, so Safari applies `:active`.
- Stale "Completed" comments in `app.css`, `design.md`, `finished.test.js`, and `today-view.js:2` go too.
- Not in scope (pre-existing): renaming a group in Options re-renders every field, so tabbing to the next name field
  loses focus; focus is lost if the day changes while a struck row has it.
