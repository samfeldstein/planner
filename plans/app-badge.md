# App badge with a daily push (plan, 2026-11-21, revised after plan reviews 1, 2, and 3)

Sam's ask: the Home Screen icon shows how many todos are due, so he doesn't have to open the app. He chose a daily push (2026-11-21) over a badge that only updates while the app runs.

## Platform facts (checked 2026-11-21)

- iOS 16.4+ exposes `navigator.setAppBadge` / `clearAppBadge` only to Home Screen web apps, in pages and workers; the badge shows only once notification permission is granted, and WebKit recommends setting it while handling a push (webkit.org/blog/14112). `pushManager.subscribe` must run straight from a user gesture, and asks for permission itself (Apple, "Sending web push notifications in web apps and browsers").
- Every push must show a notification: WebKit removes a subscription after about three pushes that show none (WebKit commit "Enforce silent push quota").
- An empty push body is allowed (Apple: Content-Encoding may be omitted when the payload is empty). `TTL` is required; JWT `exp` at most 24h out, `aud` = push service origin, `sub` = `mailto:` or URL; `k` = raw 65-byte uncompressed public key, base64url. Don't mint a new JWT more than once an hour.
- WebCrypto ECDSA P-256 signatures are raw r||s, which is what JWS ES256 wants.
- The service worker must stay a classic script: installed phones run the old `updates.js`, and `update()` keeps the old worker's type (Service Worker spec, Update algorithm), so a module `sw.js` would fail to install for good (plan review 2).
- Cloudflare free plan: 5 cron triggers, 10 ms CPU per run, 100k KV reads and 1k writes a day. KV is eventually consistent (about 60 s).
- No periodic background sync on iOS, so a push is the only way to wake the app on a schedule.

## Design

### 1. Counting (page)

The count for a day is the number of undone todos due that day or overdue: `todos.filter((t) => isInToday(t, day)).length` on `store.todos()`. A check-off deletes a one-off or moves a repeat to a date after today (`complete()`), so checked-off rows the view still draws in place aren't counted, which is what the badge should show. New pure module `src/js/core/badge.js`: `dueCount(todos, day)`, `forecast(todos, today, days = 31)` → `{ "YYYY-MM-DD": n, ... }`, and `notificationText(n)` (n may be `null` for unknown).

Future days are exact, not estimates: a day's count depends only on the todos and the date, and every change to todos happens in the page, which rewrites the forecast.

### 2. Badge feature (page)

New feature module `src/js/features/badge.js` in `app.js`'s list. On init, every store change (except `backup`), and the clock's day change:
- `setAppBadge(dueCount(...))`, or `clearAppBadge()` at 0.
- Write the forecast to Cache Storage: cache `badge-counts` (not `planner-*`, which `activate` deletes), key `./badge-counts.json`, as a JSON Response. Coalesced to one write per task turn.
Skips where unsupported; errors caught, so a badge failure never breaks the list.

### 3. Service worker (stays classic, imports nothing)

