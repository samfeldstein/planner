# Design: "Planner"

A printed day-planner page. Ink on ruled paper, handwritten type, flat and square.

## Style words

Ruled, flat, square corners, no shadows (except the round + button), airy, restrained motion.

## Type

- **Kalam** (self-hosted, `src/fonts/`): date numeral, weekday, group labels, task titles, buttons.
- **Kalam everywhere**: no system sans.
- Fallback for Kalam: Bradley Hand, cursive.

## Color

| Token | Light | Dark |
|---|---|---|
| `--bg` | #fbfcfe (cool white) | #14171d |
| `--ink` | #1b2433 | #e6e9ef |
| `--ink-2` | #667085 | #98a1b2 |
| `--hairline` (ruled line) | #dce5f1 | #252c38 |
| `--margin` (margin rule) | #efc2c2 | #5a3436 |
| `--accent` (priority square, links) | #2a4f9e | #8fb0f0 |
| `--overdue` (red pen) | #b4382f | #ef8a80 |

## Components

- **Page:** a fixed 1px margin rule at 28px; text starts at 36px.
- **Rows:** full-bleed, separated by a ruled line, no card borders.
- **Row options:** swipe a todo right and an Options button (Kalam on `--hairline`, 80px plus the left safe area) slides in from the left edge; tapping it opens Tomorrow, Skip, and Edit below the row. One row open at a time; any other tap only closes it. Right-click, or keyboard focus on the button, works too. No visible arrow on rows (removed 2026-11-24).
- **List:** todos due today (and overdue) are one list, with no time-of-day sections (dropped 2026-11-21). A ruled line separates the list, Completed, and Upcoming. Each todo still stores a part of the day, set when it's added, but it isn't shown or used.
- **Priority:** top-priority todos come first in the list; each keeps a filled accent square on the margin rule.
- **Completed:** todos checked off before the app last lost focus (or was relaunched) leave the list for a collapsed disclosure below it, above Upcoming, set exactly like Upcoming's summary. Struck-through rows in check-off order; tapping one undoes it. Shown only when it has an entry; closed after each time the app is left, not remembered. Still counted in the header's done of total.
- **Upcoming:** a collapsed disclosure below Completed (or the list), its summary a 1.5rem heading with the count and a small arrow (Completed matches). Later todos by day, each day labelled like a group (Tomorrow, then short dates); a repeating todo shows only its next due date. Tapping one opens the edit sheet. Open or closed is remembered on the device. When the list is short, Completed and Upcoming sit at the bottom of the screen, just clear of the + button; opening Upcoming moves it up as its days fill the space.
- **Groups:** in the user's own order (arrows in Options), after the priority todos, with ungrouped todos last.
- **Done:** 1.5px strike-through.
- **Group label:** Kalam, 1.05rem, letter-spaced, ruled underline, a step below the Completed and Upcoming headings. Upcoming's day labels match.
- **Add / Options:** a round accent + button bottom right opens the sheet for a new todo (there's no inline add field, removed 2026-11-24); an ink three-dot button top-right of the header opens Options, whose title is 2rem.
- **Sheets:** square, margin rule continues; text input is an underline; chips show a checkbox square.

## Motion

Sheet slides up 200ms; done row strikes for 160ms; a swiped row follows the finger and snaps open or shut in 160ms (keyboard focus on its Options button slides it the same way); the + button scales on press. Nothing else.
