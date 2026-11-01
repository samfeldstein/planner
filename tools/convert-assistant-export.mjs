// One-time converter: the old assistant app's JSON export -> a Planner backup file.
// Run: node tools/convert-assistant-export.mjs <export.json> [out.json]
// Import the result from More > Import. Importing replaces everything in the app.
//
// Kept: routines and open one-off items, their groups, repeat rules, due dates, last-done dates,
// and their order within a group. Dropped on purpose: notes, subtasks, batches, events, skip counts,
// completed items, and routines that have already ended.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseBackup } from '../src/js/data/backup.js';
import { todayLocal } from '../src/js/core/date.js';
import { validateTodo } from '../src/js/core/model.js';

// The old app's group keys, in the order of the day. "priority" becomes the top-priority flag.
const GROUPS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['night', 'Night'], ['allday', 'All day'], ['oneoff', 'One-off']];

const sortedUnique = (list) => [...new Set(list)].sort((a, b) => a - b);

// Returns a Planner repeat rule, or null when the old rule has no equivalent.
function convertRule(rule, routine) {
  switch (rule?.t) {
    case 'daily':
      return { freq: 'daily' };
    case 'weekdays':
      return { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] };
    case 'weekly':
      return rule.dow?.length ? { freq: 'weekly', weekdays: sortedUnique(rule.dow) } : null;
    case 'monthday':
      return Number.isInteger(rule.day) ? { freq: 'monthly', monthDay: rule.day } : null;
    case 'months': {
      // "Every month": the day comes from the date it falls due.
      const day = Number((routine.nextDue ?? '').slice(8, 10));
      return rule.n === 1 && day >= 1 ? { freq: 'monthly', monthDay: day } : null;
    }
    case 'interval':
      if (!Number.isInteger(rule.n) || rule.n < 1) return null;
      return rule.n % 7 === 0 ? { freq: 'interval', n: rule.n / 7, unit: 'weeks' } : { freq: 'interval', n: rule.n, unit: 'days' };
    default:
      return null;
  }
}

export function convert(data, { today = todayLocal(), now = new Date(), uuid = () => crypto.randomUUID() } = {}) {
  const dropped = [];
  let completed = 0;

  const groups = GROUPS.map(([key, name], i) => ({ key, id: uuid(), name, order: i + 1, createdAt: now.toISOString() }));
  const groupId = (key) => groups.find((g) => g.key === key)?.id ?? null;
  const rank = (key) => (key === 'priority' ? -1 : GROUPS.findIndex(([k]) => k === key));

  const pending = [];
  for (const r of data.routines ?? []) {
    if (r.until && r.until < today) { dropped.push({ label: r.label, reason: 'ended' }); continue; }
    const recur = convertRule(r.rule, r);
    if (!recur) { dropped.push({ label: r.label, reason: `unsupported repeat rule (${r.rule?.t})` }); continue; }
    pending.push({ key: r.group, order: r.order ?? 0, title: r.label, due: r.nextDue, recur, lastDone: r.lastDone ?? null });
  }
  for (const item of data.items ?? []) {
    if (item.done) { completed++; continue; }
    if (item.kind === 'event') { dropped.push({ label: item.label, reason: 'event' }); continue; }
    pending.push({ key: item.group, order: item.order ?? 0, title: item.label, due: item.due ?? today, recur: null, lastDone: null });
  }

  // One bad old record is reported, not allowed to abort the whole conversion.
  const valid = pending.filter((p) => {
    const err = validateTodo({ id: 'x', title: p.title, due: p.due, priority: 0, recur: p.recur, lastDone: p.lastDone });
    if (err) dropped.push({ label: p.title, reason: 'invalid record' });
    return !err;
  });
  pending.splice(0, pending.length, ...valid);

  // Creation times follow the old order, so same-day todos keep it (the app breaks ties by creation).
  pending.sort((a, b) => rank(a.key) - rank(b.key) || a.order - b.order);
  const todos = pending.map((p, i) => {
    const stamp = new Date(now.getTime() + i * 1000).toISOString();
    return {
      id: uuid(),
      title: p.title,
      due: p.due,
      groupId: p.key === 'priority' ? null : groupId(p.key),
      priority: p.key === 'priority' ? 1 : 0,
      recur: p.recur,
      lastDone: p.lastDone,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });

  const backup = {
    app: 'planner',
    format: 1,
    exportedAt: now.toISOString(),
    todos,
    groups: groups.map(({ key, ...g }) => g),
  };
  parseBackup(JSON.stringify(backup)); // throws if Planner would reject it
  return { backup, report: { imported: todos.length, completed, dropped } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output = 'planner-import.json'] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node tools/convert-assistant-export.mjs <export.json> [out.json]');
    process.exit(1);
  }
  const { backup, report } = convert(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(backup));
  console.log(`Wrote ${output}: ${report.imported} todos, ${backup.groups.length} groups.`);
  console.log(`Skipped ${report.completed} completed items.`);
  for (const d of report.dropped) console.log(`Dropped "${d.label}": ${d.reason}`);
}
