import test from 'node:test';
import assert from 'node:assert/strict';
import { sortGroups } from '../src/js/core/model.js';
import { makeEnv } from './helpers.js';

const rule = { weekly: (...weekdays) => ({ freq: 'weekly', weekdays }), monthly: (monthDay) => ({ freq: 'monthly', monthDay }) };

test('addTodo defaults due to today and stamps firstWriteAt once', async () => {
  const { store, adapter } = await makeEnv();
  const { id } = await store.addTodo({ title: '  Pay rent ' });
  assert.equal(store.todo(id).title, 'Pay rent');
  assert.equal(store.todo(id).due, '2026-11-01');
  await store.addTodo({ title: 'Second' });
  const { meta } = await adapter.load();
  assert.ok(meta.firstWriteAt);
});

test('addTodo rejects bad input and writes nothing', async () => {
  const { store } = await makeEnv();
  await assert.rejects(store.addTodo({ title: '  ' }));
  await assert.rejects(store.addTodo({ title: 'x', due: '2026-02-30' }));
  assert.equal(store.todos().length, 0);
});

test('weekly todo created off-schedule starts on the next matching day (case 29)', async () => {
  const { store } = await makeEnv('2026-11-04'); // Wed
  const { id } = await store.addTodo({ title: 'Gym', recur: rule.weekly(1) });
  assert.equal(store.todo(id).due, '2026-11-09');
});

test('completing a one-off deletes it; undo restores the exact record (cases 38)', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'Buy stamps' });
  const before = structuredClone(store.todo(id));
  const { undo } = await store.complete(id);
  assert.equal(store.todo(id), undefined);
  await undo();
  assert.deepEqual(store.todo(id), before);
});

test('undo after complete, tomorrow, and skip restores the prior record (case 38)', async () => {
  const { store } = await makeEnv('2026-11-02'); // Mon, so due is today
  const { id } = await store.addTodo({ title: 'Water plants', recur: rule.weekly(1, 4) });
  for (const action of ['complete', 'tomorrow', 'skip']) {
    const before = structuredClone(store.todo(id));
    const { undo } = await store[action](id);
    assert.notDeepEqual(store.todo(id), before, action);
    await undo();
    assert.deepEqual(store.todo(id), before, action);
  }
});

test('recurring complete advances and records lastDone; skip leaves lastDone alone', async () => {
  const { store } = await makeEnv('2026-11-02'); // Mon
  const { id } = await store.addTodo({ title: 'Bins', recur: rule.weekly(1) });
  await store.skip(id);
  assert.equal(store.todo(id).due, '2026-11-09');
  assert.equal(store.todo(id).lastDone, null);
  await store.complete(id);
  assert.equal(store.todo(id).lastDone, '2026-11-02');
});

test('actions use the day they run, not the day of the last render (case 8)', async () => {
  const env = await makeEnv('2026-11-01');
  const { id } = await env.store.addTodo({ title: 'Call' });
  env.day = '2026-11-02';
  await env.store.tomorrow(id);
  assert.equal(env.store.todo(id).due, '2026-11-03');
});

test('skip on a one-off throws', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'x' });
  await assert.rejects(store.skip(id));
});

test('updateTodo re-anchors a recurring todo from the chosen due date', async () => {
  const { store } = await makeEnv('2026-11-01');
  const { id } = await store.addTodo({ title: 'Rent', recur: rule.monthly(1), due: '2026-11-01' });
  await store.updateTodo(id, { due: '2026-12-31' });
  assert.deepEqual(store.todo(id).recur, { freq: 'monthly', monthDay: 31 });
  assert.equal(store.todo(id).due, '2026-12-31');
});

test('updateTodo on the title alone leaves a pushed-off-schedule due date alone', async () => {
  const { store } = await makeEnv('2026-11-02');
  const { id } = await store.addTodo({ title: 'Bins', recur: rule.weekly(1) });
  await store.tomorrow(id);
  await store.updateTodo(id, { title: 'Bins out' });
  assert.equal(store.todo(id).due, '2026-11-03');
});

test('removing the repeat rule clears lastDone', async () => {
  const { store } = await makeEnv('2026-11-02');
  const { id } = await store.addTodo({ title: 'Bins', recur: rule.weekly(1) });
  await store.complete(id);
  await store.updateTodo(id, { recur: null });
  assert.equal(store.todo(id).recur, null);
  assert.equal(store.todo(id).lastDone, null);
});

test('group names: unique case-insensitively, "Other" and the parts reserved', async () => {
  const { store } = await makeEnv();
  await store.addGroup('Work');
  await assert.rejects(store.addGroup('work'));
  await assert.rejects(store.addGroup(' Other '));
  for (const name of ['Morning', 'afternoon', ' NIGHT ']) await assert.rejects(store.addGroup(name), /cannot be named/);
  const w = store.groups()[0];
  await assert.rejects(store.renameGroup(w.id, 'Night'));
  await assert.rejects(store.addGroup('  '));
  const g = await store.addGroup('Home');
  await assert.rejects(store.renameGroup(g.id, 'WORK'));
  await store.renameGroup(g.id, 'House');
  assert.equal(store.groups().find((x) => x.id === g.id).name, 'House');
});

