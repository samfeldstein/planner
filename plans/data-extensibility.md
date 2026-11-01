# Data and extensibility plan

Planner PWA, todos only. Scope: IndexedDB schema, migrations, backup, recurrence and rollover, group deletion, and module layout. The spec is final; this plan only fills in how.

## Findings

1. **Store dates as civil date strings (`"YYYY-MM-DD"`), never timestamps.** All date arithmetic goes through `Date.UTC`. This one rule removes every DST bug and makes "today follows the phone clock" a plain string comparison.
2. **Embed the recurrence rule in the todo**, and store the anchor day (for example the 31st) in the rule, not only in `due`. Without that anchor, a clamped Feb 28 would drift every later month to the 28th.
3. **Keep the whole dataset in memory, with write-through to IndexedDB.** It stays small (hundreds of records), and it lets export build its JSON synchronously inside the tap handler. iOS Safari needs that, because `navigator.share` must run while the tap's user activation is still valid.
4. **Daily "never overdue" is derived at read time, not written to the database.** `effectiveDue = max(due, today)` for daily rules. No background job, no rollover writes, and nothing to break while the app sits suspended overnight.
5. **Use one set of record-upgrade functions for both IndexedDB migrations and old-backup import.** Then an old backup always imports cleanly into a newer app.
6. **"Other" is virtual (`groupId: null`), not a stored group.** Deleting a group is one transaction that nulls `groupId` on its todos and deletes the group.
7. **Pure core, thin edges.** `core/` modules have no DOM or IndexedDB access, so Node's built-in test runner can test all the date logic under any `TZ`.

## Decisions

