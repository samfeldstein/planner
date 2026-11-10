// The "Add a task" field under the list. Return, or leaving the field (the form bar's checkmark),
// opens the edit sheet for a new todo with that name, so its options can be set before it is saved
// (sheet.js). The round + button opens the same sheet empty, with the name field focused.

export function init() {
  const field = document.getElementById('quickAdd');
  const sheet = document.getElementById('sheet');

  const text = () => field.textContent.replace(/\s*\n\s*/g, ' ').trim();
  const openNew = (detail) => document.dispatchEvent(new CustomEvent('planner:new', { detail }));

  function handOff() {
    const title = text();
    if (!title || sheet.open) return;
    field.textContent = '';
    openNew({ title });
  }

  // Leaving the field with text in it (say, by tapping +) opens the sheet first; the tap then does nothing.
  document.getElementById('addBtn').addEventListener('click', () => {
    if (sheet.open) return;
    openNew({ focus: true }); // synchronous, so the focus stays inside the tap and iOS opens the keyboard
  });

  field.addEventListener('blur', handOff);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); handOff(); }
  });
}
