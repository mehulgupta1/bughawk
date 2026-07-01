// Tests for the surface graph join + event log. Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, queryGraph, hostOf, parseNuclei } from './graph.js';
import { snapshotSig, computeEvents, newHostsSince, resurrections, churn } from './events.js';
import { buildWorklist, DEFAULT_WEIGHTS } from './worklist.js';

test('parseNuclei extracts host/name/severity and joins onto the graph + worklist', () => {
  const jsonl = [
    '{"template-id":"CVE-2021-1","info":{"name":"Some CVE","severity":"critical"},"host":"https://api.t.com","matched-at":"https://api.t.com/x"}',
    'garbage line',
  ].join('\n');
  const found = parseNuclei(jsonl);
  assert.equal(found.length, 1);
  assert.equal(found[0].host, 'api.t.com');
  assert.equal(found[0].severity, 'critical');

  const nodes = buildGraph({
    subs: [{ host: 'api.t.com', status: 200 }],
    nuclei: found,
    scopeRules: [{ pattern: '*.t.com', kind: 'wildcard', scope: 'in' }],
  });
  const api = nodes.find((n) => n.host === 'api.t.com');
  assert.equal(api.nuclei.length, 1);
  assert.equal(api.maxConf, 'high');

  const wl = buildWorklist(nodes, new Map(), DEFAULT_WEIGHTS);
  assert.equal(wl[0].kind, 'nuclei');
});

test('buildGraph joins subs + ports + url findings per host', () => {
  const nodes = buildGraph({
    subs: [{ host: 'api.t.com', status: 200, ip: '1.2.3.4', tech: ['nginx'] }],
    ports: [{ host: 'api.t.com', port: 8443 }, { host: 'api.t.com', port: 443 }],
    urlResults: [{ url: 'https://api.t.com/v2/orders?id=1', categories: ['idor'], severity: 'critical', confidence: 'high' }],
    scopeRules: [{ pattern: '*.t.com', kind: 'wildcard', scope: 'in' }],
  });
  const api = nodes.find((n) => n.host === 'api.t.com');
  assert.ok(api);
  assert.deepEqual(api.ports, [443, 8443]);
  assert.equal(api.nonStdPort, true);
  assert.equal(api.maxSev, 'critical');
  assert.equal(api.maxConf, 'high');
  assert.equal(api.findings.length, 1);
});

test('queryGraph: in-scope + non-standard port + high-confidence finding', () => {
  const nodes = buildGraph({
    subs: [{ host: 'a.t.com', status: 200 }, { host: 'b.t.com', status: 200 }],
    ports: [{ host: 'a.t.com', port: 8443 }, { host: 'b.t.com', port: 443 }],
    urlResults: [{ url: 'https://a.t.com/x?id=99999', categories: ['idor'], severity: 'critical', confidence: 'high' }],
    scopeRules: [{ pattern: '*.t.com', kind: 'wildcard', scope: 'in' }],
  });
  const hit = queryGraph(nodes, { inScope: true, nonStdPort: true, highConf: true });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].host, 'a.t.com');
});

test('hostOf extracts hostname from URLs and bare host:port', () => {
  assert.equal(hostOf('https://x.com/a?b=1'), 'x.com');
  assert.equal(hostOf('sub.example.com:443'), 'sub.example.com');
  assert.equal(hostOf(''), '');
});

test('computeEvents flags new hosts, new ports, gone, and resurrection', () => {
  const t0 = 1000; const t1 = 2000; const t2 = 3000;
  // run 1: a + b
  let events = [];
  const s0 = {};
  const s1 = snapshotSig([{ host: 'a.t.com' }, { host: 'b.t.com' }], []);
  events = events.concat(computeEvents(s0, s1, events, t0));
  assert.equal(events.filter((e) => e.type === 'host_new').length, 2);

  // run 2: b dies, a gains a port
  const s2 = snapshotSig([{ host: 'a.t.com' }], [{ host: 'a.t.com', port: 8080 }]);
  events = events.concat(computeEvents(s1, s2, events, t1));
  assert.ok(events.some((e) => e.type === 'host_gone' && e.entity === 'b.t.com'));
  assert.ok(events.some((e) => e.type === 'port_new' && e.entity === 'a.t.com' && e.detail === 8080));

  // run 3: b comes back -> resurrection
  const s3 = snapshotSig([{ host: 'a.t.com' }, { host: 'b.t.com' }], [{ host: 'a.t.com', port: 8080 }]);
  events = events.concat(computeEvents(s2, s3, events, t2));
  assert.ok(events.some((e) => e.type === 'host_back' && e.entity === 'b.t.com'));
  assert.equal(resurrections(events).length, 1);
  assert.ok(newHostsSince(events, t2).has('b.t.com'));
  assert.equal(churn(events)[0].count >= 1, true);
});
