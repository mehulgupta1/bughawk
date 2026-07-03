import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkRecords } from './storage.js';

// chunkRecords splits the dataset into the blobs we persist. Getting the split
// or count wrong would drop or duplicate records on save/load.

test('splits into fixed-size chunks and preserves every record in order', () => {
  const recs = Array.from({ length: 12 }, (_, i) => ({ id: i }));
  const chunks = chunkRecords(recs, 5);
  assert.equal(chunks.length, 3);           // 5 + 5 + 2
  assert.deepEqual(chunks.map((c) => c.length), [5, 5, 2]);
  assert.deepEqual(chunks.flat(), recs);    // nothing lost or reordered
});

test('exact multiple: no trailing empty chunk', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
  const chunks = chunkRecords(recs, 5);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.flat(), recs);
});

test('empty input yields no chunks', () => {
  assert.deepEqual(chunkRecords([], 5), []);
});
