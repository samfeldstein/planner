# Roadmap

## Next (2026-11-15; branch `claude/elated-snyder-fa1df8` merged, released as c4bde4b, and pushed, checked 2026-11-16)

- Waiting on Sam: the phone check below.
- Claude next, one batch (both touch `today-view.js` and `tests/browser/checkoff.html`): the two review follow-ups at the end of To do.
- Limits hit: Chrome browser tests can't start in the sandbox (run `npm run test:browser` outside it); the tracker isn't readable from a worktree session. `.claude/launch.json` is gitignored and its paths still point at the old `~/projects` folder in the main checkout (fixed only in this worktree).

## Phone check (after the next release)

Tick each on the phone; when one fails, add it under To do.

- [ ] Top of the app: a solid strip, no blurred line, and nothing tucked under it.
- [ ] A hairline sits between Morning, Afternoon, and Night.
- [ ] Morning, Afternoon, and Night always show; a new todo lands in the part of the day it is now.
- [ ] Repeat picker: Weekdays and Weekends work, and the row under the title says "Weekdays" or "Weekends".
- [ ] A monthly todo pushed with Tomorrow, then saved in the edit sheet, keeps its monthly rule.
- [ ] Upcoming: closed at first, lists later todos by day, a tap opens the edit sheet, and it stays open or closed as you left it.
- [ ] Edit a repeating todo in Upcoming after checking it off, then undo the check-off: the edit stays.
- [ ] Group headings have about twice the space above them.
- [ ] Edit sheet, new group: the name field stays above the keyboard, and Save creates the group.
- [ ] Typing a new todo and tapping Done opens the edit sheet.
- [ ] The + button opens the new-todo sheet with the name field focused.
- [ ] Check off a todo, switch apps (and separately lock the screen), and come back: it's in a closed Completed list above Upcoming; tapping it there undoes it.

- [x] Remove the horizontal line and increase the space between sections (7151b49, 1347804; released b854644c82).
- [x] Blurred line at the top of the app. Same fix as the notebook site: a solid, fixed, 12px strip at the top (`body::after`). Built in src; phone check pending.
- [x] Monthly repeat check. Saving the edit sheet on a todo pushed with Tomorrow moved its whole monthly or yearly rule to the pushed day; it now keeps the rule (8f8edae). The rest of the report matched the spec: Tomorrow twice leaves it due today, not overdue. Built in src; phone check pending.
- [x] Content below the top blur. The solid strip now covers the status-bar inset plus 12px (`--strip`), and the app starts 12px below it; measured in the dev browser with a simulated 59px inset (strip ends 71px, more button 83px, day numeral ink 91px). Built in src; phone check pending.
- [x] Horizontal rule between sections: a full-bleed hairline on `#list > section + section`, centred in the gap. Built in src; phone check pending.
- [x] Weekdays and Weekends repeat options: shortcuts in the edit sheet stored as an ordinary weekly rule (Mon–Fri, Sat–Sun), shown as chosen when a weekly rule matches exactly; the row reads "Weekdays" or "Weekends". The repeat picker is now two rows of four. Built in src; phone check pending.
- [x] Morning, Afternoon, and Night sections: always shown, every todo in exactly one (a required `part` field, backup format 2, IndexedDB version 2). Priority todos sort first in their section; groups are smaller subheadings inside it, ungrouped todos last. New todos go to the part of the day it is now (Morning before noon, Afternoon until 5 pm, Night after); the edit sheet changes it. Existing todos go to Morning, except that groups named Morning, Afternoon, or Night (made by the old-app import) fold into those sections. Built in src; phone check pending.
- [x] Upcoming list: a collapsed `<details>` below Night listing todos due after today by day (Tomorrow, then short dates), Morning to Night within a day. A repeating todo shows only its next instance, its stored due date. Tapping one opens the edit sheet; open or closed is remembered per device. This replaces the old "future todos aren't viewable until due" decision. Built in src; phone check pending.
- [x] Check-off undo after an Upcoming edit: a finished row's snapshot is brought up to date with the live todo before it is drawn or undone (`core/finished.js`), so undo reverts only the check-off (due, rule, last done) and keeps a later rename, part, group, or priority change; if the todo was deleted or rescheduled since, the row goes and nothing is put back. Migration 2 also upgrades snapshots saved before it, so a check-off from the old Night group undoes into Night. Built in src; phone check pending.

## To do

- [x] Weekday and weekend repeat labels: the row under the title says "Weekdays" and "Weekends" instead of "Every weekday" and "Every weekend".
- [x] Keyboard covers the new group name field: on the phone, editing a todo, choosing a new group, and adding one opens the keyboard with the name field under it, so you can't see where you're typing. Keep the field in view above the keyboard. Built in src; phone check pending.
- [x] Save ignores a typed new group name: in the edit sheet, typing a new group name and tapping Save doesn't create the group; only the keyboard's return key (the check mark) does. Picking an existing group and tapping Save works. Save should create the group and put the todo in it. Built in src; phone check pending.
- [x] More space above group headings: about double the current space above a group heading inside a section. Built in src; phone check pending.
- [x] New todo opens the edit sheet: typing a new todo and tapping Done or Enter should open the edit sheet for it instead of putting it straight into Morning. Built in src; phone check pending.
- [x] Plus button opens the edit sheet: the plus button focuses the add-todo field now. It should open a sheet for a new todo where you name it and set all its options at once, with the name field focused. Built in src; phone check pending.
- [x] Hide completed todos after leaving the app: whenever the app loses focus (switching apps, locking or turning off the screen, or quitting it), todos checked off so far are hidden when you come back to it. They move to a Completed list at the bottom, just above Upcoming, formatted the same way as Upcoming: a collapsed `<details>`, closed by default, with no separate toggle (Sam, 2026-11-13). Put away on `visibilitychange` (hidden), `pagehide`, and every launch; closed again each time the app is left; tapping a row undoes it; cleared with the day (0aebbdf). Built in src; phone check pending.
- [ ] Focus after a put-away (low impact, from review): if focus is on a checked-off row when the app is left, or the last Completed row is undone, keyboard and VoiceOver focus falls to the page.
- [ ] Browser test gaps (from review): cover the `visibilitychange` path and the launch put-away, not only `pagehide`.
