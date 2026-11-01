# Release

One repo. `src/` is the source; `docs/` is the built site that GitHub Pages serves. Never edit `docs/` by hand: every build rewrites it.

## Every release

1. On the phone, export a backup first if the DB version changed.
2. Commit your changes.
3. `npm run release` (runs `npm test`, `node build.mjs`, commits `docs/`, pushes).

The installed app picks up the new version when it is next opened or resumed (see `src/js/features/updates.js`).

## First-time Pages setup

The repo must be public and named `planner` (the manifest id is `/planner/`; never rename it). Serve from `main`, folder `/docs`:

`gh api -X POST repos/{owner}/planner/pages -f 'source[branch]=main' -f 'source[path]=/docs'`

If Pages already exists, change the source instead (`-X PUT`, same fields).

## Rules

- **Account hygiene:** every Pages project site on the account shares one origin (`<user>.github.io`), so they share storage. Keep no other untrusted or experimental Pages sites on this account.
- **No staging site:** it would share the origin. Test locally with `planner-app` or a built copy.
- **Build fails on purpose** if `src/` holds anything outside the allowlist (see `ALLOWED` in `build.mjs`).
- **Personal data stays out:** `.gitignore` lists the old-app export and import files. Keep any new personal file listed there.
