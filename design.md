# Design

Style: **restrained, quiet, native-feeling.** Light ground by default, dark by system setting. One accent. No cards, no shadows except the sheet and toast. Type is the system font, so Dynamic Type works.

Chosen 2026-11-01. The user excluded no styles and said simplicity and elegance win.

## Don't use

Cream or off-white ground with a serif display and clay accent. Near-black ground with a neon accent. Identical rounded cards with soft grey shadows. Gradient washes. All-caps tracked labels. Numbered section labels. Middle-dot meta strings. Spaced em-dash labels. Arrows on buttons. Italic or colored accent words in headings. Monospace labels. Pill buttons.

Add to this list whenever the user rejects something.

## Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | #FFFFFF | #17181B |
| `--ink` | #1C1D21 | #ECEDEF |
| `--ink-2` | #6B6F76 | #9A9EA6 |
| `--hairline` | #E4E5E8 | #2A2C31 |
| `--accent` | #1F6F6B | #5FB3AC |
| `--overdue` | #B4382F | #E2766C |

Type scale: 28 title, 17 body, 15 section, 13 meta. Sentence case everywhere. Radii: 12 sheet top corners, 10 toast, 8 chips and buttons.

## Layout

Left-aligned. Gutter 16, plus safe-area insets. Rows 48 tall minimum, hit targets 44. Bottom bar holds Add (More joins it in M4). Hairlines only between groups.

## The one memorable thing

The check button: a plain ring that fills with the accent when pressed. Everything else stays quiet.

## Motion

Only motion that answers a tap: check fill 150 ms, row collapse 200 ms, sheet slide. All of it is off under `prefers-reduced-motion`.

## Copy

Actions keep one name through the flow: Tomorrow → "Moved to tomorrow", Skip → "Skipped to Mon, 9 Nov", Complete → "Completed", Delete → "Deleted". Empty Today: "Nothing due today."
