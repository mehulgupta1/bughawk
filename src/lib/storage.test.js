import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDelta } from './storage.js';

// recordDelta drives what gets written/deleted in the per-row store. A wrong
// delete = lost user data, so pin the behaviour.

test('first write: everything is a put, nothing deleted', () => {
  const recs = [{ id: 'a' }, { id: 'b' }];
  const { puts, deleteIds, curr } = recordDelta(recs, new Map());
  assert.deepEqual(puts, recs);
  assert.deepEqual(deleteIds, []);
  assert.equal(curr.size, 2);
});

test('single in-place edit only re-puts the changed record (identity diff)', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const prev = new Map([['a', a], ['b', b]]);
  const b2 = { ...b, tag: true }; // edited -> new object identity
  const { puts, deleteIds } = recordDelta([a, b2], prev);
  assert.deepEqual(puts, [b2]);   // a is unchanged (same ref) -> not written
  assert.deepEqual(deleteIds, []);
});

test('removed records are deleted', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const prev = new Map([['a', a], ['b', b]]);
  const { puts, deleteIds } = recordDelta([a], prev);
  assert.deepEqual(puts, []);
  assert.deepEqual(deleteIds, ['b']);
});

test('clear-all deletes every persisted row', () => {
  const prev = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]]);
  const { puts, deleteIds, curr } = recordDelta([], prev);
  assert.deepEqual(puts, []);
  assert.deepEqual(deleteIds.sort(), ['a', 'b']);
  assert.equal(curr.size, 0);
});
