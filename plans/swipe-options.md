# Swipe right for Options

Sam's Apple Note, 2026-11-23; design B picked 2026-11-24: swiping right on a todo shows one Options button; tapping it opens the row's existing menu (Tomorrow, Skip for repeating todos, Edit). The visible arrow goes. Supersedes `plans/mobile-ux.md` decision 1 (no swipe) for the row's options.

## What changes

- **One button, revealed, not covered.** The existing `.row-more` button (label "Options: <title>", `aria-expanded`, `data-act="more"`) becomes the revealed button. It is parked just off the row's left edge (`translateX(-100%)`) inside a row with `overflow-x: clip`, and slides in as `.task` slides right; both move by `--swipe`. `.task` stays transparent, so the fixed margin rule shows as now. The button shows the word "Options" (Kalam, ink, on `--hairline`), spans the row's full height (`top: 0; bottom: 0`), and is `calc(80px + env(safe-area-inset-left))` wide with that inset as left padding. It paints above the priority square while open. Its focus ring is inset so the clip doesn't cut it. No new element, so keyboard order, VoiceOver, and the tests that click `.row-more` stay valid.
- **Swipe (touch and pen only; desktop keeps right-click).** On a live row in today's list (not struck, not in Completed or Upcoming), a horizontal drag right slides the row's content with the finger, up to the button's width W. On release, at W/2 or more it snaps open; otherwise closed. A drag left on an open row closes it. Snap is a 160ms transform transition (the existing reduced-motion rule already turns transitions off).
- **Tap the button:** toggles the menu as the arrow did, and the swipe closes. Focus stays on the button.
- **Keyboard:** `.row:has(.row-more:focus-visible)` slides the row open in CSS, so a keyboard-focused button is never hidden. Mouse clicks don't match `:focus-visible`, so a click on Options doesn't leave the row open. VoiceOver can activate the button whether or not it's shown (phone check: unchecked).
- **Right-click** still toggles the menu (unchanged). Desktop has no drag.
- `.task` right padding drops from 52px to `var(--gutter)`. While dragging, `.task:active` has no background.
- Upcoming and Completed summaries keep their disclosure arrows; their comments stop calling it "the row arrow".

## Gesture rules (pure, `src/js/core/swipe.js`, unit-tested)

- `classify(dx, dy)`: under 10px both ways → `pending`; then `swipe` if dx's size beats dy's, else `scroll`. Decided once per pointer. (If iOS has already locked the pan, a late `scroll` is a dead gesture: nothing happens; harmless.)
- `offset(start, dx, max)`: start (0 or max) + dx, clamped to 0..max.
- `settle(offset, max)`: `open` if offset ≥ max / 2, else `closed`.

## Wiring (`today-view.js`)

State is one object, `gesture` (null when idle): `{ pointerId, li, x, y, wasOpen, kind }`. The open row is read from the DOM (`.row.swiped`), never kept in a variable.

- **pointerdown** (`isPrimary`, `button === 0`, `pointerType` touch or pen):
  - If a row is open (`.row.swiped`) and the pointer isn't on that row's Options button: close it, set `suppressClick` (the tap was a dismiss, as in iOS Mail), and start no gesture. This covers a tap on the open row's task and a tap on any other row or control.
  - Else, if it's on a swipeable row's `.task`: start `gesture`.
- **pointermove**: ignore unless it's the gesture's pointer and `li.isConnected` (else `end()`). Classify; on `swipe`, try `setPointerCapture` (in try/catch), add `dragging` (no transition), set `--swipe` px on the row. On `scroll`, `end()`.
- **pointerup**: if the gesture was a `swipe`, settle to `.swiped` or not, clear `--swipe`, and set `suppressClick` (in case a click follows). Then `end()`.
- **pointercancel / lostpointercapture without up**: restore the state at pointerdown, `end()`.
- **`end()`**: one exit; removes `dragging` and `--swipe` from the row if still connected, clears `gesture`.
- **Click suppression:** a capture-phase `click` listener on `document` swallows (preventDefault + stopPropagation) the next click if `suppressClick` is set, then clears it; also cleared on the next pointerdown and after 500ms, so a missing click can't eat a later tap.
- **Re-render:** `render()` replaces rows, so an open swipe closes; a gesture on a detached row ends at its next event. Leaving the app re-renders, so it closes too.
- **Opening a row** closes any other `.swiped` row first.
- Swipeable rows get `touch-action: pan-y pinch-zoom` (iOS support for `pinch-zoom` unchecked).

## Edge cases

- Still tap on a closed row with none open: unchanged (completes).
- Drag starting on the Options button: no gesture.
- `busy` double-tap guard unaffected; `lastTap` focus logic unaffected (suppressed clicks never reach it).
- Struck rows have no `.row-more`: no swipe.
- iOS left-edge back-swipe: no history in the app (unchecked on the phone).
- Landscape: the button's width includes the left safe-area inset.

## Docs to update

`design.md` (Components: rows' Options swipe; Motion: the 160ms snap; Upcoming's "row arrow"), the `today-view.js` header comment, the `app.css` comments at the summary arrow, `plans/mobile-ux.md` (mark decision 1 superseded), roadmap.

## Tests

- `tests/swipe.test.js`: `classify`, `offset`, `settle`.
- `tests/browser/swipe.html` (added to `npm run test:browser`), transitions off in the frame, synthetic `pointerType: 'touch'` events, clicks dispatched by the test where a real tap would send one:
  - a swipe past half opens (`.swiped`) and the following click doesn't complete;
  - a short drag snaps back;
  - a vertical drag doesn't open;
  - tapping Options on an open row opens the menu and closes the swipe;
  - a tap on the open row's task closes it without completing;
  - with a row open, a tap on another row closes the first and doesn't complete the second;
  - a mouse drag does nothing; right-click still opens the menu;
  - keyboard focus on Options (`focus({ focusVisible: true })`) slides the row open (checked via computed transform).
- Existing `checkoff.html` and `new-todo.html` keep passing.
