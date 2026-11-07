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
- **Sections:** Morning, Afternoon, and Night, always shown (even empty), 2rem headings, a ruled line between them. Every todo is in exactly one.
- **Priority:** top-priority todos come first in their section; each keeps a filled accent square on the margin rule.
- **Upcoming:** a collapsed disclosure below Night, its summary set like a section heading with the count and the row arrow. Later todos by day, each day labelled like a group (Tomorrow, then short dates); a repeating todo shows only its next due date. Tapping one opens the edit sheet. Open or closed is remembered on the device.
- **Groups:** subgroups inside a section, in the user's own order (arrows in More), with ungrouped todos last.
- **Done:** 1.5px strike-through.
- **Group label:** Kalam, smaller than a section heading (1.05rem), letter-spaced, ruled underline.
- **Add / More:** inline add field under the list, plus a round accent + button bottom right that focuses it (hidden while the keyboard is up); ink three-dot button top-right of the header.
- **Sheets:** square, margin rule continues; text input is an underline; chips show a checkbox square.

## Motion

Sheet slides up 200ms; done row strikes for 160ms; the + button scales on press. Nothing else.
