# Release

The public repo (`planner/public/`) holds release output only. Never edit it by hand and never push both folders to one remote.

## First release

1. Build into `../public`:
   `node build.mjs`
2. Create the repo from that folder:
   `cd ../public && git init -b main && git add -A && git commit -m "Release"`
3. Publish it. The repo must be public and named `planner` (the manifest id is `/planner/`; never rename it):
   `gh repo create planner --public --source=. --remote=origin --push`
4. Turn on Pages from `main`, root:
   `gh api -X POST repos/{owner}/planner/pages -f 'source[branch]=main' -f 'source[path]=/'`
5. Read the URL (`https://<user>.github.io/planner/`):
   `gh api repos/{owner}/planner/pages --jq .html_url`

## Every release

Shortcut: commit `private/`, then `npm run release` (test, build, commit `public/`, push both). The manual steps:

1. On the phone, export a backup first if the DB version changed.
2. `npm test`
3. `node build.mjs`
4. `cd ../public && git add -A && git commit -m "Release <version>" && git push`

The installed app picks up the new version when it is next opened or resumed (see `src/js/features/updates.js`).

## Rules

- **Account hygiene:** every Pages project site on the account shares one origin (`<user>.github.io`), so they share storage. Keep no other untrusted or experimental Pages sites on this account.
- **No staging site:** it would share the origin. Test locally with `planner-app` or a built copy.
- **Build fails on purpose** if `src/` holds anything outside the allowlist (see `ALLOWED` in `build.mjs`).