test('deleting a group moves its todos to Other; undoing into a deleted group lands in Other (case 40)', async () => {
  const { store } = await makeEnv();
  const g = await store.addGroup('Work');
  const a = await store.addTodo({ title: 'a', groupId: g.id });
  const b = await store.addTodo({ title: 'b', groupId: g.id });
  const { undo } = await store.complete(a.id);
  await store.deleteGroup(g.id);
  assert.equal(store.groups().length, 0);
  assert.equal(store.todo(b.id).groupId, null);
  await undo();
  assert.equal(store.todo(a.id).groupId, null);
});

test('an unknown group on add becomes Other', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'x', groupId: 'ghost' });
  assert.equal(store.todo(id).groupId, null);
});

test('a failed write leaves memory and storage unchanged', async () => {
  const { store, adapter } = await makeEnv();
  const { id } = await store.addTodo({ title: 'keep' });
  adapter.failNext();
  await assert.rejects(store.complete(id));
  assert.ok(store.todo(id));
  adapter.failNext();
  await assert.rejects(store.addTodo({ title: 'lost' }));
  assert.equal(store.todos().length, 1);
  assert.equal((await adapter.load()).todos.length, 1);
});

test('state survives reopening from storage', async () => {
  const env = await makeEnv();
  await env.store.addTodo({ title: 'persisted' });
  const reopened = await env.reopen();
  assert.deepEqual(reopened.todos().map((t) => t.title), ['persisted']);
});

test('change events carry type and ids', async () => {
  const { store } = await makeEnv();
  const seen = [];
  store.on((e) => seen.push(e.type));
  const { id } = await store.addTodo({ title: 'x' });
  await store.deleteTodo(id);
  assert.deepEqual(seen, ['add', 'delete']);
});

test('stale banner: hidden when empty, shown after 7 days, hidden after backup (case 45)', async () => {
  const env = await makeEnv('2026-11-01');
  assert.equal(env.store.backupStale(), false);
  await env.store.addTodo({ title: 'x' });
  assert.equal(env.store.backupStale(), false);
  env.day = '2026-11-08';
  env.hour = 12;
  assert.equal(env.store.backupStale(), false); // exactly 7 days
  env.hour = 13;
  assert.equal(env.store.backupStale(), true);
  await env.store.markBackedUp();
  assert.equal(env.store.backupStale(), false);
  assert.ok(env.store.lastBackupAt());
});

test('moveGroup swaps places, renumbers, and survives a reload', async () => {
  const { store, adapter } = await makeEnv();
  const a = await store.addGroup('Home');
  const b = await store.addGroup('Work');
  const c = await store.addGroup('Errands');
  const names = () => sortGroups(store.groups()).map((g) => g.name);
  assert.deepEqual(names(), ['Home', 'Work', 'Errands']);
  await store.moveGroup(c.id, -1);
  assert.deepEqual(names(), ['Home', 'Errands', 'Work']);
  await store.moveGroup(a.id, 1);
  assert.deepEqual(names(), ['Errands', 'Home', 'Work']);
  await store.moveGroup(b.id, 1); // already last: no change
  assert.deepEqual(names(), ['Errands', 'Home', 'Work']);
  assert.deepEqual(sortGroups((await adapter.load()).groups).map((g) => g.name), names());
  await assert.rejects(store.moveGroup('nope', 1));
});

test('an interval todo restarts its count when completed', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'Wash towels', recur: { freq: 'interval', n: 2, unit: 'weeks' } });
  assert.equal(store.todo(id).due, '2026-11-01');
  await store.complete(id);
  assert.equal(store.todo(id).due, '2026-11-15');
  assert.equal(store.todo(id).lastDone, '2026-11-01');
});

test('a new todo lands in the part of the day it is now: Morning to noon, Afternoon to 5 pm, Night after', async () => {
  const env = await makeEnv();
  const at = async (hour) => {
    env.hour = hour;
    const { id } = await env.store.addTodo({ title: `at ${hour}` });
    return env.store.todo(id).part;
  };
  assert.deepEqual([await at(0), await at(11), await at(12), await at(16), await at(17), await at(23)],
    ['morning', 'morning', 'afternoon', 'afternoon', 'night', 'night']);
  const { id } = await env.store.addTodo({ title: 'given', part: 'afternoon' });
  assert.equal(env.store.todo(id).part, 'afternoon');
  await assert.rejects(env.store.addTodo({ title: 'bad', part: 'evening' }));
});

test('the edit sheet can move a todo to another part; a bad part is refused', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'x', part: 'morning' });
  await store.updateTodo(id, { part: 'night' });
  assert.equal(store.todo(id).part, 'night');
  await assert.rejects(store.updateTodo(id, { part: null }));
  assert.equal(store.todo(id).part, 'night');
});

test('restoring a snapshot from before parts existed puts it in Morning', async () => {
  const { store } = await makeEnv();
  const { id } = await store.addTodo({ title: 'x', part: 'night' });
  const { part, ...old } = store.todo(id);
  await store.restoreTodo(old);
  assert.equal(store.todo(id).part, 'morning');
});
