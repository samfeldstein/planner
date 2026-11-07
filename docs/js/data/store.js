// The only writer. State lives in memory (so export can read it synchronously inside a
// tap); every mutation awaits its adapter commit first, then updates memory and emits "change".
// Actions read today() when they run, not when the list was rendered.

import { isValid, todayLocal } from '../core/date.js';
import { isPart, normalizeTodo, sortGroups, validateGroup, validateTodo } from '../core/model.js';
import { DELETE, complete, schedule, skip, tomorrow } from '../core/recur.js';
import { partAt } from '../core/today.js';

const WEEK_MS = 7 * 24 * 36e5;

// randomUUID only exists on secure pages; a phone loading the dev server over plain http lacks it.
function randomUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createStore({
  adapter,
  today = () => todayLocal(),
  now = () => new Date(),
  uuid = randomUuid,
}) {
  const bus = new EventTarget();
  let todos = new Map();
  let groups = new Map();
  let meta = new Map();

  const emit = (detail) => bus.dispatchEvent(new CustomEvent('change', { detail }));
  const iso = () => now().toISOString();
  const put = (store, value) => ({ store, type: 'put', value });
  const del = (store, key) => ({ store, type: 'delete', key });

  function load(data) {
    todos = new Map(data.todos.map((t) => [t.id, t]));
    groups = new Map(data.groups.map((g) => [g.id, g]));
    meta = new Map(Object.entries(data.meta));
  }

  function need(map, id, label) {
    const rec = map.get(id);
    if (!rec) throw new Error(`No such ${label}`);
    return rec;
  }

  function checked(todo) {
    const problem = validateTodo(todo);
    if (problem) throw new Error(problem);
    return todo;
  }

  const knownGroup = (id) => (id && groups.has(id) ? id : null);

  async function saveTodo(next, type, before) {
    await adapter.commit([put('todos', next)]);
    todos.set(next.id, next);
    emit({ type, ids: [next.id] });
    return { id: next.id, undo: () => restore(before) };
  }

  // Put a snapshot back. If its group was deleted meanwhile it comes back ungrouped; a snapshot
  // from before parts existed comes back in Morning.
  async function restore(before) {
    const rec = { ...before, part: isPart(before.part) ? before.part : 'morning', groupId: knownGroup(before.groupId) };
    await adapter.commit([put('todos', rec)]);
    todos.set(rec.id, rec);
    emit({ type: 'undo', ids: [rec.id] });
  }

  async function transition(type, id, fn) {
    const before = need(todos, id, 'todo');
    const after = fn(before, today());
    if (after === DELETE) {
      await adapter.commit([del('todos', id)]);
      todos.delete(id);
      emit({ type, ids: [id] });
      return { id, undo: () => restore(before) };
    }
    return saveTodo({ ...after, updatedAt: iso() }, type, before);
  }

  function groupName(name, exceptId) {
    const trimmed = name.trim();
    const group = { id: exceptId ?? 'new', name: trimmed };
    const problem = validateGroup(group);
    if (problem) throw new Error(problem);
    const key = trimmed.toLowerCase();
    for (const g of groups.values()) {
      if (g.id !== exceptId && g.name.trim().toLowerCase() === key) throw new Error(`A group named "${trimmed}" already exists`);
    }
    return trimmed;
  }

  return {
    async init() {
      load(await adapter.load());
    },

    on: (fn) => bus.addEventListener('change', (e) => fn(e.detail)),

    todos: () => [...todos.values()],
    groups: () => [...groups.values()],
    todo: (id) => todos.get(id),
    snapshot: () => ({ todos: [...todos.values()], groups: [...groups.values()] }),

    async addTodo(input) {
      if (input.due !== undefined && !isValid(input.due)) throw new Error('Invalid due date');
      const start = input.due ?? today();
      const { recur, due } = schedule(input.recur ?? null, start);
      const stamp = iso();
      const todo = checked({
        id: uuid(),
        title: String(input.title ?? '').trim(),
        due,
        part: input.part ?? partAt(now()),
        groupId: knownGroup(input.groupId),
        priority: input.priority ? 1 : 0,
        recur,
        lastDone: null,
        createdAt: stamp,
        updatedAt: stamp,
      });
      const ops = [put('todos', todo)];
      if (!meta.has('firstWriteAt')) ops.push(put('meta', { key: 'firstWriteAt', value: stamp }));
      await adapter.commit(ops);
      todos.set(todo.id, todo);
      if (!meta.has('firstWriteAt')) meta.set('firstWriteAt', stamp);
      emit({ type: 'add', ids: [todo.id] });
      return { id: todo.id, undo: null };
    },

    // Edit-save. Touching the rule or the due date re-anchors a recurring todo from that date.
    async updateTodo(id, patch) {
      const before = need(todos, id, 'todo');
      const next = normalizeTodo({ ...before, ...patch, id });
      next.groupId = knownGroup(next.groupId);
      if (next.priority !== 0) next.priority = 1;
      if ('recur' in patch || 'due' in patch) {
        if (next.recur && !isValid(next.due)) throw new Error('Invalid due date');
        const s = schedule(next.recur, next.due);
        next.recur = s.recur;
        next.due = s.due;
      }
      if (!next.recur) next.lastDone = null;
      next.updatedAt = iso();
      return saveTodo(checked(next), 'edit', before);
    },

    restoreTodo: restore,
    complete: (id) => transition('complete', id, complete),
    tomorrow: (id) => transition('tomorrow', id, tomorrow),
    skip: (id) => transition('skip', id, skip),

    async deleteTodo(id) {
      const before = need(todos, id, 'todo');
      await adapter.commit([del('todos', id)]);
      todos.delete(id);
      emit({ type: 'delete', ids: [id] });
      return { id, undo: () => restore(before) };
    },

    async addGroup(name) {
      const clean = groupName(name);
      const order = Math.max(0, ...[...groups.values()].map((g) => g.order ?? 0)) + 1;
      const group = { id: uuid(), name: clean, order, createdAt: iso() };
      await adapter.commit([put('groups', group)]);
      groups.set(group.id, group);
      emit({ type: 'group', ids: [group.id] });
      return group;
    },

    // Moves a group one place up (-1) or down (1) and renumbers them 1..n so ties can't linger.
    async moveGroup(id, delta) {
      need(groups, id, 'group');
      const list = sortGroups([...groups.values()]);
      const from = list.findIndex((g) => g.id === id);
      const to = from + delta;
      if (to < 0 || to >= list.length) return;
      list.splice(to, 0, ...list.splice(from, 1));
      const changed = list.map((g, i) => ({ ...g, order: i + 1 })).filter((g) => groups.get(g.id).order !== g.order);
      await adapter.commit(changed.map((g) => put('groups', g)));
      for (const g of changed) groups.set(g.id, g);
      emit({ type: 'group', ids: changed.map((g) => g.id) });
    },

    async renameGroup(id, name) {
      const group = { ...need(groups, id, 'group'), name: groupName(name, id) };
      await adapter.commit([put('groups', group)]);
      groups.set(id, group);
      emit({ type: 'group', ids: [id] });
    },

    // Its todos become ungrouped, in the same transaction.
    async deleteGroup(id) {
      need(groups, id, 'group');
      const moved = [...todos.values()]
        .filter((t) => t.groupId === id)
        .map((t) => ({ ...t, groupId: null, updatedAt: iso() }));
      await adapter.commit([...moved.map((t) => put('todos', t)), del('groups', id)]);
      for (const t of moved) todos.set(t.id, t);
      groups.delete(id);
      emit({ type: 'group', ids: [id, ...moved.map((t) => t.id)] });
    },

    lastBackupAt: () => meta.get('lastBackupAt') ?? null,

    async markBackedUp() {
      const value = iso();
      await adapter.commit([put('meta', { key: 'lastBackupAt', value })]);
      meta.set('lastBackupAt', value);
      emit({ type: 'backup', ids: [] });
    },

    // Shown after 7 days without a backup. Never on an empty app.
    backupStale() {
      if (todos.size === 0) return false;
      const since = meta.get('lastBackupAt') ?? meta.get('firstWriteAt');
      return since ? now() - new Date(since) > WEEK_MS : false;
    },

    // `parsed` comes from parseBackup, so it is already validated.
    async replaceAll(parsed) {
      await adapter.replaceAll({
        todos: parsed.todos,
        groups: parsed.groups,
        meta: { lastBackupAt: parsed.exportedAt },
      });
      load(await adapter.load());
      emit({ type: 'import', ids: [] });
    },
  };
}