- `push` handler, all inside `event.waitUntil`, never rejecting: read the forecast from `badge-counts`, take today's entry (worker's local date, computed with the same formula as `todayLocal`, inlined since the worker can't import). Missing entry or read error → unknown. Set or clear the badge (try/catch; skipped when unknown). Close open notifications with tag `daily`, then `showNotification(title, { body, tag: 'daily', icon })`.
- `notificationclick`: close it, focus an open window or `clients.openWindow('./')`.
- The notification text function is duplicated in `sw.js` (it can't import); a Node test checks both copies agree.

### 4. Push Worker (Cloudflare, new `push/` folder in the planner repo)

Dependency-free Worker, `push/index.js` (+ pure `push/lib.js`) and `push/wrangler.jsonc`, deployed to workers.dev as `planner-push`. Outside `src/`, so the Pages build never ships it.

- **Storage:** one KV key `subs` holding an array of at most 3 `{ endpoint, keys, tz, hour, seen }`. One read and at most one write per subscribe; one read per cron run; no `list`.
- **Routes:**
  - `POST /subscribe` `{ subscription, tz, hour }`: validate (endpoint https on `web.push.apple.com` or `*.push.apple.com`, since the app is iPhone-only; tz a valid IANA zone; hour 0–23; body under 4 KB). Same endpoint with the same tz and hour and `seen` under a day old: no write. Otherwise upsert, and if over 3, drop the least recently seen.
  - `POST /unsubscribe` `{ endpoint }`: remove.
  - `POST /test`: sends a push now to all; needs header `x-test-token` matching the `TEST_TOKEN` secret. For the first on-phone check, from the Mac with curl.
  - CORS on the two app routes: exactly `https://samfeldstein.github.io`, plus `http://localhost:8766` for dev. Answer the `OPTIONS` preflight with 204, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`, and the matching origin (tested).
- **Abuse, stated plainly:** there's no secret (the app's JS is public, so a key in it wouldn't be one), and no rate limit. Someone who found the URL and kept posting could keep evicting Sam's phone (he'd miss mornings until it stopped; each app launch puts it back) or use up the 1k KV writes a day (then subscribes fail until the next day; pushes still go out). They learn nothing: no todo data reaches the Worker. Acceptable for a personal app; if it ever happens, add a pairing code.
- **Cron:** `0 * * * *` (hourly, UTC). For each subscription whose local hour (`Intl.DateTimeFormat` with its tz) equals its `hour`, send. Handles DST without touching the cron.
- **Sending:** `POST <endpoint>`, no body, `TTL: 43200`, `Urgency: normal`, `Authorization: vapid t=<JWT>, k=<public key>`. One JWT per audience per run, `exp` now + 12h. On 404 or 410, remove the subscription. On 403 or other errors, keep it and log.
- **Keys:** `push/make-keys.mjs` makes the pair; the private JWK goes straight into `wrangler secret put VAPID_PRIVATE` by pipe (never in chat or a file); the public key is printed and hard-coded in `src/js/features/badge.js` and the Worker's vars. `VAPID_SUBJECT` var: a `mailto:` contact Sam picks.
- **Logs:** one line per cron run that sent anything: sent, removed, failed, with status codes and Apple's reason (e.g. `BadJwtToken`); never the endpoint.

### 5. Turning it on (More screen)

New "Badge" block in the More dialog:
- Off: "Show today's todo count on the app icon." Button "Turn on".
- Tap: `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` is the handler's first await (the registration is kept from init, so nothing is awaited before it; it asks for permission itself), then `POST /subscribe` with `tz = Intl.DateTimeFormat().resolvedOptions().timeZone`, `hour = 7`, then update the badge.
- On: "On. A notification comes each morning at 7." Button "Turn off": read the endpoint, unsubscribe, `POST /unsubscribe`, clear the badge.
- Denied: "Notifications are off for Planner. Turn them on in Settings, then try again."
- Error: "Couldn't turn on the badge. Try again." (If the Worker call fails after subscribing, keep the local subscription; the next launch re-posts it.)
- State comes from `pushManager.getSubscription()` and `Notification.permission`, never a stored flag.
- With a subscription, `POST /subscribe` again at launch and on each return to the app (`visibilitychange` to visible) when 12 hours have passed since the last post or the time zone changed (in-memory timestamp; the app is usually resumed, not relaunched). The Worker skips the write if nothing changed.
- The Worker URL is a constant in `badge.js`, set after the first deploy. The page's CSP (`src/index.html`, `default-src 'self'`) gains `connect-src 'self' <Worker origin>`; a build test checks the CSP names the URL in `badge.js`.

Copy above, the notification text (2026-11-24: title "Planner", body "4 items due today", "1 item due today", "Nothing due today", or "Open Planner to see today"; first approved 2026-11-21 as the line alone), and the 7 am hour: approved by Sam, 2026-11-21.

### 6. Docs

README ("no backend" becomes "one small push Worker, optional"), RELEASE.md (deploying the Worker), roadmap.

## Known limits

- From midnight to the morning push, the icon still shows yesterday's count (todos coming due today are missing until the push or an app open).
- After 31 days without opening the app, the push shows "Open Planner to see today" and no number.
- The user can hide badges in Settings while keeping notifications; the app can't tell.

## Edge cases

- Permission granted, subscribe fails: the badge still updates while the app runs.
- Notifications turned off in Settings: the subscription dies; More shows the denied state.
- Midnight with the app open: the day change updates the badge and forecast.
- Backup import emits a change; the forecast follows.
- A cron retry sends twice: the old notification is closed first, so one shows.
- Fresh install before the page wrote a forecast: unknown text.
- A todo checked off and then undone: the store puts it back, the change rewrites the forecast.

## Tests

- Node, `core/badge.js`: counts with overdue, stale daily, a weekly not due today, a future one-off, a checked-off daily (not counted) and the same one undone (counted); a forecast across a month end and a DST change; texts for 0, 1, n, unknown. The `sw.js` copy of the text and date formula matches.
- Node, Worker (`push/lib.js`): endpoint host check, tz and hour validation, local-hour match across a DST change, upsert and eviction, the unchanged-write skip, JWT header and claims, and a sign-then-verify round trip with WebCrypto in Node.
- Node, build: `push/` isn't in the release; `sw.js` still stamps.
- Browser (pane, as last session): the badge feature writes `badge-counts.json` after a store change; the More block's states with stubbed `pushManager`.
- Manual (Sam, once, on the phone): turn on, then a `/test` push from the Mac: badge and notification appear.
