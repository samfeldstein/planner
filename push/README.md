# Push Worker

One small Cloudflare Worker, `planner-push`, that sends the daily "due today" notification. It stores up to three phone subscriptions in KV and, once an hour, sends an empty push to each phone whose local hour is its chosen hour (7). The phone's service worker builds the notification and sets the badge from the forecast the app keeps. No todo data reaches the Worker. It isn't part of the Pages build: the build reads only `src/`.

Files: `index.js` (routes and cron), `lib.js` (pure helpers, tested in `tests/push.test.js`), `make-keys.mjs`, `wrangler.jsonc`.

## Deploy (once)

Run these from the `push/` folder. Wrangler is fetched by `npx`; nothing is added to the repo.

1. Log in: `npx wrangler login`.
2. Make the KV namespace: `npx wrangler kv namespace create SUBS --update-config`. The flag writes the new `id` into `wrangler.jsonc` for you (replacing `REPLACE-WITH-NAMESPACE-ID`); without it, copy the `id` it prints in by hand.
3. `VAPID_SUBJECT` in `wrangler.jsonc` is the app's own URL (Apple accepts a URL or a `mailto:`), so no email address is needed.
4. Deploy: `npx wrangler deploy`. It prints the URL, like `https://planner-push.<your-subdomain>.workers.dev`, and registers the hourly cron. Until the secrets and `VAPID_PUBLIC` are set, the Worker sends nothing and logs why.
5. Make the keys and store the private one without showing it (`put` accepts piped input):
   `node make-keys.mjs | npx wrangler secret put VAPID_PRIVATE`
   The public key prints to your terminal (stderr). Copy it.
6. Set a token for the test route, kept in the gitignored `.test-token`: `openssl rand -hex 24 | tee .test-token | npx wrangler secret put TEST_TOKEN`.
7. Set `VAPID_PUBLIC` in `wrangler.jsonc` to the public key and run `npx wrangler deploy` again.
   Two checks catch a missed step. The Worker logs an error and sends nothing while `VAPID_SUBJECT` is still `mailto:CHANGE-ME`, `VAPID_PUBLIC` is empty, or `VAPID_PRIVATE` is missing or not a valid key (read the logs, below). And `npm test` fails if `VAPID_PUBLIC` in `badge.js` is set and differs from the one in `wrangler.jsonc`, or if only one of `PUSH_URL` and `VAPID_PUBLIC` is set.
8. Wire the app to it:
   - In `src/js/features/badge.js`, set `PUSH_URL` to that URL (no trailing slash) and `VAPID_PUBLIC` to the public key.
   - In `src/index.html`, change the CSP to `... default-src 'self'; connect-src 'self' <the Worker's origin>; ...`. `tests/build.test.js` fails if `PUSH_URL` is set and the CSP doesn't name its origin.
   - Release the app as usual (`RELEASE.md`).

## Check it on the phone (once)

1. Open Planner from the Home Screen, then Options (the three-dot button), Badge, Turn on, and allow notifications.
2. From the Mac: `curl -X POST -H "x-test-token: $(cat push/.test-token)" https://<worker-url>/test`. The reply counts what was sent. The badge and a notification should appear on the phone.
3. Logs: Cloudflare dashboard, Workers & Pages, `planner-push`, Logs (Workers Logs; kept 3 days). `npx wrangler tail` shows them live. One line per run that sent anything (counts, status codes, Apple's reason; every failed send also logs as an error); never the endpoint.

## Notes

- Only Apple push endpoints are accepted (the app is iPhone-only).
- There's no secret in the app and no rate limit, so anyone who finds the URL could keep posting subscriptions and push your phone out of the list, or use up the free 1,000 KV writes a day. They learn nothing. If it ever happens, add a pairing code.
- Changing the hour or cron: the hour is sent by the app (`HOUR` in `badge.js`); the cron stays hourly.
