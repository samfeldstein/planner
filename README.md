# Planner

An iPhone PWA for todos: installable, offline, no accounts, no dependencies. The one optional server piece is a small push Worker (`push/`) for the daily badge and notification. Data lives in the browser (IndexedDB); export and import are plain JSON.

Live: https://samfeldstein.github.io/planner/

## Layout

| Path | Purpose |
|---|---|
| `src/` | The app: plain HTML, CSS, and ES modules |
| `push/` | The optional push Worker for the daily badge (Cloudflare; see `push/README.md`) |
| `tests/` | Node's built-in test runner |
| `build.mjs` | Copies an allowlist from `src/` to `docs/`, stamps a content-hash version |
| `docs/` | Built site served by GitHub Pages (generated) |
| `tools/` | Dev server, icon generator, one-off importer |
| `plans/`, `design.md` | Design notes |

## Run

```bash
npm run dev    # dev server with live reload on :8766
npm test       # tests in five timezones
```

**On your phone:** run `npm run dev` and open the "On your phone" address it prints, in Safari on the same Wi-Fi (allow node through the Mac's firewall if asked). Edits reload the page. It's a Safari tab on plain http, so there's no service worker (no offline, badge, or update check), its data is separate from the installed app (start empty, or import a backup), and it's lost if the Mac's address changes. A swipe that starts at the screen's left edge may go back a page in Safari.

## Fork it

1. Fork, then enable Pages from `main`, folder `/docs`.
2. If you rename the repo, change the `id` in `src/manifest.webmanifest` (`/planner/`) to match.
3. `npm run release` builds and pushes.

## License

MIT, see `LICENSE`. The Kalam font is separate; see below.

## Fonts

Kalam by Indian Type Foundry, SIL Open Font License 1.1.
