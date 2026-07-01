import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DORKS, buildDorks, dorkQuery, dorkUrl, GOOGLE_DORKS, buildGoogleDorks, googleUrl } from './dorks.js';

test('ships 100+ github dorks', () => {
  assert.ok(DORKS.length >= 100, `only ${DORKS.length} dorks`);
});

test('ships 100+ google dorks', () => {
  assert.ok(GOOGLE_DORKS.length >= 100, `only ${GOOGLE_DORKS.length} google dorks`);
});

test('google dorks substitute bare domain (no quotes) and build a google url', () => {
  const all = buildGoogleDorks('target.com');
  const f = all.find((d) => d.q === 'site:{T} ext:env');
  assert.equal(f.query, 'site:target.com ext:env');
  assert.ok(googleUrl('site:target.com ext:env').startsWith('https://www.google.com/search?q='));
});

test('dorkQuery substitutes and quotes the target', () => {
  assert.equal(dorkQuery('{T} filename:.env', 'target.com'), '"target.com" filename:.env');
  assert.equal(dorkQuery('org:{ORG} "secret"', 'target.com', 'targetorg'), 'org:targetorg "secret"');
});

test('dorkUrl builds an encoded github code-search url', () => {
  const u = dorkUrl('"target.com" "AKIA"');
  assert.ok(u.startsWith('https://github.com/search?q='));
  assert.ok(u.includes('type=code'));
  assert.ok(u.includes('AKIA'));
});

test('buildDorks drops org-scoped dorks without an org, includes them with one', () => {
  const noOrg = buildDorks('target.com');
  assert.ok(noOrg.every((d) => !d.q.includes('{ORG}')));
  const withOrg = buildDorks('target.com', 'targetorg');
  assert.ok(withOrg.some((d) => d.query.startsWith('org:targetorg')));
  assert.ok(withOrg.length > noOrg.length);
});
