# Roadmap

## Next (2026-11-21, after the app badge)

**Waiting on Sam:** nothing. The notification title fix and the bigger headings are released (c40bdb8517).

**Claude next, one batch** (all touch `today-view.js` and `tests/browser/checkoff.html`; follow the `build-loop` skill):
1. Focus after a put-away (end of To do).
2. Browser test gaps (end of To do).
3. "All done for today" line (end of To do).

**Limits hit:**
- Headless Chrome browser tests can't start in the sandbox. Workaround this session: serve the repo root with a static server (a temp `launch.json` entry in the orchestrator, port 8775) and open `tests/browser/*.html` in the Claude browser pane. migrate, checkoff, and new-group pass there; new-todo times out at "the sheet after leaving the field", on `main` too (probably no blur while the pane is hidden; unchecked).
- The tracker isn't readable from a worktree session. `.claude/launch.json` is gitignored; its `planner-built` entry points at an old scratchpad.

## Done earlier

- [x] Remove the horizontal line and increase the space between sections (7151b49, 1347804; released b854644c82).
- [x] Blurred line at the top of the app. Same fix as the notebook site: a solid, fixed, 12px strip at the top (`body::after`).
- [x] Monthly repeat check. Saving the edit sheet on a todo pushed with Tomorrow moved its whole monthly or yearly rule to the pushed day; it now keeps the rule (8f8edae). The rest of the report matched the spec: Tomorrow twice leaves it due today, not overdue.
- [x] Content below the top blur. The solid strip now covers the status-bar inset plus 12px (`--strip`), and the app starts 12px below it; measured in the dev browser with a simulated 59px inset (strip ends 71px, more button 83px, day numeral ink 91px).
- [x] Horizontal rule between sections: a full-bleed hairline on `#list > section + section`, centred in the gap.
- [x] Weekdays and Weekends repeat options: shortcuts in the edit sheet stored as an ordinary weekly rule (Mon–Fri, Sat–Sun), shown as chosen when a weekly rule matches exactly; the row reads "Weekdays" or "Weekends". The repeat picker is now two rows of four.
- [x] Morning, Afternoon, and Night sections: always shown, every todo in exactly one (a required `part` field, backup format 2, IndexedDB version 2). Priority todos sort first in their section; groups are smaller subheadings inside it, ungrouped todos last. New todos go to the part of the day it is now (Morning before noon, Afternoon until 5 pm, Night after); the edit sheet changes it. Existing todos go to Morning, except that groups named Morning, Afternoon, or Night (made by the old-app import) fold into those sections.
- [x] Upcoming list: a collapsed `<details>` below Night listing todos due after today by day (Tomorrow, then short dates), Morning to Night within a day. A repeating todo shows only its next instance, its stored due date. Tapping one opens the edit sheet; open or closed is remembered per device. This replaces the old "future todos aren't viewable until due" decision.
- [x] Check-off undo after an Upcoming edit: a finished row's snapshot is brought up to date with the live todo before it is drawn or undone (`core/finished.js`), so undo reverts only the check-off (due, rule, last done) and keeps a later rename, part, group, or priority change; if the todo was deleted or rescheduled since, the row goes and nothing is put back. Migration 2 also upgrades snapshots saved before it, so a check-off from the old Night group undoes into Night.

## To do

- [x] Flat list (tracker `planner-flat-list`, 2026-11-21): the Morning, Afternoon, and Night sections are gone, so todos due today are one list (priority, groups, ungrouped); the edit sheet's part picker is gone; Upcoming and Completed headings went from 2rem to 1.25rem. Each todo still stores its part (no migration), so the sections could come back. Part names are allowed as group names again; old Morning, Afternoon, and Night groups stay groups on upgrade. Released a05d627451 (fa8d07a).
- [x] Weekday and weekend repeat labels: the row under the title says "Weekdays" and "Weekends" instead of "Every weekday" and "Every weekend".
- [x] Keyboard covers the new group name field: on the phone, editing a todo, choosing a new group, and adding one opens the keyboard with the name field under it, so you can't see where you're typing. Keep the field in view above the keyboard.
- [x] Save ignores a typed new group name: in the edit sheet, typing a new group name and tapping Save doesn't create the group; only the keyboard's return key (the check mark) does. Picking an existing group and tapping Save works. Save should create the group and put the todo in it.
- [x] More space above group headings: about double the current space above a group heading inside a section.
- [x] New todo opens the edit sheet: typing a new todo and tapping Done or Enter should open the edit sheet for it instead of putting it straight into Morning.
- [x] Plus button opens the edit sheet: the plus button focuses the add-todo field now. It should open a sheet for a new todo where you name it and set all its options at once, with the name field focused.
- [x] Hide completed todos after leaving the app: whenever the app loses focus (switching apps, locking or turning off the screen, or quitting it), todos checked off so far are hidden when you come back to it. They move to a Completed list at the bottom, just above Upcoming, formatted the same way as Upcoming: a collapsed `<details>`, closed by default, with no separate toggle (Sam, 2026-11-13). Put away on `visibilitychange` (hidden), `pagehide`, and every launch; closed again each time the app is left; tapping a row undoes it; cleared with the day (0aebbdf).
- [ ] Focus after a put-away (low impact, from review): if focus is on a checked-off row when the app is left, or the last Completed row is undone, keyboard and VoiceOver focus falls to the page.
- [ ] Browser test gaps (from review): cover the `visibilitychange` path and the launch put-away, not only `pagehide`.
- [ ] "All done for today" line (Sam, 2026-11-21): when every todo due today is checked off and put away, the list shows nothing above Completed; show the line "All done for today" there.
- [x] App badge (Sam, 2026-11-21): the Home Screen icon shows how many todos are due today, refreshed by a 7 a.m. push from the `planner-push` Worker (https://planner-push.samfeldstein.workers.dev, deployed 2026-11-21), plus a morning notification; turned on and off under More, Badge. Design and limits: `plans/app-badge.md`; deploy notes: `push/README.md`. Built on `claude/app-badge` (3 plan reviews, 5 cold reviews, tests and browser tests pass). Merged and released 8a44585362; phone test passed (badge and notification both showed, 2026-11-21). Follow-ups: the notification line is now the title (iOS already names the app); More headings and Completed and Upcoming are 1.5rem, with a hairline above each More section.
