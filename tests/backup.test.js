import test from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, backupFileName, parseBackup, serializeBackup } from '../src/js/data/backup.js';
import { makeEnv } from './helpers.js';

const base = () => ({
  app: 'planner',
  format: 2,
  exportedAt: '2026-10-25T10:00:00.000Z',
  groups: [{ id: 'g1', name: 'Work', order: 1, createdAt: 'x' }],
  todos: [{
    id: 't1', title: 'Pay rent', due: '2026-11-01', part: 'afternoon', groupId: 'g1', priority: 1, recur: null, lastDone: null,
    createdAt: 'x', updatedAt: 'x',
  }],
});

const rejects = (obj, text) => assert.throws(() => parseBackup(typeof obj === 'string' ? obj : JSON.stringify(obj)), BackupError, text);

test('file name uses the local date', () => {
  assert.equal(backupFileName(new Date(2026, 10, 1, 23, 30)), 'planner-backup-2026-11-01.json');
});

test('export then parse round-trips', async () => {
  const { store } = await makeEnv();
  const g = await store.addGroup('Work');
  await store.addTodo({ title: 'a', groupId: g.id, priority: 1 });
  await store.addTodo({ title: 'b', recur: { freq: 'weekly', weekdays: [1, 3] } });
  const { name, json } = serializeBackup(store.snapshot(), new Date(2026, 10, 1, 12));
  assert.equal(name, 'planner-backup-2026-11-01.json');
  const parsed = parseBackup(json);
  assert.deepEqual(parsed.todos, store.todos());
  assert.deepEqual(parsed.groups, store.groups());
});

test('a valid file parses, including with a BOM and unknown fields (case 42)', () => {
  const file = base();
  file.todos[0].extra = 'dropped';
  const parsed = parseBackup(`﻿${JSON.stringify(file)}`);
  assert.equal(parsed.todos[0].extra, undefined);
  assert.equal(parsed.exportedAt, '2026-10-25T10:00:00.000Z');
});

test('a todo pointing at a missing group lands in Other', () => {
  const file = base();
  file.todos[0].groupId = 'ghost';
  assert.equal(parseBackup(JSON.stringify(file)).todos[0].groupId, null);
});

test('rejected files (case 41)', () => {
  rejects('', 'empty file');
  rejects('{nope', 'invalid JSON');
  rejects({ ...base(), app: 'other' }, 'wrong app');
  rejects({ ...base(), format: 3 }, 'newer format');
  rejects({ ...base(), format: 0 }, 'bad format');
  rejects({ ...base(), exportedAt: 'yesterday' }, 'bad export date');
  rejects({ ...base(), todos: null }, 'no todos list');
  rejects({ ...base(), todos: [null] }, 'bad entry');

  const dup = base();
  dup.todos.push({ ...dup.todos[0] });
  rejects(dup, 'duplicate ids');

  const badDate = base();
  badDate.todos[0].due = '2026-02-30';
  rejects(badDate, 'impossible date');

  const noTitle = base();
  noTitle.todos[0].title = '';
  rejects(noTitle, 'empty title');

  const twoGroups = base();
  twoGroups.groups.push({ id: 'g2', name: 'WORK', order: 2, createdAt: 'x' });
  rejects(twoGroups, 'duplicate group names');

  const other = base();
  other.groups[0].name = 'Other';
  rejects(other, 'reserved group name');

  const night = base();
  night.groups[0].name = 'Night';
  rejects(night, 'part name as a group in a current backup');

  const noPart = base();
  delete noPart.todos[0].part;
  rejects(noPart, 'missing part in a current backup');

  const badPart = base();
  badPart.todos[0].part = 'evening';
  rejects(badPart, 'unknown part');
});

test('the newer-format message says to update', () => {
  assert.throws(() => parseBackup(JSON.stringify({ ...base(), format: 3 })), /newer Planner/);
});

test('import replaces everything and sets lastBackupAt to the file date (cases 43-44)', async () => {
  const { store, adapter } = await makeEnv();
  await store.addTodo({ title: 'old' });
  const parsed = parseBackup(JSON.stringify(base()));

  adapter.failNext();
  await assert.rejects(store.replaceAll(parsed));
  assert.deepEqual(store.todos().map((t) => t.title), ['old'], 'failed import leaves old data');
  assert.equal((await adapter.load()).todos.length, 1);

  await store.replaceAll(parsed);
  assert.deepEqual(store.todos().map((t) => t.title), ['Pay rent']);
  assert.deepEqual(store.groups().map((g) => g.name), ['Work']);
  assert.equal(store.lastBackupAt(), '2026-10-25T10:00:00.000Z');
});

test('a cancelled export never calls markBackedUp, so lastBackupAt is unchanged (case 44)', async () => {
  const { store } = await makeEnv();
  await store.addTodo({ title: 'x' });
  assert.equal(store.lastBackupAt(), null);
});

// A format 1 file, as the app wrote before parts of the day existed.
const oldFile = () => {
  const file = base();
  file.format = 1;
  for (const t of file.todos) delete t.part;
  return file;
};

test('an old backup imports with every todo in Morning', () => {
  const parsed = parseBackup(JSON.stringify(oldFile()));
  assert.deepEqual(parsed.todos.map((t) => [t.part, t.groupId]), [['morning', 'g1']]);
  assert.deepEqual(parsed.groups.map((g) => g.name), ['Work']);
});

test('an old backup with Morning, Afternoon, and Night groups folds them into the parts', () => {
  const file = oldFile();
  file.groups.push({ id: 'g2', name: 'Afternoon', order: 2, createdAt: 'x' }, { id: 'g3', name: 'night', order: 3, createdAt: 'x' });
  file.todos.push(
    { ...file.todos[0], id: 't2', groupId: 'g2' },
    { ...file.todos[0], id: 't3', groupId: 'g3' },
  );
  const parsed = parseBackup(JSON.stringify(file));
  assert.deepEqual(parsed.groups.map((g) => g.id), ['g1']);
  assert.deepEqual(parsed.todos.map((t) => [t.id, t.part, t.groupId]),
    [['t1', 'morning', 'g1'], ['t2', 'afternoon', null], ['t3', 'night', null]]);
});

test('export writes the current format and keeps each todo\'s part', async () => {
  const { store } = await makeEnv();
  await store.addTodo({ title: 'a', part: 'night' });
  const { json } = serializeBackup(store.snapshot());
  const data = JSON.parse(json);
  assert.equal(data.format, 2);
  assert.equal(parseBackup(json).todos[0].part, 'night');
});
