# iOS PWA report: manifest, service worker, storage, updates, deploy

> **Historical.** Written before the build; parts are out of date. Current layout: one repo, `src/` built into `docs/` (not `private/` and `public/`), Pages from `main` `/docs`; group order is the user's own; no bottom bar (inline add). See [README](../README.md), [RELEASE](../RELEASE.md), [design.md](../design.md).

Scope: the platform layer for the todos-only iPhone planner. The spec's decisions are taken as final. Each decision has one pick and its main tradeoff. Evidence and sources are at the end. Items marked **(unverified)** need a device test before the build plan relies on them.

## Findings that shape the design

1. **The origin is `https://<user>.github.io`, not the repo.** Every GitHub Pages project site of this account shares that origin, so they share IndexedDB, Cache Storage, quota, persist status, and eviction fate. Any other Pages site on the account can read the planner's data. Renaming the repo keeps the data (same origin) but breaks the installed icon and SW scope. Moving to a custom domain later is a new origin: data does not follow; export/import is the only path.
2. **Safari tab and Home Screen app have separate storage.** Data written in a Safari tab is not visible to the installed app. Long-standing WebKit behavior, confirmed by bug reports and developer reports; no current Apple doc states it directly.
3. **The 7-day script-storage cap is Safari-only.** WebKit (Wilander, 2020) said Home Screen web apps have their own days-of-use counter and should not lose first-party data. Eviction still exists under storage pressure (LRU per origin, whole origin at once). Persistent mode excludes the origin from eviction.
4. **`persist()` is granted by heuristics, and "opened as a Home Screen Web App" is the named one** (WebKit, Safari/iOS 17+). So call it from the installed app, not the Safari tab. Third-party claims that it "always returns false on iOS" contradict WebKit; treat as wrong but test.
5. **iOS 26 opens every Home Screen site as a web app by default** and uses manifest icons when present. A manifest is still worth shipping (name, icons, display, scope, colors).
6. **GitHub Pages sends `Cache-Control: max-age=600` on everything and it cannot be changed.** The SW script itself bypasses the HTTP cache on update checks (default `updateViaCache: 'imports'`), but precache fetches do not, unless told to. Unhandled, this is the main source of "stale old version" and mixed-version caches.
7. **An installed iOS app is usually resumed, not relaunched**, so a navigation-triggered SW update check often never happens. Older reports show installed apps stuck on old versions. The app must ask for updates itself on resume.
8. **iOS does not build a splash screen from the manifest.** It needs one `apple-touch-startup-image` per device size; without them, a plain screen shows until first paint. With a tiny precached shell, first paint is fast.

## Decisions

### D1. Hosting path and origin
- **Pick:** GitHub Pages project site at `https://<user>.github.io/planner/`, from the public repo named `planner`. Never rename the repo. Namespace everything: IndexedDB name `planner`, cache names `planner-<version>`, SW scope `/planner/`. Rule: no other untrusted or experimental Pages sites on this GitHub account.
- **Tradeoff:** free and simple, but storage isolation depends on account hygiene rather than on a dedicated origin. A custom domain would isolate it, at a cost, and would need a one-time export/import.

