import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from './graph.js';
import { buildWorklist, worklistCsv, DEFAULT_WEIGHTS } from './worklist.js';

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function sampleNodes() {
  return buildGraph({
    subs: [
      { host: 'a.t.com', status: 200 },
      { host: 'b.t.com', status: 200 },
      { host: 'out.other.com', status: 200 },
    ],
    ports: [{ host: 'a.t.com', port: 8443 }],
    urlResults: [
      { url: 'https://a.t.com/x?id=99999', categories: ['idor'], severity: 'critical', confidence: 'high' },
      { url: 'https://b.t.com/y?q=hi', categories: ['endpoints'], severity: 'medium', confidence: 'low' },
      { url: 'https://out.other.com/z?id=1', categories: ['idor'], severity: 'critical', confidence: 'high' },
    ],
    scopeRules: [{ pattern: '*.t.com', kind: 'wildcard', scope: 'in' }],
  });
}

test('worklist ranks critical+high+in-scope above low+in-scope', () => {
  const items = buildWorklist(sampleNodes(), new Map(), DEFAULT_WEIGHTS);
  const a = items.findIndex((i) => i.url && i.url.includes('a.t.com'));
  const b = items.findIndex((i) => i.url && i.url.includes('b.t.com'));
  assert.ok(a < b, 'critical/high ranks above medium/low');
});

test('out-of-scope is penalised below in-scope', () => {
  const items = buildWorklist(sampleNodes(), new Map(), DEFAULT_WEIGHTS);
  const inScope = items.find((i) => i.host === 'a.t.com');
  const outScope = items.find((i) => i.host === 'out.other.com');
  assert.ok(inScope.score > outScope.score, 'same finding, out-of-scope scores lower');
});

test('weights change the ranking (takeover boost)', () => {
  const nodes = buildGraph({
    subs: [{ host: 't.t.com', cname: 'foo.github.io', title: "There isn't a GitHub Pages site here" }],
    urlResults: [{ url: 'https://t.t.com/x?id=5', categories: ['idor'], severity: 'low', confidence: 'low' }],
    scopeRules: [{ pattern: '*.t.com', kind: 'wildcard', scope: 'in' }],
  });
  const boosted = buildWorklist(nodes, new Map(), { ...DEFAULT_WEIGHTS, takeover: 5 });
  assert.equal(boosted[0].kind, 'takeover', 'takeover floats to top when weighted up');
});

test('worklistCsv emits a header + a row per item', () => {
  const items = buildWorklist(sampleNodes(), new Map(), DEFAULT_WEIGHTS);
  const csv = worklistCsv(items, csvCell).split('\n');
  assert.equal(csv[0], 'Rank,Score,Kind,Severity,Confidence,Host,Detail,URL');
  assert.equal(csv.length, items.length + 1);
});
