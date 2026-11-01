# Planner

A todos-only iPhone PWA: installable, offline, no accounts, no backend, no dependencies. Data lives in the browser (IndexedDB); export and import are plain JSON.

Live: https://samfeldstein.github.io/planner/

## Layout

| Path | Purpose |
|---|---|
| `src/` | The app: plain HTML, CSS, and ES modules |
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

## Fork it

1. Fork, then enable Pages from `main`, folder `/docs`.
2. If you rename the repo, change the `id` in `src/manifest.webmanifest` (`/planner/`) to match.
3. `npm run release` builds and pushes.

## License

MIT, see `LICENSE`. The Kalam font is separate; see below.

## Fonts

Kalam by Indian Type Foundry, SIL Open Font License 1.1.
