# Push Worker

One small Cloudflare Worker, `planner-push`, that sends the daily "due today" notification. It stores up to three phone subscriptions in KV and, once an hour, sends an empty push to each phone whose local hour is its chosen hour (7). The phone's service worker builds the notification and sets the badge from the forecast the app keeps. No todo data reaches the Worker. It isn't part of the Pages build: the build reads only `src/`.

Files: `index.js` (routes and cron), `lib.js` (pure helpers, tested in `tests/push.test.js`), `make-keys.mjs`, `wrangler.jsonc`.

## Deploy (once)

Run these from the `push/` folder. Wrangler is fetched by `npx`; nothing is added to the repo.

1. Log in: `npx wrangler login`.
2. Make the KV namespace: `npx wrangler kv namespace create SUBS`. Copy the `id` it prints into `kv_namespaces` in `wrangler.jsonc` (replacing `REPLACE-WITH-NAMESPACE-ID`).
3. Make the keys and store the private one without showing it:
   `node make-keys.mjs | npx wrangler secret put VAPID_PRIVATE`
   The public key prints to your terminal (stderr). Copy it. (Wrangler reads a piped secret from stdin; this wasn't confirmed against Cloudflare's docs page for secrets. If it prompts instead, paste the JWK from `node make-keys.mjs > key.json`, then delete `key.json`.)
4. Pick the contact address and set it as `VAPID_SUBJECT` in `wrangler.jsonc` (a `mailto:` address; it's `mailto:CHANGE-ME` until then). Set `VAPID_PUBLIC` there to the public key.
5. Set a token for the test route: `npx wrangler secret put TEST_TOKEN` (any long random string; you'll type it again in the curl below).
6. Deploy: `npx wrangler deploy`. It prints the URL, like `https://planner-push.<your-subdomain>.workers.dev`, and registers the hourly cron.
7. Wire the app to it:
   - In `src/js/features/badge.js`, set `PUSH_URL` to that URL (no trailing slash) and `VAPID_PUBLIC` to the public key.
   - In `src/index.html`, change the CSP to `... default-src 'self'; connect-src 'self' <the Worker's origin>; ...`. `tests/build.test.js` fails if `PUSH_URL` is set and the CSP doesn't name its origin.
   - Release the app as usual (`RELEASE.md`).

## Check it on the phone (once)

1. Open Planner from the Home Screen, More, Badge, Turn on, and allow notifications.
2. From the Mac: `curl -X POST -H "x-test-token: <TEST_TOKEN>" https://<worker-url>/test`. The reply counts what was sent. The badge and a notification should appear on the phone.
3. Logs: `npx wrangler tail`. One line per run that sent anything (counts, status codes, Apple's reason); never the endpoint.

## Notes

- Only Apple push endpoints are accepted (the app is iPhone-only).
- There's no secret in the app and no rate limit, so anyone who finds the URL could keep posting subscriptions and push your phone out of the list, or use up the free 1,000 KV writes a day. They learn nothing. If it ever happens, add a pairing code.
- Changing the hour or cron: the hour is sent by the app (`HOUR` in `badge.js`); the cron stays hourly.
