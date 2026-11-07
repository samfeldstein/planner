# Form and Claude: decision report

**Decided 2026-11-07:** none of these. The planner stays the PWA, with no Claude integration and no events; the schedule lives in the iOS Calendar app. Kept for reference.

Written 2026-11-07. Answers the two open questions in the week's notes: what form the planner takes, and how Claude fits in. Facts were checked on the web that day; sources are at the end.

## The goal, restated

One self-contained place for today's todos plus today's schedule, where the schedule is a plain list of events with times. Today the PWA holds todos only (events were dropped on purpose), and its data lives in IndexedDB on the phone with JSON export and import. Claude can't see any of it. The planner dashboard in the Claude chat can be seen by Claude, but it lives outside the app.

## Option 1: keep the PWA as is, Claude adds things elsewhere

Costs nothing to build or run. Claude on iPhone can create Calendar events and Reminders through iOS permissions [1]; MacStories found it can also read Calendar events, while Anthropic's article says it only creates them [1][2]. Either way the PWA can't read Apple Calendar or Claude's output, so the schedule and the todos stay in two apps. It works offline. The IndexedDB data doesn't change. This doesn't meet the "self-contained" goal.

## Option 2: a published claude.ai artifact with shared storage

This is closest to the current chat dashboard. Hosting is free; building it means porting the UI into one artifact page. Artifacts can store up to 20 MB of text, personal or shared, can call Claude, and can use connectors and custom connectors [3], so one page could show todos and pull today's events from a calendar connector. Claude in a chat or Claude Code reaches the data through the artifact's database tools.

The limits are real, though. Anthropic lists storage and connectors for web and Desktop only, not the mobile apps [3]. It needs the network, so it doesn't work offline. Unpublishing a legacy artifact deletes its storage [3]. It also drops the Kalam ruled-page app shell, the home-screen icon, and the 80 ms tap work. Moving the IndexedDB data means exporting the JSON and writing it into the artifact's store once. Before going further, test whether the chat dashboard's storage actually holds up on the phone.

## Option 3: keep the PWA, add a small sync Worker and a remote MCP connector

A Cloudflare Worker holds the same JSON document the PWA already exports (todos plus a new `events` list). It serves that document to the PWA and exposes MCP tools such as `list_today`, `add_todo`, `add_event`, and `plan_day`. You add it once at claude.ai as a custom connector, and it then works in the iPhone Claude app; remote MCP has been supported on mobile since July 2025, but connectors can only be added on the web [4]. Custom connectors need a paid Claude plan [4].

Running cost is free: the Workers free plan allows 100,000 requests a day, and Durable Objects with SQLite storage are included [5]. Building it is moderate work. You need the Worker, OAuth (Cloudflare has a template [6]), and a sync layer in the PWA: IndexedDB stays the offline copy, and the app pushes and pulls with last-write-wins per item. Offline still works, and changes Claude makes show up on the next sync. The existing data becomes the first upload. iOS limits don't change, since the installed PWA already runs in standalone mode.

## Option 4: a native iOS app

You pay $99 a year for the Apple Developer Program [7] and rewrite everything in Swift. In return you get EventKit, which reads Apple Calendar directly, so the schedule comes for free. App Intents would let Siri, Shortcuts, and the Claude app's "Ask Claude" action [8] reach it. Claude still can't write into the app's data without a backend, so you end up building option 3's Worker anyway, plus a rewrite. The JSON export would feed an importer. It's the most cost for the least new ability.

## How Claude fits in

Do both, in this order. First, adding: "add dentist 3pm" and "remind me to call the landlord tomorrow" turn into MCP tool calls that write events and todos. Second, planning: in the morning Claude reads today's todos, the overdue items, and the events, and suggests an order or which items to move to tomorrow, then writes the moves back with the same tools. Planning needs nothing beyond the adding tools plus a read call, so it comes almost free once adding works. The schedule can live in the planner's own `events` list, which Claude writes to, instead of in Apple Calendar, which the PWA can't read.

## Recommendation

Go with option 3. Keep the PWA as the one place you look; it's built, fast, works offline, and is the look you chose. Add a small Cloudflare Worker that syncs the planner's JSON and serves it to Claude as a custom connector. Bring events back as a plain timed list stored with the todos and written mostly by Claude. Option 2 is the fallback if you'd rather live inside Claude than in an app, but only after it proves itself on the phone.

## Smallest next step

Build a read-only Worker that serves an uploaded copy of today's export through one MCP tool, `list_today`. Add it as a custom connector at claude.ai, then ask Claude on the phone "what's on my plate today?" This proves the whole Claude-to-planner path, connector, auth, and mobile included, before any sync or write code. Plan for about a day.

## Sources

1. [Use Claude with iOS apps (Anthropic Help)](https://support.claude.com/en/articles/11869619-using-claude-with-ios-apps)
2. [Testing Claude's native integration with Reminders and Calendar (MacStories)](https://www.macstories.net/notes/testing-claudes-native-integration-with-reminders-and-calendar-on-ios-and-ipados/)
3. [What are artifacts and how do I use them? (Anthropic Help)](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
4. [Building custom connectors via remote MCP servers (Anthropic Help)](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
5. [Workers pricing (Cloudflare docs)](https://developers.cloudflare.com/workers/platform/pricing/)
6. [Building an MCP server on Cloudflare (template summary)](https://playbooks.com/skills/cloudflare/skills/building-mcp-server-on-cloudflare)
7. [Apple Developer Program: what's included](https://developer.apple.com/programs/whats-included/)
8. [Use Claude App Intents, Shortcuts, and widgets on iOS (Anthropic Help)](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios)
