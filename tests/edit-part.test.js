// The edit sheet's part of the day: only a changed part goes in the patch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { editPatch } from '../src/js/core/edit.js';

const todo = { title: 'Gym', part: 'morning', groupId: null, priority: 0, due: '2026-11-03', recur: null };

test('editPatch sends the part only when it changed', () => {
  assert.deepEqual(editPatch(todo, { ...todo }), {});
  assert.deepEqual(editPatch(todo, { ...todo, part: 'night' }), { part: 'night' });
});
