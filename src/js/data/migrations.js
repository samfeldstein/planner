// Append only: never edit a released step. A step that changes records calls the
// upgrade functions in core/model.js, the same ones backup import uses.

import { upgradeAll } from '../core/model.js';

export const DB_NAME = 'planner';
export const DB_VERSION = 2;

export const migrations = {
  1(db) {
    db.createObjectStore('todos', { keyPath: 'id' });
    db.createObjectStore('groups', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },

  // Format 1 -> 2: every todo gets a part of the day. Runs inside the upgrade transaction.
  2(db, tx) {
    const todos = tx.objectStore('todos');
    const groups = tx.objectStore('groups');
    const allTodos = todos.getAll();
    const allGroups = groups.getAll();
    // Requests in a transaction finish in order, so the todos are in by now.
    allGroups.onsuccess = () => {
      const out = upgradeAll({ todos: allTodos.result, groups: allGroups.result }, 1);
      const kept = new Set(out.groups.map((g) => g.id));
      for (const g of allGroups.result) if (!kept.has(g.id)) groups.delete(g.id);
      for (const t of out.todos) todos.put(t);
    };
  },
};
