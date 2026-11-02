// The "Add a task" field under the list. Return adds a todo due today with no group, priority, or
// repeat; open the row's arrow and tap Edit to set those.

export function init({ store, clock }) {
  const field = document.getElementById('quickAdd');
  let adding = false;

  const text = () => field.textContent.replace(/\s*\n\s*/g, ' ').trim();

  async function add() {
    const title = text();
    if (!title || adding) return;
    adding = true;
    try {
      await store.addTodo({ title, due: clock.today(), groupId: null, priority: 0, recur: null });
      if (text() === title) field.textContent = ''; // keep anything typed during the save
    } catch (err) {
      console.error(err);
    } finally {
      adding = false;
    }
  }

  document.getElementById('addBtn').addEventListener('click', () => {
    if (text()) add();
    field.focus();
    field.scrollIntoView({ block: 'center' });
  });

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); }
  });
}
