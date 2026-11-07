# Roadmap

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
- [ ] Keyboard covers the new group name field: on the phone, adding a group puts the name field under the keyboard, so you can't see where you're typing. Keep the field in view above the keyboard.
