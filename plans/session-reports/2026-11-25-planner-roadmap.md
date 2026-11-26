# Planner roadmap side session, 2026-11-25

Wrap-up ran. Commits 2fc4634 to a18e232 on `main`, not pushed or released. (This report is in `plans/`, not `docs/`: in this repo `docs/` is the built site that GitHub Pages serves, and every build rewrites it.)

## Done

- **Completed section removed.** Checked-off todos stay struck in the list (tap again to undo) until the app is left or relaunched; then they leave the list. The header's done of total still counts every todo checked off today (Sam's pick, option A). Leaving with focus on a struck row moves focus to the nearest unstruck row, else Upcoming, else +. Plan: `plans/completed-removal.md`.
- **Leftovers fixed:** the strip's actions get a pressed colour (12% ink over the strip); right-click toggles a row (a second one closes it; the menu key on a focused action closes it too); the Options screen keeps a focused field above the keyboard's form bar; the dev server names non-private addresses (`tools/lan.mjs`) and still points to Wi-Fi.
- Roadmap, design.md, and comments updated.

## Checks

- `npm test`: 195/195 in five timezones (at a18e232).
- `npm run test:browser`: 5/5 at 3458709 (headless, run by the orchestrator). `swipe.html` changed after that (546430b, 866ab6b); rerun at 866ab6b by the orchestrator: swipe.html and checkoff.html PASS. In the Claude browser pane, swipe.html fails 3 edit-sheet focus checks, but it fails the same 3 at 196c1ba, and they pass in headless Chrome.

## Build-loop rounds

- Plan review (Opus, high, 5 min): 3 Important (the neighbor index pointed at the wrong row, checkoff.html needed a rewrite, the dev-server test would start a server) plus nits; all taken.
- Build (Opus, this session).
- Cold review 1 (Opus, high, 6 min): 1 Important (checkoff.html didn't parse, a duplicate `const`; fixed in 3458709); 6 of 9 nits fixed; left: the row tap flash (a phone check), the Wi-Fi wording (a plan choice), and untested Options/pressed state (phone).
- Cold review 2 (Opus, high, delta, 2 min): 1 Important (clearing the right-click record on pointerup reopened a row after a long-press where contextmenu follows the lift); fixed in 866ab6b, nits fixed.
- Cold review 3 (Opus, high, delta, 2 min): clean (nits only, desktop browsers; left as follow-ups in the roadmap).
- Backstop code review (medium, full diff): 5 nits; 2 fixed (unchecked claims labelled), 3 left in the roadmap's follow-ups.

## Ready to release

All of it: `npm run release`. After release, Sam's phone checks are in the roadmap's Next section.

## Tracker

Tracker: not read; `/Users/Samfeld/claude/tracker` isn't readable from this session's sandbox ("Operation not permitted"), so `list` and `check` didn't run. No tracker task was named for this work; commands for the orchestrator:

```bash
node /Users/Samfeld/claude/tracker/tasks.mjs next planner "Release the Completed removal and leftover fixes, then Sam's phone checks (plans/roadmap.md, Next)" --done "Released, and Sam's phone checks in the roadmap pass"
```