| Decision | Pick | Main tradeoff |
|---|---|---|
| Date format | Civil `"YYYY-MM-DD"` strings for `due` and `lastDone`; ISO timestamps only for `createdAt`, `updatedAt`, and backup metadata | Dates don't follow the user across timezones as instants, which is what "phone timezone" wants anyway |
| Date arithmetic | `Date.UTC(y, m-1, d+n)` read back with `getUTC*` | One helper module must be used everywhere; a stray `+86400000` reintroduces DST bugs |
| Recurrence storage | Embedded `recur` object on the todo | No sharing of rules between todos (not needed) |
| Rule anchor | `recur.monthDay` (1–31) and `recur.month` (1–12) stored separately from `due` | A rule edit must recompute `due` |
| Instances | One live instance per recurring todo; a missed one keeps its old `due` and shows overdue | Missing three weeks of a weekly item shows one item, not three (matches "roll forward until done") |
| Daily rollover | Derived at read time (`effectiveDue`) | The stored `due` can be stale; every reader must use `effectiveDue` |
| Persistence model | In-memory state as the read source; each mutation awaits its IndexedDB transaction, then updates memory and emits `change` | About 5 ms latency per write; worth it for durability |
| IDs | `crypto.randomUUID()` | Needs a secure context (Pages HTTPS and localhost both qualify; iOS 15.4+) |
| Indexes | None in v1 beyond the primary key; filter in memory | Adding one later needs a migration (cheap) |
| Priority | `priority: 0 \| 1` integer (1 = top) | Integer sorts directly; a third level would need only a UI change |
| "Other" | `groupId: null`; no group may be named "Other" (case-insensitive) | "Other" can't be renamed or reordered; it always sorts last |
| Group deletion | One readwrite transaction over `todos` and `groups` | None worth noting |
| Migrations | Integer DB version; ordered `migrations[v]` steps run in `onupgradeneeded` | Steps are never edited after release, only appended |
| Backup format version | Separate `format` integer in the JSON, decoupled from the DB version | Two numbers to bump, but a store-only change (an index) doesn't change the file format |
| Unknown fields on import | Stripped by `normalize` | A newer app's extra fields are lost; files with a newer `format` are refused outright instead |
| Import | Validate everything, show a confirm `<dialog>`, then clear and put in one transaction | All or nothing; a failure leaves the old data intact |
| Export | Build JSON from memory synchronously, `navigator.share({ files })`, fall back to an `<a download>` blob | A share that resolves may still go to Messages rather than Files; we count it as a backup |
| Stale banner reference | `meta.lastBackupAt` (set by a successful export, or by import to the file's `exportedAt`), else `meta.firstWriteAt` | No banner on an empty app; the banner stays until the next backup (not dismissable) |
| Undo (5 s toast) | Snapshot the whole record before the mutation; undo re-puts it | Simple and generic; it works for complete, Tomorrow, Skip, and delete alike |
| One-off completion | Delete from IndexedDB immediately; undo re-puts the snapshot | If the app is killed during the toast, the delete stays (which matches intent) |
| Day change | `clock.js` checks today on `visibilitychange`, `pageshow`, `focus`, and a timer set to next local midnight; it emits `daychange` | iOS freezes timers in the background, so visibility is the main trigger and the timer only covers the app staying open |
| Feature modules | Native ES modules; each feature exports `init(ctx)`; `app.js` lists them in an array | No dynamic plugin loading; adding a feature means one import line |
| Tests | `node --test` on `core/` modules, run under several `TZ` values | Node is a dev-only tool; nothing ships |

## Schema (DB version 1)

Database `planner`, three object stores.

### `todos` (keyPath `id`)

```js
{
  id: "3f2a…",              // crypto.randomUUID()
  title: "Pay rent",         // non-empty, trimmed
  due: "2026-11-01",         // civil date, always set
  groupId: null,             // string | null (null = "Other")
  priority: 0,               // 0 normal, 1 top
  recur: null,               // null = one-off, or a rule (below)
  lastDone: null,            // civil date | null (recurring only)
  createdAt: "2026-11-01T17:30:00.000Z",
  updatedAt: "2026-11-01T17:30:00.000Z"
}
```

### Rule shapes (`recur`)

```js
{ freq: "daily" }
{ freq: "weekly",  weekdays: [1, 3, 5] }    // 0 = Sun … 6 = Sat; sorted, unique, length ≥ 1
{ freq: "monthly", monthDay: 31 }           // 1–31; clamped per month
{ freq: "yearly",  month: 2, monthDay: 29 } // clamped per year
```

No interval ("every 2 weeks"). If one is added later, it's a migration that sets `interval: 1` on existing rules.

### `groups` (keyPath `id`)

```js
{ id, name, order, createdAt }   // order: integer; names unique case-insensitively; "Other" reserved
```

### `meta` (keyPath `key`)

Generic key–value store for app state and future settings.

```js
{ key: "firstWriteAt", value: ISO }
{ key: "lastBackupAt", value: ISO }
```

The DB version itself comes from `db.version`, so it isn't stored.

## Recurrence and rollover: date logic

### `core/date.js` (pure)

```js
parse(s)        -> [y, m, d]                         // "2026-02-28" -> [2026, 2, 28]
fmt(y, m, d)    -> "YYYY-MM-DD"
fromUTC(dt)     -> fmt(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate())
addDays(s, n)   -> [y,m,d] = parse(s); fromUTC(new Date(Date.UTC(y, m-1, d+n)))
weekday(s)      -> [y,m,d] = parse(s); new Date(Date.UTC(y, m-1, d)).getUTCDay()
daysInMonth(y,m)-> new Date(Date.UTC(y, m, 0)).getUTCDate()   // handles leap years and 1900/2100
clampDay(y,m,d) -> fmt(y, m, min(d, daysInMonth(y, m)))
todayLocal(now = new Date()) -> fmt(now.getFullYear(), now.getMonth()+1, now.getDate())
isValid(s)      -> /^\d{4}-\d{2}-\d{2}$/ and fmt(...parse(s)) round-trips through Date.UTC unchanged
// Compare with plain string < > ===  (lexicographic order equals chronological order)
```

Never construct a local `new Date(y, m, d)` for arithmetic. Local midnight may not exist on a DST day (for example America/Santiago).

### `core/recur.js` (pure)

```js
// First scheduled date strictly after civil date d
nextAfter(rule, d):
  switch rule.freq
    "daily":   return addDays(d, 1)
    "weekly":  for i in 1..7: c = addDays(d, i); if rule.weekdays includes weekday(c): return c
    "monthly": [y, m] = parse(d)
               c = clampDay(y, m, rule.monthDay); if c > d: return c
               [y, m] = m == 12 ? [y+1, 1] : [y, m+1]
               return clampDay(y, m, rule.monthDay)
    "yearly":  [y] = parse(d)
               c = clampDay(y, rule.month, rule.monthDay); if c > d: return c
               return clampDay(y+1, rule.month, rule.monthDay)

firstOnOrAfter(rule, d) = nextAfter(rule, addDays(d, -1))

// What the UI and sorting read; never write this back
effectiveDue(todo, today):
  if todo.recur?.freq == "daily" and todo.due < today: return today
  return todo.due

isOverdue(todo, today) = effectiveDue(todo, today) < today     // daily is never overdue, by construction
isInToday(todo, today) = effectiveDue(todo, today) <= today
```

### Transitions (pure: take a record and today, return a new record)

```js
create(input, today):
  start = input.due ?? today
  if input.recur:
    rule = input.recur   // UI fills the anchor from start: monthDay = day(start); month = month(start)
    due  = firstOnOrAfter(rule, start)     // weekly Mon-only made on a Wed -> next Mon
  else due = start

complete(todo, today):
  if !todo.recur: return DELETE            // caller keeps a snapshot for undo
  base = max(effectiveDue(todo, today), today)   // late -> today; early -> its due
  return { ...todo, due: nextAfter(todo.recur, base), lastDone: today }

tomorrow(todo, today):
  return { ...todo, due: addDays(today, 1) }     // rule untouched

skip(todo, today):                                // recurring only
  eff  = effectiveDue(todo, today)
  from = eff < today ? addDays(today, -1) : eff   // overdue -> first scheduled date ≥ today
  return { ...todo, due: nextAfter(todo.recur, from) }   // lastDone untouched

editRule(todo, newRule, today):
  return { ...todo, recur: newRule, due: firstOnOrAfter(newRule, today) }   // overdue state is dropped
```

How these behave:

- **Late completion** gives the next scheduled date after today, as the spec says. Early completion (due in the future) advances past that due date, so it can't land on the same date again.
- **Skip on an overdue item:** if today is itself a scheduled day, the item lands on today, so skipping a missed Monday on a Mon/Wed rule shows Wednesday's item now.
- **Tomorrow on a recurring item:** finishing it tomorrow gives the next date after tomorrow. If tomorrow was already a scheduled day (Mon/Tue rule, pushed from Mon to Tue), the two merge into one. That's acceptable, because the user deferred it.
- **Sort comparator (data side, the UX plan may override):** group `order` (with "Other" last), then `priority` descending, then overdue first, then `effectiveDue` ascending, then `createdAt`.

### Day change (`core/clock.js`)

```js
let current = todayLocal()
check(): t = todayLocal(); if t != current: current = t; emit("daychange", t)
listen: document "visibilitychange" (when visible), window "pageshow" and "focus"
timer:  setTimeout(check-and-rearm, msUntil(next local midnight) + 1000)
        // next midnight = new Date(y, m, d+1) local; if DST makes it 01:00, check() still fixes it
```

Every action (complete, Tomorrow, or Skip) reads `clock.today()` when it runs, not a cached render-time value.

## Migrations

```js
// data/migrations.js — append only, never edit a released step
export const DB_VERSION = 1
export const migrations = {
  1(db, tx) {
    db.createObjectStore("todos",  { keyPath: "id" })
    db.createObjectStore("groups", { keyPath: "id" })
    db.createObjectStore("meta",   { keyPath: "key" })
  },
  // 2(db, tx) { tx.objectStore("todos").openCursor() … cursor.update(upgradeTodo(v, 2)) }
}

// data/db.js
open():
  req = indexedDB.open("planner", DB_VERSION)
  req.onupgradeneeded = e => for v in (e.oldVersion+1)..DB_VERSION: migrations[v](req.result, req.transaction)
  req.onblocked       = show "Close other Planner tabs to finish updating"
  db.onversionchange  = () => { db.close(); location.reload() }
```

- **Shared record upgrades.** `core/model.js` exports `upgradeTodo(rec, fromFormat)` and `upgradeGroup(rec, fromFormat)`, which run a record through each format step. Data migrations in `migrations[v]` call them, and so does import. One code path covers both.
- **Lost connections.** Every IndexedDB call goes through `tx(stores, mode, fn)`. On `InvalidStateError`, `UnknownError`, or a closed connection, the wrapper reopens once and retries once. This targets WebKit dropping the IndexedDB connection after long suspension.
- **Open failure.** If the open fails (for example storage is blocked), boot shows a plain error ("Planner can't save on this device. Storage is blocked.") instead of an empty list that loses data.

## Export and import

### Backup file (`format: 1`)

```json
{
  "app": "planner",
  "format": 1,
  "exportedAt": "2026-11-01T17:30:00.000Z",
  "todos":  [ … ],
  "groups": [ … ]
}
```

The file name is `planner-backup-2026-11-01.json`.

### Export (in the tap handler, no `await` before `share`)

```js
json = JSON.stringify(buildBackup(store.snapshot()))   // synchronous, from memory
file = new File([json], name, { type: "application/json" })
if navigator.canShare?.({ files: [file] }):
  navigator.share({ files: [file] })
    .then(() => meta.set("lastBackupAt", now))          // AbortError (user cancelled) -> no change
else:
  blob URL + <a download> click; then set lastBackupAt
```

### Import

```js
<input type="file" accept=".json,application/json">
text = await file.text(); strip a leading BOM; JSON.parse (on failure: "This file isn't a Planner backup.")
check app == "planner"; format is an integer ≤ CURRENT_FORMAT
  (newer: "This backup is from a newer Planner. Update the app first.")
for each record: upgrade(rec, file.format) -> normalize (strip unknown fields) -> validate
  validate: id string, unique per store; title non-empty; due isValid;
            recur shape valid (weekdays non-empty 0–6; monthDay 1–31; month 1–12); priority 0|1
  todo.groupId not in the file's groups -> null
any invalid record -> reject the whole file and name the first problem
confirm <dialog>: "Replace your 42 todos and 5 groups with 38 todos and 4 groups from the backup of 25 Oct?"
  buttons: "Replace all" / "Cancel"
one readwrite tx over todos, groups, and meta: clear todos and groups; put all; set lastBackupAt = file.exportedAt
then reload the in-memory state from IndexedDB and emit change
```

### Stale banner

```js
show = store.todos.length > 0 and now - (lastBackupAt ?? firstWriteAt) > 7 days
```

The check runs at boot and on `daychange`. Tapping the banner starts export. The banner goes away on the next successful backup.

## Group deletion

```js
deleteGroup(id):
  tx(["todos", "groups"], "readwrite"):
    for todo in todos where todo.groupId == id: put({ ...todo, groupId: null, updatedAt })
    groups.delete(id)
```

An undo snapshot that points to a deleted group gets `normalize`d to `groupId: null` when it is re-put. The same check runs on every put.

## Module architecture

```
index.html                 <script type="module" src="js/app.js">
js/app.js                  boot: open db -> load store -> start clock -> init features in order
js/core/date.js            civil dates (pure)
js/core/recur.js           nextAfter, effectiveDue, transitions (pure)
js/core/model.js           shapes, normalize, validate, upgrade* (pure)
js/core/clock.js           today() and daychange (DOM events only)
js/data/db.js              open, tx wrapper, retry
js/data/migrations.js      DB_VERSION and steps
js/data/store.js           in-memory state, mutations, undo snapshots; EventTarget "change"
js/data/backup.js          buildBackup, parseBackup, replaceAll
js/features/*.js           today-view, add-todo, groups, backup-ui, stale-banner, …
tests/*.test.js            node --test on core/*
```

Rules:

1. Dependencies point inward only: `features → data → core`. `core` imports nothing outside `core`.
2. **Features talk to each other through `store` and `clock` events, never by importing one another.** A feature can then be removed by deleting one file and one line.
3. **`store` is the only writer.** Each mutation is `async op(args)`. It snapshots the old record, runs a pure transition, writes in one transaction, updates memory, then emits `change` with `{ type, ids, undo }`.
4. A new feature exports `init({ store, clock, mount })` and returns nothing. `app.js` holds `const features = [todayView, addTodo, …]`.
5. A new field gets a `format` bump, an `upgradeTodo` step, and a `migrations[v]` step that calls it, all in the same change.

## Edge-case tests

Run the `core` suite under `TZ=America/New_York`, `TZ=Europe/Berlin`, `TZ=America/Santiago`, `TZ=Australia/Lord_Howe` (30-minute DST), and `TZ=UTC`.

### DST

1. `addDays("2026-03-07", 1)` returns `"2026-03-08"`, and `addDays("2026-03-08", 1)` returns `"2026-03-09"` (US spring forward).
2. `addDays("2026-10-31", 1)` returns `"2026-11-01"`, and the 1st returns the 2nd (US fall back, which is today, 2026-11-01).
3. Same checks for Europe on 2026-03-29 and 2026-10-25.
4. Under Santiago (DST starts at local midnight, so 00:00 doesn't exist), `todayLocal` at 00:30 returns the right date, and the next-midnight timer doesn't fire twice or skip a day.
5. A daily item completed at 23:30 the evening before the fall-back day reappears exactly once on the next date.

### Midnight rollover

6. A daily item due today is completed at 23:59:59, so `due` becomes tomorrow. After the clock passes 00:00:01, `check()` emits `daychange` and the item is in Today.
7. The app is backgrounded at 22:00 and reopened at 08:00 the next day. `visibilitychange` updates today, and items due yesterday now show overdue (or as today for daily).
8. Tomorrow is tapped on a render from 23:59 but runs at 00:00:02. `due` must equal the new today + 1, not the old today + 1.
9. A one-off due yesterday is overdue; a daily due 3 days ago is not overdue and has `effectiveDue` equal to today.
10. The phone date is set back a week. Nothing crashes; `lastDone` greater than today is allowed.
11. A timezone change across the date line: `due` strings don't change, and today jumps.

### Feb 29

12. Yearly rule `{ month: 2, monthDay: 29 }`: `nextAfter("2028-02-29")` returns `"2029-02-28"`, then 2030-02-28, 2031-02-28, and `"2032-02-29"`.
13. Yearly 2/29 created on 2027-01-10 has a first due date of `"2027-02-28"`.
14. Yearly 2/29 completed late on 2027-03-01 has `"2028-02-29"` next.
15. `daysInMonth(2100, 2)` returns 28 and `daysInMonth(2000, 2)` returns 29.
16. A daily item on `"2028-02-28"` goes to `"2028-02-29"`, then `"2028-03-01"`.

### 31st and month ends

17. Monthly 31 from `"2027-01-31"` goes to `"2027-02-28"`, then 03-31, 04-30, and 05-31. The anchor must not drift to the 28th.
18. Monthly 31 in 2028 goes to `"2028-02-29"`.
19. Monthly 31 due `"2027-04-30"` (clamped) and completed that day gives `"2027-05-31"`.
20. Monthly 31 due Jan 31 and completed late on Mar 5 gives `"2027-03-31"`, not Feb 28.
21. Monthly 30 in February gives 28 or 29, then March 30.
22. Monthly on the 15th, completed late on the 20th, gives the 15th of next month.
23. Monthly from December crosses the year: `nextAfter("2026-12-31", {monthDay: 31})` returns `"2027-01-31"`.
24. Yearly Dec 31 gives the next year's Dec 31.

### Weekly

25. Weekly `[1]` (Mon) completed on a Monday gives the next Monday (+7).
26. Weekly `[1, 3, 5]` overdue from Mon and completed Thu gives Fri.
27. Skip on that same item: on Wed it gives today (Wed); on Thu it gives Fri.
28. Weekly `[0]` (Sun) across a year end: 2026-12-27 goes to 2027-01-03.
29. Weekly created on a day not in `weekdays` gets the next matching day as its first due date.
30. Weekly with all 7 days can show overdue (it isn't daily). Document this as intended.
31. Empty `weekdays` is rejected by `validate`.

### Tomorrow and Skip

32. Tomorrow on a weekly Mon item, done Tue, gives the next Mon.
33. Tomorrow on a weekly Mon item, not done Tue, is overdue on Wed.
34. Tomorrow on a Mon/Tue rule (pushed to Tue) is one item on Tue, and done gives the next Mon.
35. Tomorrow on an overdue one-off sets due to today + 1, and it's no longer overdue.
36. Skip on an overdue daily item gives tomorrow.
37. Skip leaves `lastDone` unchanged.
38. Undo after complete, Tomorrow, or Skip restores the exact prior record.

### Data

39. A fresh install runs migrations 1..N in order. Upgrading from v1 with data keeps every record (test once v2 exists).
40. Deleting a group moves its todos to `groupId: null`. Undoing a todo whose group was deleted meanwhile gives `groupId: null`.
41. Rejected imports: empty file, invalid JSON, `app` ≠ planner, a newer `format`, duplicate ids, `due: "2026-02-30"`, and an empty title. Each one leaves existing data unchanged.
42. Import of a valid file with a BOM, and an old-`format` file being upgraded.
43. An import that fails mid-transaction (simulated abort) leaves the old data fully intact.
44. Export cancelled from the share sheet leaves `lastBackupAt` unchanged.
45. The stale banner is hidden on an empty app, shown at 7 days + 1 minute, and hidden right after export.

## Evidence and notes

- **Leap years.** `Date.UTC` with day overflow (`d + n`) normalizes months and years, and `Date.UTC(y, m, 0)` gives the last day of month `m`. Both are ECMAScript-specified and don't depend on the timezone, so they handle leap years with no extra tables.
- **String order.** Comparing zero-padded ISO date strings lexicographically gives the same result as comparing them chronologically. Every `<` in the pseudocode relies on this.
- **Share sheet.** WebKit requires transient user activation for `navigator.share`, and an `await` on IndexedDB before calling it can let that activation expire. That's why export reads from memory.
- **Lost connections.** WebKit has a history of dropping the IndexedDB connection after a backgrounded app resumes ("Connection to Indexed Database server lost"). That's why the `tx` wrapper reopens and retries once.
- **Background timers.** iOS suspends timers in backgrounded PWAs, so `visibilitychange` and `pageshow` are the reliable day-change triggers.
- **Guidance search.** I searched the `modern-web-guidance` catalog for IndexedDB, storage, file sharing, and offline guides. The search command failed with a packaging error, and the list showed no data-layer guides, so none applied here.

## Risks

1. **iOS file picker.** It may grey out `.json` files under some `accept` values. If testing shows this, drop the `accept` attribute and rely on content validation.
2. **Untested migrations.** A migration bug can corrupt data with no server copy. Test every new `migrations[v]` against an exported real backup before release, and keep the step append-only.
3. **Readers bypassing `effectiveDue`.** Any code that reads `todo.due` directly will show stale daily items as overdue. Keep `due` private to `core/recur.js` and the store by convention, and check it in review.
4. **Undo snapshot lost.** If the app is killed during the 5 s undo window, the snapshot is gone. Completion is permanent, which is acceptable.
5. **Service worker module list.** Native ES modules mean many small files, and the service worker precache list must list every one. A missing module breaks the app offline. This belongs to the iOS PWA plan, which should generate or check the list.
6. **Merging on Tomorrow.** Tomorrow on a rule whose next day is also scheduled silently merges two occurrences. That's intended, but it may surprise the user. Revisit if they report it as friction.
