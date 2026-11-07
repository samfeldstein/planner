# Merged build plan: Planner PWA (todos only)

> **Historical.** Written before the build; parts are out of date. Current layout: one repo, `src/` built into `docs/` (not `private/` and `public/`), Pages from `main` `/docs`; group order is the user's own; no bottom bar (inline add). See [README](../README.md), [RELEASE](../RELEASE.md), [design.md](../design.md).

Sources: [ios-pwa.md](ios-pwa.md), [data-extensibility.md](data-extensibility.md), [mobile-ux.md](mobile-ux.md). The spec in memory is final. This file only resolves conflicts between the three reports and sets the build order. Where a report is silent, its pick stands.

## 1. Conflicts resolved

| # | Conflict | Pick | Why |
|---|----------|------|-----|
| 1 | **Undo vs "flush pending writes"** (iOS D10 assumed a delayed delete) | Every action writes to IndexedDB immediately. Undo re-puts a snapshot. Nothing is pending, so the update flow has nothing to flush. | UX 11 and data agree. Safe if iOS kills the app inside the 5 s. |
| 2 | **Group order:** data has an `order` field, UX sorts A to Z | Sort A to Z by name, "Other" last. Keep `order` in the schema, set to creation index, unused in v1. | No reorder UI. Manual order can ship later with no migration. |
| 3 | **Export timing:** UX prebuilds the file, data builds it in the tap | Build the JSON synchronously from the in-memory store inside the tap handler. No prebuild. | Simpler. Removes UX risk 3. |
| 4 | **CSP vs inline critical CSS** (iOS D12 `default-src 'self'` blocks inline `<style>`) | CSP gets `style-src 'self' 'unsafe-inline'`; `script-src 'self'` stays strict. Inline CSS is only the `html` background and tokens. | Prevents a white flash in dark mode. Style injection is low risk with no third-party code. |
| 5 | **Build allowlist** (iOS D11) lists `*.js` but modules live in `js/core`, `js/data`, `js/features` | Allow `js/**/*.js`. `build.mjs` generates `ASSETS` by scanning `public/`, so no module can be missing from the cache. | Closes data risk 5. |
| 6 | **Edit sheet vs `editRule`:** UX lets you change the due date on a recurring todo, data resets `due` on rule edit | On save of a recurring todo: re-anchor `monthDay` and `month` from the chosen due date, then `due = firstOnOrAfter(rule, chosenDue)`. Same code path as create. | One rule for both sheets. |
| 7 | **Day change:** UX and data both specify it | Use data's `clock.js` (visibility, `pageshow`, `focus`, midnight timer). | Already identical in intent. |
| 8 | **Min iOS version** (unstated) | iOS 17 or later. | `persist()` heuristics need it (WebKit, iOS 17). `randomUUID` needs 15.4. |

## 2. Needs your call

| # | Question | Default |
|---|----------|---------|
| 1 | **Upcoming screen.** Decided 2026-11-01: **no, Today only.** Future todos are not listed or editable until they come due. Bottom bar is `Add` and `More`. Drop `upcoming` from features and from M4. Superseded 2026-11-07: a collapsed Upcoming list below Night (see roadmap). | Closed |

## 3. Final structure

```
planner/private/
  src/                       the shipped app
    index.html               viewport-fit=cover, metas, CSP, inline tokens
    manifest.webmanifest     id "/planner/", relative start_url and scope
    sw.js                    VERSION and ASSETS stamped by build
    icons/                   180, 192, 512, 512 maskable PNG
    css/app.css
    js/app.js                boot, install gate, update flow
    js/core/                 date, recur, model, clock   (pure, tested)
    js/data/                 db, migrations, store, backup
    js/features/             today-view, sheet (add/edit), groups,
                             backup-ui, stale-banner, toast, more
  tests/                     node --test on js/core, run under 5 TZ values
  plans/  design.md  icon-master.svg  build.mjs
planner/public/             own git repo, release output only, never edited by hand
```

Rules: `features → data → core`, features never import each other, `store` is the only writer. The app has no network calls after install.

## 4. Build order

| M | Milestone | Done when |
|---|-----------|-----------|
| 1 | **Core logic + tests** (`date`, `recur`, `model`, `clock`) | All 45 data-report cases pass under 5 timezones. |
| 2 | **Data layer** (`db`, `migrations`, `store`, `backup`) | Add, complete, Tomorrow, Skip, undo, group delete, export, import work from a Node/browser test page. |
| 3 | **Today view + add/edit sheet + toast** | Add a todo with the keyboard open at 375 px; complete, Tomorrow, Skip, Undo behave per UX 1–13. |
| 4 | **Groups, More, backup banner** | Group rename and delete (with confirm), banner at 7 days, import with confirm. |
| 5 | **PWA shell:** manifest, icons, `sw.js`, install gate, update flow | Installs from Home Screen, works in airplane mode, update arrives on resume. |
| 6 | **Build + deploy:** `build.mjs`, `public/` repo, Pages | Release leaks nothing outside the allowlist. First deploy renders on the phone. |
| 7 | **Device checklist** (below) | Every item checked on the real iPhone. |

## 5. Device checklist (before real use)

- `persist()` result shown on More.
- Status bar in dark mode (`default` style); fall back to `black-translucent` plus own inset if it fails.
- Sheet stays above the keyboard (`visualViewport`); fall back to docking the sheet at the top.
- `.json` file picker accepts a real export; if not, drop `accept`.
- Share sheet with file works; Files save path works.
- Icon has no black corners.
- Update arrives while backgrounded and applies on return.
- Data survives a phone restart; airplane-mode cold launch works.
- Does deleting the Home Screen icon wipe data? (unverified; do this once with a throwaway todo.)

## 6. Standing rules

- **Backup first:** export on the phone before any release that bumps the DB version.
- **Account hygiene:** no other Pages sites on the GitHub account (shared origin). Never rename the repo.
- **Append-only migrations**, each tested against a real exported backup.
- **No reads of `todo.due` outside `core/recur.js` and the store.** Use `effectiveDue`.
- **Record the chosen visual style in `design.md`** (per the design-direction skill) before M3.

## 7. Accepted risks

Shared origin on Pages, iOS storage eviction (export is the net), Tomorrow merging two occurrences on adjacent scheduled days, 5 s undo is short for VoiceOver, manual two-step release (build, then push) with no staging copy.
