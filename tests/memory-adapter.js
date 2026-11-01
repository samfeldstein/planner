// In-memory stand-in for the IndexedDB adapter, same contract. Test-only.

export function createMemoryAdapter() {
  let data = { todos: new Map(), groups: new Map(), meta: new Map() };
  const clone = () => ({
    todos: new Map(data.todos), groups: new Map(data.groups), meta: new Map(data.meta),
  });
  let failNext = false;

  const adapter = {
    failNext() { failNext = true; },

    async load() {
      return {
        todos: [...data.todos.values()].map((x) => structuredClone(x)),
        groups: [...data.groups.values()].map((x) => structuredClone(x)),
        meta: Object.fromEntries(data.meta),
      };
    },

    async commit(ops) {
      const next = clone();
      for (const op of ops) {
        const map = next[op.store];
        if (!map) throw new Error(`no store ${op.store}`);
        if (op.type === 'delete') map.delete(op.key);
        else if (op.store === 'meta') map.set(op.value.key, op.value.value);
        else map.set(op.value.id, structuredClone(op.value));
      }
      if (failNext) { failNext = false; throw new Error('simulated abort'); }
      data = next;
    },

    async replaceAll({ todos, groups, meta }) {
      const next = clone();
      next.todos = new Map(todos.map((x) => [x.id, structuredClone(x)]));
      next.groups = new Map(groups.map((x) => [x.id, structuredClone(x)]));
      for (const [k, v] of Object.entries(meta ?? {})) next.meta.set(k, v);
      if (failNext) { failNext = false; throw new Error('simulated abort'); }
      data = next;
    },
  };
  return adapter;
}
