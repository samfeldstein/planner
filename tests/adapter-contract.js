// One contract, two runners: node (memory adapter) and tests/browser/idb.html (real IndexedDB).
// `check` is assert.* in node and a small recorder in the browser.

const todo = (id, extra = {}) => ({
  id, title: id, due: '2026-11-01', groupId: null, priority: 0, recur: null, lastDone: null,
  createdAt: 'x', updatedAt: 'x', ...extra,
});

export async function runContract(makeAdapter, check) {
  const a = await makeAdapter();

  let d = await a.load();
  check.deepEqual(d, { todos: [], groups: [], meta: {} }, 'empty load');

  await a.commit([
    { store: 'todos', type: 'put', value: todo('a') },
    { store: 'todos', type: 'put', value: todo('b') },
    { store: 'groups', type: 'put', value: { id: 'g', name: 'Work', order: 1, createdAt: 'x' } },
    { store: 'meta', type: 'put', value: { key: 'firstWriteAt', value: 'T1' } },
  ]);
  d = await a.load();
  check.equal(d.todos.length, 2, 'two todos stored');
  check.equal(d.groups[0].name, 'Work', 'group stored');
  check.deepEqual(d.meta, { firstWriteAt: 'T1' }, 'meta stored as key to value');

  await a.commit([
    { store: 'todos', type: 'put', value: todo('a', { title: 'changed' }) },
    { store: 'todos', type: 'delete', key: 'b' },
  ]);
  d = await a.load();
  check.deepEqual(d.todos.map((t) => t.title), ['changed'], 'put replaces, delete removes');

  let threw = false;
  try {
    await a.commit([
      { store: 'todos', type: 'put', value: todo('c') },
      { store: 'nope', type: 'put', value: { id: 'z' } },
    ]);
  } catch { threw = true; }
  check.equal(threw, true, 'bad op rejects');
  d = await a.load();
  check.deepEqual(d.todos.map((t) => t.id), ['a'], 'a failed commit applies nothing');

  await a.replaceAll({
    todos: [todo('x'), todo('y')],
    groups: [{ id: 'h', name: 'Home', order: 1, createdAt: 'x' }],
    meta: { lastBackupAt: 'T2' },
  });
  d = await a.load();
  check.deepEqual(d.todos.map((t) => t.id).sort(), ['x', 'y'], 'replaceAll swaps todos');
  check.deepEqual(d.groups.map((g) => g.id), ['h'], 'replaceAll swaps groups');
  check.deepEqual(d.meta, { firstWriteAt: 'T1', lastBackupAt: 'T2' }, 'replaceAll keeps other meta');
}
