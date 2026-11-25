# Roadmap

## Next (2026-11-25, swipe redesign session; committed, not released or pushed)

**Done this session (not released):** swipe right on a todo in today's list now shows Tomorrow, Skip (repeating todos only), and Edit inside the row, sliding in from the left as the todo slides right; the Options button and the menu below the row are gone, and nothing above or below moves. Picking an action closes the row, including Edit then Save or close (the original bug). After a keyboard Edit, focus goes back to the todo wherever a save moved it, or to the nearest row after a delete. Options (the header's three dots) is full screen, in the order Groups, Badge, Backup, App. `npm run dev` prints an "On your phone" address, and the README says what that preview can't do. Also fixed: a sheet reopened just after closing could lose its todo, so Done did nothing. Commits 0eede93 to b523a97; cold reviews 6 (Important bugs fixed in rounds 1, 3, 4, and 5; round 6 clean); npm test 190/190 in five timezones; `npm run test:browser` 5/5 pass with no skips (run through the Terminal panel).

**Earlier today (released 9bc79e5044):** the first swipe design, with one Options button that opened the Tomorrow, Skip, and Edit menu. `plans/swipe-options.md` is its plan and is now out of date.

**Waiting on Sam:**
- Checked by Sam on 2026-11-25 in the phone preview (a Safari tab from `npm run dev`), not yet in the installed app: swipe open and closed, tapping each action, and the Options screen ("looks good").
- Released 2026-11-25 (version 5bad1fb718). Sam checked the installed app the same day: swipe, each action, and Options good; landscape on the notch side works. A long-press does not open the row (so iOS fires no right-click for it).
- Also good on 2026-11-25: a diagonal swipe, starting a scroll on a row, a slow tap that closes an open row, a pinch on a row, and the Upcoming position.
- Sam checks the morning notification on 2026-11-26: "Planner" on top and "x items due today" below, or still "Planner, from Planner"?
- VoiceOver checks can't come from Sam (he doesn't use VoiceOver): the actions off-screen until swiped, focus sliding the row open, where focus lands after Edit and Save, and whether the header's "Options" is mixed up with the row actions.
- Swipe distance (Sam's call): a row stays open only when it's dragged past half its strip, so about 120px with three actions and 80px with two. The Options button needed 40px. Lower it if it feels stiff.
- Known trade-off, kept on purpose: on an open row, a tap on its action strip (about two thirds of the row) runs that action.

**Claude next:** the phone checks found nothing to fix. Small leftovers from review, none urgent:
- The strip's buttons show no change when pressed, because their pressed color is the strip's own color.
- A second right-click on an open row leaves it open.
- On Options, a group name field low on the screen can sit under the keyboard's form bar.
- The dev server blames Wi-Fi when the Mac has no private address.
## Running sessions

None.

**Dev server:** the `planner-dev` entry in the orchestrator's `.claude/launch.json` (port 8766, live reload).

**Running the push Worker:** logs in the Cloudflare dashboard (Workers Logs, 3 days). The test token is in the gitignored `push/.test-token`; a test push is the curl in `push/README.md`. If Options shows "No morning notification came today", read the logs first.

**Limits hit:**
- Headless Chrome browser tests can't start in the sandbox. Sam runs `npm run test:browser` in his terminal (all four pass there, 2026-11-21). The Claude browser pane works as a fallback: all five passed there on 2026-11-25 (click into the page so the keyboard blocks run), served by a temporary `planner-tests-temp` entry (python `http.server` on 8767 from the repo root) in the orchestrator `launch.json`.
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

- [ ] Remove the Completed section (Sam, Apple Note, 2026-11-23; decided 2026-11-25). Why: struck-off todos stay in the list until the app is left, which gives enough time to undo one checked off by accident. No recorded reason for adding it was found (roadmap and commits of 2026-11-13 say what it does, not why). Put-away todos then just leave the list; decide what the header's done-of-total counts.
- [x] Remove the add-a-task field (Sam, Apple Note, 2026-11-23); the + button is enough. Done 2026-11-24 (6572649): the + handler lives in `sheet.js`; with no rows left, focus goes to the Upcoming summary, then +.
- [x] Upcoming at the bottom of the screen by default (Sam, Apple Note, 2026-11-23), with its drop-down arrow clear of the + button. Done 2026-11-24 (6572649): a short list leaves Completed and Upcoming at the bottom, the summary 16px above +; a long list keeps the 16px gap. Opening Upcoming moves it up as its days fill the space.
- [x] Rename the More heading to Options (Sam, Apple Note, 2026-11-23), and make it bigger; it looks small next to the rest of its container. Done 2026-11-24 (6572649): title 2rem (its sections are 1.5rem); the three-dot button's label is Options.
- [x] Swipe right on a todo to show an options button, instead of the drop-down arrow (Sam, Apple Note, 2026-11-23). Design B picked 2026-11-24: one Options button that opens the existing menu; plan `plans/swipe-options.md`. Replaced 2026-11-25: the swipe shows the actions in the row, no Options button.
- [x] Morning notification layout (Sam, Apple Note, 2026-11-22): "Planner" on top as the title, and "x items due today" below it as the body. Done 2026-11-24 (6572649): "1 item due today" for one. Shows on the phone after the next release. The 2026-11-21 note said a "Planner" title read as "Planner, from Planner" on iOS (unchecked now).
- [x] Flat list (tracker `planner-flat-list`, 2026-11-21): the Morning, Afternoon, and Night sections are gone, so todos due today are one list (priority, groups, ungrouped); the edit sheet's part picker is gone; Upcoming and Completed headings went from 2rem to 1.25rem. Each todo still stores its part (no migration), so the sections could come back. Part names are allowed as group names again; old Morning, Afternoon, and Night groups stay groups on upgrade. Released a05d627451 (fa8d07a).
- [x] Weekday and weekend repeat labels: the row under the title says "Weekdays" and "Weekends" instead of "Every weekday" and "Every weekend".
- [x] Keyboard covers the new group name field: on the phone, editing a todo, choosing a new group, and adding one opens the keyboard with the name field under it, so you can't see where you're typing. Keep the field in view above the keyboard.
- [x] Save ignores a typed new group name: in the edit sheet, typing a new group name and tapping Save doesn't create the group; only the keyboard's return key (the check mark) does. Picking an existing group and tapping Save works. Save should create the group and put the todo in it.
- [x] More space above group headings: about double the current space above a group heading inside a section.
- [x] New todo opens the edit sheet: typing a new todo and tapping Done or Enter should open the edit sheet for it instead of putting it straight into Morning.
- [x] Plus button opens the edit sheet: the plus button focuses the add-todo field now. It should open a sheet for a new todo where you name it and set all its options at once, with the name field focused.
- [x] Hide completed todos after leaving the app: whenever the app loses focus (switching apps, locking or turning off the screen, or quitting it), todos checked off so far are hidden when you come back to it. They move to a Completed list at the bottom, just above Upcoming, formatted the same way as Upcoming: a collapsed `<details>`, closed by default, with no separate toggle (Sam, 2026-11-13). Put away on `visibilitychange` (hidden), `pagehide`, and every launch; closed again each time the app is left; tapping a row undoes it; cleared with the day (0aebbdf).
- [x] Focus after a put-away: focus now goes to the Completed summary when a focused row is put away (and stays there on return), to the row back in the list after an undo from Completed, and to a nearby row after a failed undo; leave and return never scroll; on iOS a tap within 2 s stands in for focus (Safari doesn't focus on tap). Plan: `plans/focus-and-done.md`. VoiceOver behavior unchecked on the phone.
- [x] Browser test gaps: `checkoff.html` now covers the put-away on `visibilitychange` and at launch, plus every focus case above.
- [x] "All done for today." (Sam, 2026-11-21): shown when todos were due today and every one is checked off and put away; "Nothing due today." when none were due.
- [x] App badge (Sam, 2026-11-21): the Home Screen icon shows how many todos are due today, refreshed by a 7 a.m. push from the `planner-push` Worker (https://planner-push.samfeldstein.workers.dev, deployed 2026-11-21), plus a morning notification; turned on and off under More, Badge. Design and limits: `plans/app-badge.md`; deploy notes: `push/README.md`. Built on `claude/app-badge` (3 plan reviews, 5 cold reviews, tests and browser tests pass). Merged and released 8a44585362; phone test passed (badge and notification both showed, 2026-11-21). Follow-ups: the notification line is now the title (iOS already names the app); More headings and Completed and Upcoming are 1.5rem, with a hairline above each More section.
