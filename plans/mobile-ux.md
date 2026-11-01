# Mobile UX report: Today view, fast add, actions

> **Historical.** Written before the build; parts are out of date. Current layout: one repo, `src/` built into `docs/` (not `private/` and `public/`), Pages from `main` `/docs`; group order is the user's own; no bottom bar (inline add). See [README](../README.md), [RELEASE](../RELEASE.md), [design.md](../design.md).

Scope: iPhone-only todos PWA, 375 pt baseline, vanilla HTML/CSS/JS. All spec decisions treated as final.

## 1. Decisions (one pick each)

| # | Decision | Pick | Main tradeoff |
|---|---|---|---|
| 1 | Swipe vs buttons for row actions | **Buttons only, no swipe in v1.** Leading check button completes. Tapping the row expands it in place to show `Tomorrow`, `Skip` (recurring only), `Edit`. One row open at a time. | Tomorrow costs two taps instead of one swipe; gains discoverability, VoiceOver parity, and no scroll conflicts. |
| 2 | Where navigation lives | **Bottom bar with three controls:** `Upcoming` (left), `Add` (center, widest), `More` (right). Nothing tappable in the header. | Bar eats about 52 pt + home-indicator inset; everything frequent is in thumb reach. |
| 3 | Fast add surface | **Bottom sheet `<dialog>` opened with `showModal()`, title field focused in the same tap handler.** Adding closes the sheet and returns to the list (changed from staying open for the next todo). `Done` also closes. | Single adds are one flow; batch entry needs the + button again each time. |
| 4 | Due date control | **Three chips: `Today` (selected by default), `Tomorrow`, `Date…`** where `Date…` is a native `<input type="date">`. | No custom calendar to build; native iOS picker looks plain but is accessible and free. |
| 5 | Group control | **Native `<select>`**: `No group`, groups A to Z, `New group…` (reveals an inline name field). | iOS wheel picker is slower for many groups; fine for the expected handful. |
| 6 | Priority control | **One toggle chip `Top priority`** (off = normal). Marked in the list by a short vertical accent bar on the row's leading edge plus hidden text "Top priority". | Only two levels, so a toggle beats a segmented control. |
| 7 | Recurrence picker | **Segmented `Never / Daily / Weekly / Monthly / Yearly`.** Weekly reveals seven weekday toggles (default: due date's weekday). Monthly and yearly anchor to the due date and show a summary line ("Every month on the 31st, or the last day"). | No separate anchor fields; changing the anchor means changing the due date. |
| 8 | Today view order | **Groups A to Z, `Other` always last. Inside a group: top priority first, then overdue (oldest first), then today, then creation order.** Empty groups hidden. | Alphabetical, not manual, order; avoids a reorder UI. Revisit if the user brings friction. |
| 9 | Overdue flag | **Text, not color alone:** meta line "Due Thu, 29 Oct" in the overdue color. Never shown on daily items (spec). | Slightly more text per row; passes color-blind and VoiceOver checks. |
| 10 | Undo scope | **Every list action gets the same 5 s toast with `Undo`:** complete, Tomorrow, Skip, and delete. One toast at a time; a new action replaces it (the earlier one stays committed). | Consistent model; only the latest action is undoable. |
| 11 | When the write happens | **Write to IndexedDB immediately; keep an in-memory snapshot for Undo** (data agent owns the mechanics). | Undo is a second write, but nothing is lost if iOS kills the app inside the 5 s. |
| 12 | Delete confirmation | **No confirm dialog for one todo** (Undo covers it). **Confirm dialog for deleting a group and for import** (bulk, spec requires import confirm). | A mis-tap on Delete relies on noticing the toast. |
| 13 | Edit surface | **Same sheet as Add, prefilled,** title "Edit todo", with `Save` and a `Delete` text button at the bottom. | One component to build and test. |
| 14 | Group management | **`More` screen, section "Groups":** tap a name to rename inline, `Delete` per row with confirm "Todos in Work move to Other." | Lives one level deep; rarely used. |
| 15 | Backup banner | **One-line banner at top of Today when last export is over 7 days ago** (or never, counted from the first todo's creation). Text "Last backup 9 days ago" + `Back up` button. **Not dismissible;** disappears on successful export. Hidden when there are zero todos. | Mild nag by design; the export is the real safety net. |
| 16 | Export | **`navigator.share({ files: [json] })`** when `navigator.canShare` accepts the file; else an `<a download>` fallback. Filename `planner-backup-2026-11-01.json`. Mark "last backup" only when the share promise resolves. | Cancelled shares do not count as backups, which is correct but may surprise. |
| 17 | Import | **`<input type="file" accept=".json,application/json">`**, validate, then confirm: "Replace all todos with this backup? It has 42 todos from 1 Nov 2026. Your 37 current todos will be removed." `Replace` / `Cancel`. | Full replace only (spec). |
| 18 | Dark mode | **`color-scheme: light dark` on `:root`, tokens via `light-dark()`** with a `prefers-color-scheme` fallback, `<meta name="color-scheme" content="light dark">`, two `theme-color` metas with media queries. | None worth noting; follows system only (spec). |
| 19 | Status bar style | **`apple-mobile-web-app-status-bar-style` = `default`**, not `black-translucent`. | `black-translucent` gives edge-to-edge but forces white status text, unreadable in light mode. Verify look on device. |
| 20 | Typeface | **System font (`-apple-system-body` shorthand) for everything,** so iOS Dynamic Type text size applies. | No distinctive typeface; correct for a native-feeling tool and costs zero bytes. |
| 21 | Toast element | **Plain fixed element with `role="status"`**, not `popover`. Toasts only appear on the main list, never over an open dialog. | Simpler; avoids the iOS 18.3 Popover floor. |
| 22 | Sheet dismissal | **`Cancel`/`Done` button + tap on backdrop (scripted).** No drag-to-dismiss and no grabber handle. | No swipe-down; a grabber would promise a gesture that is not there. |
| 23 | Day rollover | **Re-render Today on `visibilitychange` and on a timer set to the next local midnight.** | Tiny bit of code; without it an app left open shows yesterday. |

## 2. Layout at 375 pt

Side gutter: `max(16px, env(safe-area-inset-left/right))`. Top: `env(safe-area-inset-top)` + 12 pt. Bottom bar: 52 pt + `env(safe-area-inset-bottom)` (34 pt on Face ID phones). List gets bottom padding equal to the bar so the last row is never hidden.

```
+-------------------------------------+  <- safe-area top
|  Sunday, 1 November                 |  28/34 semibold
|  6 to do                            |  15 secondary
|                                     |
|  Last backup 9 days ago  [Back up]  |  banner (only when stale)
|                                     |
|  Errands                            |  section h2, 15 semibold, secondary
|  ( ) | Renew passport               |  | = top-priority bar
|        Due Thu, 29 Oct              |  overdue meta, overdue color
|  ( )   Buy stamps                   |
|  ---------------------------------- |  hairline between groups only
|  Home                               |
|  ( )   Water plants                 |
|        Every Mon, Thu               |
|      [Tomorrow] [Skip] [Edit]       |  expanded row (one at a time)
|  ---------------------------------- |
|  Other                              |
|  ( )   Call dentist                 |
|                                     |
|  +-------------------------------+  |
|  | Completed  Buy stamps  [Undo] |  |  toast, sits above bar
|  +-------------------------------+  |
|-------------------------------------|
| [Upcoming]   [   + Add   ]   [More] |  bottom bar
+-------------------------------------+  <- home indicator inset
```

Add sheet (keyboard open):

```
|  New todo                    [Done] |
|  [ What needs doing?              ] |  input, font-size >= 16px
|  (Today) (Tomorrow) (Date…)         |
|  [Group: No group  v] (Top priority)|
|  Repeat: Never Daily Weekly Mo. Yr. |
|  [ Add ]                            |
|=====================================|  keyboard
```

Row anatomy: check button 44 x 44 hit area (24 pt drawn circle), title 17 pt, one optional meta line 13 pt (overdue date, or recurrence summary, or group not shown since sections show it). Minimum row height 48 pt. Left-aligned throughout; only the bar's Add button is centered.

## 3. Visual tokens

Quiet and precise: one accent, hairlines only between groups, no cards, no shadows except the sheet and toast.

| Token | Light | Dark |
|---|---|---|
| `--bg` | #FFFFFF | #17181B |
| `--ink` | #1C1D21 | #ECEDEF |
| `--ink-2` (secondary) | #6B6F76 | #9A9EA6 |
| `--hairline` | #E4E5E8 | #2A2C31 |
| `--accent` (priority bar, Add, chips on) | #1F6F6B | #5FB3AC |
| `--overdue` | #B4382F | #E2766C |

Check all text pairs at 4.5:1 before build; `--ink-2` on `--bg` is the tightest. Type scale: 28 title, 17 body, 15 section, 13 meta, all scaling with Dynamic Type. Sentence case everywhere, no all-caps labels. Radii: 12 pt sheet top corners, 10 pt toast, 8 pt chips and buttons (hierarchy, not one radius for all).

Copy: actions keep one name through the flow. `Tomorrow` → "Moved to tomorrow". `Skip` → "Skipped to Mon, 9 Nov". Complete → "Completed". `Delete` → "Deleted". Empty Today: "Nothing due today." with the Add button below. Dates via `Intl.DateTimeFormat` in the phone locale.

## 4. Behavior details

**Complete.** Tap check: circle fills (150 ms), row collapses (200 ms), toast appears. One-off is deleted; recurring advances and leaves Today. Focus then moves to the next row's check button, or to the next section heading, or to the Add button when the list empties.

**Tomorrow / Skip.** From the expanded row. `Skip` is not rendered for one-offs (not merely disabled). Both remove the row from Today and show the toast.

**Sheet focus.** iOS only opens the keyboard when `focus()` runs synchronously inside the tap handler. Call `showModal()` then `input.focus()` in the same handler, with no `await` before them.

**Sheet above keyboard.** iOS overlays the keyboard and does not resize the layout viewport. Listen to `visualViewport` `resize`/`scroll` and set a CSS variable for the bottom offset of the sheet. Use `dvh`, never `vh`.

**Export timing.** Safari requires `navigator.share` inside the user gesture. Do not `await` an IndexedDB read first. Build the JSON `File` when the More screen opens (and after any change while it is open), so the `Back up` tap calls `share` immediately. The banner's `Back up` button should do the same; prebuild when the banner renders.

**Toast timer.** 5 s fixed (spec), but pause while the toast or its Undo button has focus, and resume on blur. Swipe-to-dismiss not needed.

**Recurrence summary text.** Weekly: "Every Mon, Thu". Monthly: "Every month on the 15th". Yearly: "Every year on 1 Nov". Daily: "Every day".

## 5. Accessibility

- Tap targets at least 44 x 44 pt (Apple HIG). Chips 44 pt tall even when drawn smaller.
- Check button is a `<button>` with `aria-label="Complete: Renew passport"` (it is an action that removes the item, not a persistent checkbox state).
- Row expander is a `<button aria-expanded>` wrapping the title.
- Each group is `<section aria-labelledby>` with an `<h2>`, list as `<ul>`. VoiceOver rotor then jumps by heading.
- Priority and overdue are spoken: visually hidden "Top priority", meta "Due Thu, 29 Oct, overdue".
- Toast: `role="status"` (polite), message includes the item name and "Undo available".
- Web has no VoiceOver custom actions, so visible buttons are the only VoiceOver-friendly path; another reason to skip swipe.
- Do not set `maximum-scale` or `user-scalable=no`. Pinch zoom stays on.
- Inputs: `font-size: max(16px, 1em)` so small Dynamic Type settings do not trigger iOS auto-zoom on focus.
- `prefers-reduced-motion: reduce`: sheet fades in (or appears) instead of sliding; row removal is instant; check fill stays (it is feedback, not motion).
- Focus ring visible for keyboard users (`:focus-visible`), for anyone with an external keyboard.

## 6. iOS Safari pitfalls to design around

| Pitfall | Handling |
|---|---|
| Horizontal swipe rows fight vertical scroll and steal taps | No swipe (decision 1). |
| `:hover` sticks after a tap | Wrap hover styles in `@media (hover: hover)`; use `:active` for press feedback. |
| Gray tap flash | `-webkit-tap-highlight-color: transparent` plus own `:active` state. |
| Long-press shows callout or selects text on rows | `-webkit-touch-callout: none` and `user-select: none` on rows and buttons only, not on inputs. |
| Input focus auto-zoom under 16 px | Decision above. |
| `focus()` outside gesture does not open keyboard | Synchronous focus in tap handler. |
| Keyboard covers fixed bottom UI | `visualViewport` offset. |
| `100vh` wrong with toolbars | `dvh` / `svh`. |
| `dialog closedby` unsupported in Safari | Script a backdrop-tap close; Esc/back already work. |
| `overscroll-behavior` limited in Safari | Page behind modal is inert via `showModal()`; per guidance, do not lock `body` with `overflow: hidden` / `position: fixed`. Test that background does not scroll noticeably. |
| `navigator.share` needs fresh user activation | Prebuilt file (section 4). |
| `<a download>` in standalone mode opens a preview, not a save | Only a fallback; share sheet is primary. |
| `accept` on file input can gray out `.json` in Files | Include both `.json` and `application/json`; test with an exported file. |
| Native date input renders centered, odd height | Hide the input visually behind the `Date…` chip and call `showPicker()` where supported, else let the tap land on the input. |
| App left open across midnight | Decision 23. |

## 7. Evidence

- `modern-web-guidance` guides consulted: `dialog`, `prevent-page-scroll-under-modal-dialog`, `swipe-to-reveal`, `persistent-toast-notifications`, `dark-mode`.
  - `dialog`: `closedby` is "Unsupported in: Safari"; modal still closes on Esc and back, so only light dismiss needs script. Guide also says not to fall back to `overflow: hidden` or `position: fixed` on `html`/`body`.
  - `swipe-to-reveal`: the good implementation is scroll-snap based, but relies on `overscroll-behavior` (limited in Safari) and `scroll-initial-target` (unsupported in Safari). Workable later, not worth it in v1.
  - `persistent-toast-notifications`: recommends `popover="manual"`; Popover needs Safari iOS 18.3. Not needed since toasts never overlap dialogs (decision 21).
  - `dark-mode`: `color-scheme` must be on `:root`, not `body`; JS reading `prefers-color-scheme` must listen for `change`.
- Spec: every todo has a due date; Skip is recurring-only; daily never overdue; import replaces with confirm; group delete moves todos to Other; dark mode follows system.
- Apple HIG: 44 x 44 pt minimum hit target.
- WCAG 2.2.1 (timing adjustable) motivates the toast pause on focus.

## 8. Dependencies on other reports

- An `Upcoming` list (future todos by date, same row component) is needed to reach and edit non-today items. Keep it a plain list; no calendar.
- Data agent: snapshot-based undo, `lastExportAt`, first-todo date for the banner, next-due calculation for the Skip toast text.
- PWA agent: `viewport-fit=cover`, status-bar meta, `theme-color` metas, `storage.persist()` status line on the More screen ("Storage: protected" or "Storage: may be cleared by iOS").

## 9. Risks

1. Status bar appearance with `default` style in standalone mode varies by iOS version; check light and dark on device before polishing the header.
2. `visualViewport` keyboard math is the most fragile piece; if it misbehaves, fall back to docking the sheet at the top of the screen.
3. `navigator.share` with files may reject after a slow first prebuild; if so, show "Tap Back up again" rather than failing silently.
4. Two-tap Tomorrow may feel slow in daily use; a scroll-snap swipe can be added later as an enhancement on top of the buttons, not a replacement.
5. A 5 s undo is short for VoiceOver users; the focus pause helps only if they move to the toast in time.
6. Alphabetical group order may not match how the user thinks; manual order is the likely first friction request.
7. The `.json` file picker on iOS may gray out files with an unexpected type; verify import with a real export early.
