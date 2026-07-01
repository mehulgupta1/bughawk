import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconCommands } from './reconcommands.js';

const DATA = {
  urls: ['https://api.t.com/v1/users', 'https://api.t.com/v1/orders'],
  paths: ['/api/v2/admin', '/api/{x}/secret/'],
  endpoints: ['/internal/metrics'],
  params: [{ name: 'id' }, { name: 'token' }],
};

test('builds nuclei + httpx commands from absolute URLs', () => {
  const c = reconCommands(DATA);
  const labels = c.map((x) => x.label);
  assert.ok(labels.some((l) => l.includes('nuclei')));
  assert.ok(labels.some((l) => l.includes('httpx')));
  assert.ok(c.find((x) => x.label.includes('URLs')).text.includes('api.t.com/v1/users'));
});

test('normalizes AST {x} placeholders and trailing slashes in paths', () => {
  const paths = reconCommands(DATA).find((x) => x.label.startsWith('Paths')).text;
  assert.ok(paths.includes('/api/v2/admin'));
  assert.ok(paths.includes('/api/secret')); // {x} stripped, trailing / removed
});

test('ffuf command appears only when a base URL is given', () => {
  assert.ok(!reconCommands(DATA).some((x) => x.label.includes('ffuf')));
  assert.ok(reconCommands(DATA, 'https://t.com').some((x) => x.label.includes('ffuf')));
});
