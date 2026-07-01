import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLines, crossListStats, suggestForTech } from './wordlists.js';

test('cleanLines trims, drops blanks, dedups, optional sort', () => {
  assert.equal(cleanLines(' a \n\n a \nb'), 'a\nb');
  assert.equal(cleanLines('b\na\nb', { sort: true }), 'a\nb');
  assert.equal(cleanLines('b\na\nb', { dedup: false }), 'b\na\nb');
});

test('crossListStats counts unique and shared entries', () => {
  const lists = [
    { content: 'admin\nlogin\napi' },
    { content: 'login\napi\nupload' },
  ];
  const s = crossListStats(lists);
  assert.equal(s.uniqueEntries, 4); // admin, login, api, upload
  assert.equal(s.sharedEntries, 2); // login, api in both
});

test('suggestForTech matches lists by tech token', () => {
  const lists = [
    { name: 'WP plugins', category: 'WordPress' },
    { name: 'PHP files', category: 'PHP' },
    { name: 'generic', category: 'params' },
  ];
  const hits = suggestForTech(lists, ['WordPress', 'nginx']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'WordPress');
  assert.equal(suggestForTech(lists, []).length, 0);
});
