// Backup file: build, name, and parse. Parsing upgrades, normalizes, and validates every
// record, and rejects the whole file on the first problem so a bad import changes nothing.

import { todayLocal } from '../core/date.js';
import {
  CURRENT_FORMAT, normalizeGroup, normalizeTodo, upgradeAll, validateGroup, validateTodo,
} from '../core/model.js';

export class BackupError extends Error {}

export const backupFileName = (now = new Date()) => `planner-backup-${todayLocal(now)}.json`;

export const buildBackup = ({ todos, groups }, now = new Date()) => ({
  app: 'planner',
  format: CURRENT_FORMAT,
  exportedAt: now.toISOString(),
  todos,
  groups,
});

export const serializeBackup = (snapshot, now = new Date()) => ({
  name: backupFileName(now),
  json: JSON.stringify(buildBackup(snapshot, now)),
});

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function entries(list, label) {
  if (!Array.isArray(list)) throw new BackupError(`The backup has no ${label} list.`);
  if (!list.every(isObject)) throw new BackupError(`The backup has a bad ${label} entry.`);
  return list;
}

function records(list, label, normalize, validate) {
  const seen = new Set();
  return list.map((raw) => {
    const rec = normalize(raw);
    const problem = validate(rec);
    if (problem) throw new BackupError(`Bad backup: ${problem}.`);
    if (seen.has(rec.id)) throw new BackupError(`Bad backup: duplicate ${label} id.`);
    seen.add(rec.id);
    return rec;
  });
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new BackupError("This file isn't a Planner backup.");
  }
  if (!isObject(data) || data.app !== 'planner') throw new BackupError("This file isn't a Planner backup.");
  if (!Number.isInteger(data.format) || data.format < 1) throw new BackupError("This file isn't a Planner backup.");
  if (data.format > CURRENT_FORMAT) throw new BackupError('This backup is from a newer Planner. Update the app first.');
  if (typeof data.exportedAt !== 'string' || Number.isNaN(Date.parse(data.exportedAt))) {
    throw new BackupError('Bad backup: missing export date.');
  }

  const raw = upgradeAll({ todos: entries(data.todos, 'todo'), groups: entries(data.groups, 'group') }, data.format);
  const groups = records(raw.groups, 'group', normalizeGroup, validateGroup);
  const names = new Set();
  for (const g of groups) {
    const key = g.name.trim().toLowerCase();
    if (names.has(key)) throw new BackupError(`Bad backup: two groups named "${g.name}".`);
    names.add(key);
  }
  const todos = records(raw.todos, 'todo', normalizeTodo, validateTodo);
  const ids = new Set(groups.map((g) => g.id));
  for (const t of todos) if (t.groupId !== null && !ids.has(t.groupId)) t.groupId = null;

  return { todos, groups, exportedAt: data.exportedAt };
}
