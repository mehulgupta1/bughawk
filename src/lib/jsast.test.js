import { test } from 'node:test';
import assert from 'node:assert/strict';
import { astEndpoints } from './jsast.js';
import { analyzeJs } from './jsrecon.js';

test('astEndpoints resolves string-concatenation endpoints', () => {
  const e = astEndpoints('const region="us"; const u = "/api/" + region + "/users";');
  assert.ok(e.some((x) => x === '/api/{x}/users'), JSON.stringify(e));
});

test('astEndpoints resolves template-literal endpoints', () => {
  const e = astEndpoints('const id=1; fetch(`/api/v2/orders/${id}/items`);');
  assert.ok(e.some((x) => x.startsWith('/api/v2/orders/')), JSON.stringify(e));
});

test('astEndpoints pulls the URL arg of fetch/axios calls', () => {
  const e = astEndpoints('axios.get("/internal/admin/"+x); fetch(base+"/graphql");');
  assert.ok(e.some((x) => x.startsWith('/internal/admin/')), JSON.stringify(e));
  assert.ok(e.some((x) => x.includes('/graphql')), JSON.stringify(e));
});

test('astEndpoints ignores non-endpoint concatenations', () => {
  const e = astEndpoints('const msg = "hello " + name + "!";');
  assert.equal(e.length, 0);
});

test('analyzeJs surfaces AST-only endpoints that regex misses', () => {
  // this endpoint never exists as a single string literal — only regex would miss it
  const r = analyzeJs('const v=window.region; const u="/api/"+v+"/secret/keys"; fetch(u);');
  const all = [...r.paths, ...r.endpoints, ...r.urls];
  assert.ok(all.some((x) => x.includes('/api/') && x.includes('/secret/keys')), JSON.stringify(all));
});

test('astEndpoints survives unparseable input', () => {
  assert.deepEqual(astEndpoints('this is (((not valid <<< js'), []);
});