### D2. Manifest
- **Pick:** `manifest.webmanifest` with:
  - `id: "/planner/"`, `start_url: "./"`, `scope: "./"` (relative, so it resolves under `/planner/`; a leading `/` would point at the account root).
  - `display: "standalone"`, `name: "Planner"`, `short_name: "Planner"`.
  - `background_color` and `theme_color` set to the light-mode ground color (manifest cannot express dark mode).
  - `icons`: 180, 192, and 512 px PNG, `purpose: "any"`, plus a 512 `maskable` for completeness.
  - No `shortcuts`, `screenshots`, or `orientation` (iOS ignores or doesn't need them; portrait-only is implicit on phone use) **(unverified for orientation lock on iOS)**.
- **Tradeoff:** minimal fields means nothing to maintain, but no app-shortcut menu on long-press.

### D3. Icons
- **Pick:** one master SVG in `private/`, exported once by hand to opaque PNGs (180, 192, 512, plus maskable 512). Also `<link rel="apple-touch-icon" href="icons/180.png">` as fallback for iOS versions before 26. No transparency: fill the background.
- **Tradeoff:** a manual export step on icon change (rare) versus adding an image tool to the build. iOS 26 accepts SVG icons, but PNG works on every version, so PNG wins. iOS fills transparent areas with black **(unverified on iOS 26)**.

### D4. Splash screen
- **Pick:** no `apple-touch-startup-image`. Set `background-color` on `html` from CSS tokens (light and dark), inline the critical CSS in `index.html`, and keep the shell small so first paint is near-instant from cache.
- **Tradeoff:** a brief plain flash at cold launch, versus ~15 device-specific images that go stale with each new iPhone size.

### D5. Status bar, safe areas, viewport
- **Pick:**
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">` (not `black-translucent`, which forces white status-bar text and is unreadable in light mode).
  - Two `theme-color` metas with `media="(prefers-color-scheme: light|dark)"`.
  - Pad the header, the bottom add bar, and toasts with `env(safe-area-inset-*)`; the scrolling list gets `padding-bottom` covering the add bar plus the bottom inset.
  - Size the app with `100dvh` on a single root container, never on fixed children. Test it; WebKit bugs show standalone + `viewport-fit=cover` misreporting `svh` and `visualViewport.height` by the inset (iOS 18.3 report).
  - Bottom add bar above the keyboard: use `visualViewport` resize events; `safe-area-inset-bottom` does not update when the keyboard shows (WebKit bug). Detailed layout belongs to the mobile UX report.
- **Tradeoff:** `default` status-bar style may not follow dark mode in standalone **(unverified on iOS 26)**. If it shows a white bar in dark mode, switch to `black-translucent` with our own painted top inset in both themes.

### D6. Install gate (Safari tab vs Home Screen)
- **Pick:** on load, if not standalone (`matchMedia('(display-mode: standalone)').matches || navigator.standalone`), show only a one-screen "Add to Home Screen" guide and write nothing to storage. Bypass on `localhost` for development.
- **Tradeoff:** the app can't be used in a Safari tab at all, but this prevents two silent, diverging datasets, which is the worst failure for a single-user, no-sync app.

### D7. Persistent storage
- **Pick:** call `navigator.storage.persist()` on first standalone launch, after the first todo is saved (a "meaningful interaction"), and again on later launches while `persisted()` is false. Store the result. Show it on the settings/backup screen as one line ("Storage: protected" or "Storage: may be cleared by iOS, keep exports current"). Never block the app on it.
- **Tradeoff:** a grant is heuristic and can't be forced; the 7-day export banner remains the real safety net, as the spec says.

### D8. Service worker caching strategy
- **Pick:** precache everything, serve cache-first, no runtime caching.
  - `sw.js` at `/planner/sw.js`, registered with `{ scope: './', updateViaCache: 'none' }`.
  - The build writes `VERSION` (content hash) and `ASSETS` (file list) into `sw.js`, so every release changes the SW bytes.
  - **Install:** open `planner-<VERSION>`; fetch each asset as `new Request(url + '?v=' + VERSION, { cache: 'reload' })` and store it under the clean URL. All-or-nothing: if any fetch fails, install fails and the old version keeps running.
  - **Activate:** delete every cache starting with `planner-` that isn't current; `clients.claim()`.
  - **Fetch:** same-origin GET only. Navigations get cached `index.html`. Other requests: cache match, else network. Nothing else is touched.
  - System font stack, no web fonts: fewer assets and nothing to fail offline.
- **Tradeoff:** every release re-downloads the whole app (tens of KB, trivial). In exchange the app is fully offline from first install and never mixes files from two versions. The `?v=` query defeats both the 10-minute browser cache and any CDN edge copy right after deploy.

### D9. Offline behavior
- **Pick:** the app never needs the network after install. No online/offline indicator, no network calls in app code. Export/import are local (share sheet and file picker).
- **Tradeoff:** none in practice; the app can't detect "you're on an old version" while offline, which is fine.

### D10. Update flow
- **Pick:**
  1. **Check:** call `registration.update()` on page load and on every `visibilitychange` to visible, at most once per 10 minutes. This covers iOS resuming the app without reloading.
  2. **Apply silently when hidden:** when a new worker is `waiting` and the page goes hidden, flush pending writes (including any pending undo-toast delete), post `SKIP_WAITING`, and on `controllerchange` call `location.reload()`. The user returns to the new version without seeing a reload.
  3. **Fallback toast:** if a worker is waiting while visible, show a quiet "Update ready" toast with a "Reload" button that does step 2's apply. The toast never interrupts typing.
  4. **Visibility:** the settings screen shows the version hash and a "Check for updates" button.
  5. **Schema safety:** new code must open the DB with migrations; old pages must close on IndexedDB `versionchange`. This is coordinated with the data report.
- **Tradeoff:** the hidden-time apply may not finish before iOS suspends the page **(unverified)**. The toast and the next-launch check then catch it. Worst case, one session runs the old version.

### D11. Repos, build, and deploy
- **Pick:**
  - `planner/private/` holds `src/` (the app), `plans/`, `design.md`, icon master, and `build.mjs`: a zero-dependency Node script using only built-in modules.
  - `build.mjs`:
    1. Copy `src/` into `../public/` after wiping it (keep `.git`).
    2. Compute a SHA-256 over all files and stamp `VERSION` and `ASSETS` into `public/sw.js`.
    3. Write `.nojekyll`, so Jekyll doesn't ignore `_`-prefixed files or rewrite anything.
    4. Fail if `public/` contains anything outside an allowlist (`*.html, *.css, *.js, *.webmanifest, icons/*.png, .nojekyll`). This keeps plans and notes from leaking.
  - `planner/public/` is its own git repo with its own remote (`github.com/<user>/planner`). Pages source: "Deploy from a branch", `main`, `/ (root)`, HTTPS enforced. No GitHub Actions.
  - Release: run the build, commit in `public/`, push. Private repo pushes separately to its own private remote.
  - Before any release that bumps the DB schema, export a backup on the phone first.
- **Tradeoff:** branch deploy is the simplest and has no CI to maintain, but publishing is a manual two-step (build, push), and there is no staging copy. A staging site on the same account would share the origin (D1), so it's not worth it.

### D12. Security headers (what's possible on Pages)
- **Pick:** a `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'`. No inline scripts, so `script-src 'self'` holds.
- **Tradeoff:** a meta tag can't set `frame-ancestors` or other headers (Pages offers no header control). CSP stops injected third-party exfiltration but cannot stop another same-origin Pages site reading the data (see D1).

### D13. Testing on the device
- **Pick:**
  - Develop on desktop at `localhost` (secure context for SW); run the install-gate bypass there.
  - Verify on the iPhone via the Pages URL, with Mac Safari's Develop menu attached to the Home Screen app (Web Inspector).
  - Device checklist before first real use:
    - `persist()` result.
    - Status bar in dark mode.
    - `100dvh` with the keyboard open.
    - Icon transparency.
    - An update arriving while the app is backgrounded.
    - Data survives a phone restart.
    - Airplane-mode cold launch works.
- **Tradeoff:** no automated device tests; a short manual checklist per release is proportionate for one user.

## Risks

- **Shared origin:** any other GitHub Pages site on this account can read or wipe the planner's IndexedDB. Mitigation is account hygiene only.
- **Deleting the Home Screen icon may delete all data.** Likely, but no source confirms it **(unverified)**. The export banner is the only protection.
- **`persist()` may be denied silently;** storage-pressure eviction then removes the whole origin at once.
- **Stuck old version** if the update check or hidden-time apply fails on iOS. The settings version line and the "Check for updates" button are the escape hatch.
- **iOS release churn** (status bar, viewport units, keyboard insets) can change behavior between versions. Re-run the device checklist after major iOS updates.
- **A bad release** that breaks DB migration would load from cache offline. The fix is to ship a corrected `sw.js` (always fetched fresh) and keep exports current before schema changes.

## Evidence and sources

- WebKit, "Updates to Storage Policy" (Safari/iOS 17): Home Screen web apps get browser-level quota; eviction is LRU per origin; persistent-mode origins are excluded; `persist()` is granted "based on heuristics like whether the website is opened as a Home Screen Web App." https://webkit.org/blog/14403/updates-to-storage-policy/
- iTnews, 26 Mar 2020, quoting John Wilander (WebKit): the 7-day deletion applies to Safari; Home Screen web apps have their own counter. https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833
- WebKit bug 181849, "Add to homescreen apps don't share storage with Safari." https://lists.webkit.org/pipermail/webkit-unassigned/2018-January/809607.html
- WebKit bug 232302 (installed app data wiped after a week; `minimal-ui` vs `standalone`). https://bugs.webkit.org/show_bug.cgi?id=232302
- heise, iOS 26 web app changes: every Home Screen site opens as a web app by default; manifest icons are used; service workers not required. https://heise.de/-10749652
- WebKit, WWDC25 / Safari 26 features: SVG icon support including Home Screen icons. https://webkit.org/?p=16993
- MDN, `ServiceWorkerRegistration.updateViaCache`: default `imports` bypasses the HTTP cache for the SW script; Baseline widely available since Oct 2018. https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache
- GitHub Support (quoted on Stack Exchange): Pages sets `max-age=600` on all content, not configurable. https://webapps.stackexchange.com/questions/119286/caching-assets-in-website-served-from-github-pages
- Ionic forum: installed iOS app not picking up new versions; workaround was polling for updates. https://forum.ionicframework.com/t/ionic-v4-pwa-angular-service-workers-not-work-on-standalone-ios/161051
- WebKit bug 254868 (standalone + `viewport-fit=cover` viewport-height misreport, still on iOS 18.3.1) and bug 236445 (safe-area/keyboard). https://bugs.webkit.org/show_bug.cgi?id=254868 , https://bugs.webkit.org/show_bug.cgi?id=236445
- Discourse Meta, iOS splash screens need per-device `apple-touch-startup-image`. https://meta.discourse.org/t/generating-splash-screens-for-ios-pwa/112733
- web.dev, "Add a web app manifest": `id` decouples identity from `start_url`; leading `/` resolves to origin root. https://web.dev/articles/add-manifest
- modern-web-guidance `migrate-web-app-origin`: origin migration moves only the install, never IndexedDB or other data (Chromium feature; confirms data is origin-bound).
- Shared origin for project sites: inferred from how Pages URLs work (`<user>.github.io/<repo>`) and the same-origin policy; not separately cited.
