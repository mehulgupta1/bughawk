import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTakeover, scanTakeovers } from './takeover.js';

test('flags dangling S3 CNAME as likely', () => {
  const a = analyzeTakeover({ host: 'x.example.com', status: 404, fields: { cname: 'old-bucket.s3.amazonaws.com' } });
  assert.equal(a.service, 'AWS S3');
  assert.equal(a.confidence, 'likely');
  assert.equal(a.severity, 'high');
});

test('live GitHub Pages (200) is a candidate, not likely', () => {
  const a = analyzeTakeover({ host: 'x.example.com', status: 200, cname: 'user.github.io' });
  assert.equal(a.service, 'GitHub Pages');
  assert.equal(a.confidence, 'candidate');
});

test('unknown/no status counts as dangling', () => {
  const a = analyzeTakeover({ host: 'x', status: 'unknown', cname: 'app.herokuapp.com' });
  assert.equal(a.confidence, 'likely');
});

test('no CNAME or unknown provider returns null', () => {
  assert.equal(analyzeTakeover({ host: 'x', status: 200 }), null);
  assert.equal(analyzeTakeover({ host: 'x', status: 200, cname: 'lb.internal.example.com' }), null);
});

test('scan sorts likely before candidate', () => {
  const recs = [
    { host: 'a', status: 200, cname: 'u.github.io' },      // candidate
    { host: 'b', status: 404, cname: 'b.s3.amazonaws.com' }, // likely
  ];
  const out = scanTakeovers(recs);
  assert.equal(out[0].host, 'b');
  assert.equal(out[0].confidence, 'likely');
});
