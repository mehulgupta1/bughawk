import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFeatures, suggestTechniques, featuresByHost, FEATURES } from './features.js';

test('detectFeatures finds features from paths and categories', () => {
  const r = [
    { url: 'https://a.t.com/login', categories: [] },
    { url: 'https://a.t.com/api/v2/users?id=1', categories: ['idor'] },
    { url: 'https://a.t.com/p?redirect=https://x', categories: ['redirect'] },
    { url: 'https://a.t.com/upload', categories: ['upload'] },
  ];
  const got = detectFeatures(r);
  for (const k of ['login', 'api', 'redirect', 'file-upload']) assert.ok(got.includes(k), `missing ${k}`);
});

test('suggestTechniques returns techniques for selected features', () => {
  const techs = suggestTechniques(['file-upload']);
  assert.ok(techs.length > 0);
  assert.ok(techs.every((t) => ['upload', 'ssrf'].includes(t.cat)));
});

test('featuresByHost groups detection per host', () => {
  const map = featuresByHost([
    { url: 'https://a.t.com/login', categories: [] },
    { url: 'https://b.t.com/graphql', categories: ['graphql'] },
  ]);
  assert.ok(map['a.t.com'].includes('login'));
  assert.ok(map['b.t.com'].includes('graphql'));
});

test('every feature maps to at least one technique category', () => {
  assert.ok(FEATURES.every((f) => f.cats.length > 0));
});
