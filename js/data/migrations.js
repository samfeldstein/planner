// Append only: never edit a released step. A step that changes records calls the
// upgrade functions in core/model.js, the same ones backup import uses.

export const DB_NAME = 'planner';
export const DB_VERSION = 1;

export const migrations = {
  1(db) {
    db.createObjectStore('todos', { keyPath: 'id' });
    db.createObjectStore('groups', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
};
