// IndexedDB adapter. The store talks to an adapter: load(), commit(ops), replaceAll(data).
// Every call goes through tx(), which reopens and retries once if WebKit dropped the connection.

import { DB_NAME, DB_VERSION, migrations } from './migrations.js';

export function openDb({ idb = globalThis.indexedDB, onBlocked, onVersionChange } = {}) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) migrations[v](req.result, req.transaction);
    };
    req.onblocked = () => onBlocked?.();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); onVersionChange?.(); };
      resolve(db);
    };
  });
}

const RETRYABLE = new Set(['InvalidStateError', 'UnknownError']);

export function createIdbAdapter(options = {}) {
  let db = null;

  const run = (stores, mode, fn) => new Promise((resolve, reject) => {
    let result;
    let t;
    try {
      t = db.transaction(stores, mode);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
      result = fn(t);
    } catch (err) {
      try { t?.abort(); } catch { /* already finished */ }
      reject(err);
    }
  });

  async function tx(stores, mode, fn) {
    db ??= await openDb(options);
    try {
      return await run(stores, mode, fn);
    } catch (err) {
      if (!RETRYABLE.has(err?.name)) throw err;
      db = await openDb(options);
      return run(stores, mode, fn);
    }
  }

  return {
    async load() {
      const reqs = {};
      await tx(['todos', 'groups', 'meta'], 'readonly', (t) => {
        for (const name of ['todos', 'groups', 'meta']) reqs[name] = t.objectStore(name).getAll();
      });
      return {
        todos: reqs.todos.result,
        groups: reqs.groups.result,
        meta: Object.fromEntries(reqs.meta.result.map((m) => [m.key, m.value])),
      };
    },

    // ops: [{ store, type: 'put', value } | { store, type: 'delete', key }], all or nothing.
    commit(ops) {
      const stores = [...new Set(ops.map((o) => o.store))];
      return tx(stores, 'readwrite', (t) => {
        for (const op of ops) {
          const s = t.objectStore(op.store);
          if (op.type === 'put') s.put(op.value);
          else s.delete(op.key);
        }
      });
    },

    // Clears todos and groups, writes the given records and meta keys. Other meta stays.
    replaceAll({ todos, groups, meta }) {
      return tx(['todos', 'groups', 'meta'], 'readwrite', (t) => {
        t.objectStore('todos').clear();
        t.objectStore('groups').clear();
        for (const x of todos) t.objectStore('todos').put(x);
        for (const x of groups) t.objectStore('groups').put(x);
        for (const [key, value] of Object.entries(meta ?? {})) t.objectStore('meta').put({ key, value });
      });
    },
  };
}
