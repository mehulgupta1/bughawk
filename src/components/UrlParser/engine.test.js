// Regression tests for the URL Parser engine. Pure logic, no DOM — run with:
//   node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine, buildTemplates, urlTemplate, csvCell, entropy, SEV_RANK, classifyValue, computeConfidence, analyzeJwt, collectJwts, buildVerbMatrix, buildEnvMatrix, parseInputLine, buildParamDossier, fuzzUrl } from './engine.js';

// base64url helper for building test tokens
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (h, p) => `${b64u(h)}.${b64u(p)}.sig`;

const OPTS = {
  checks: {
    isURL: true, hasHost: true, noLocal: false, noBlank: true, noFrag: true,
    decodePct: true, noImg: true, uniq: true, entropy: false, noExt: true,
    normParam: true, minLen: true,
  },
  minLen: 2, entThresh: 2.0, customRegexes: [],
};

// Returns the stat count for a category given a single URL.
function catCount(url, id, opts = OPTS) {
  return runEngine([url], opts).stats[id];
}

// --- Category true-positives (must match) ---
const POSITIVE = {
  xss: 'https://t.com/s?q=<script>alert(1)</script>',
  idor: 'https://t.com/p?id=10234',
  sqli: "https://t.com/p?id=1 union select 1,2,3",
  ssrf: 'https://t.com/p?url=http://169.254.169.254/latest',
  rce: 'https://t.com/p?cmd=;cat /etc/passwd',
  lfi: 'https://t.com/p?file=../../../../etc/passwd',
  redirect: 'https://t.com/p?redirect=https://evil.com',
  ssti: 'https://t.com/p?template={{7*7}}',
  jwt: 'https://t.com/p?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij',
  graphql: 'https://t.com/graphql?query={__schema{types{name}}}',
  crlf: 'https://t.com/p?next=%0d%0aSet-Cookie:x=1',
  protoPollution: 'https://t.com/p?x[__proto__]=polluted',
  git: 'https://t.com/.git/config',
  awsKeys: 'https://t.com/x/AKIAIOSFODNN7EXAMPLE/y',
};

for (const [id, url] of Object.entries(POSITIVE)) {
  test(`${id} matches its positive sample`, () => {
    assert.ok(catCount(url, id) >= 1, `${id} should flag ${url}`);
  });
}

// --- Category false-positives (must NOT match) ---
test('idor ignores short numeric ids', () => {
  assert.equal(catCount('https://t.com/p?id=12', 'idor'), 0);
});
test('xss ignores benign generic params', () => {
  assert.equal(catCount('https://t.com/p?type=data:&format=javascript', 'xss'), 0);
});
test('auth ignores a long non-token value', () => {
  assert.equal(catCount('https://t.com/p?state=abcdefghijklmnopqrstuvwxyz1', 'auth'), 0);
});
test('sqli ignores ordinary words', () => {
  assert.equal(catCount('https://t.com/p?name=Robert', 'sqli'), 0);
});

// --- Dedup / dupeCount ---
test('uniq collapses identical normalized URLs and counts dupes', () => {
  const lines = Array(5).fill('https://t.com/u?b=2&a=1');
  const { results, stats } = runEngine(lines, { ...OPTS, customRegexes: [{ pattern: 't\\.com' }] });
  const row = results.find((r) => r.url.includes('t.com'));
  assert.ok(row, 'should have a result');
  assert.equal(row.dupeCount, 4, '5 identical -> dupeCount 4');
  assert.ok(stats.skipped >= 4);
});

test('normParam makes param order irrelevant for dedup', () => {
  const { stats } = runEngine(
    ['https://t.com/u?a=1&b=2', 'https://t.com/u?b=2&a=1'],
    { ...OPTS, customRegexes: [{ pattern: 'u' }] },
  );
  // both normalize to the same string; one processed, one skipped
  assert.equal(stats.total, 2);
  assert.equal(stats.skipped, 1);
});

// --- Templating ---
test('buildTemplates collapses numeric path ids', () => {
  const lines = [];
  for (let i = 0; i < 50; i++) lines.push(`https://api.com/user/${1000 + i}/orders?id=${i + 100}`);
  const { results } = runEngine(lines, OPTS);
  const tmpl = buildTemplates(results);
  const main = tmpl.find((t) => t.template.includes('/user/{num}/orders'));
  assert.ok(main, 'template with {num} should exist');
  assert.equal(main.count, 50);
});

test('urlTemplate replaces uuid and keeps sorted param keys', () => {
  const t = urlTemplate('https://h.com/p/550e8400-e29b-41d4-a716-446655440000/x?b=2&a=1');
  assert.equal(t, 'h.com/p/{uuid}/x?a={val}&b={val}');
});

// --- CSV safety ---
test('csvCell escapes quotes and neutralises formula injection', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=cmd()'), '"\'=cmd()"');
});

// --- Helpers ---
test('entropy is higher for random strings', () => {
  assert.ok(entropy('aaaaaaaa') < entropy('a8Fz3Qx9'));
});
test('SEV_RANK orders critical above high above custom', () => {
  assert.ok(SEV_RANK.critical > SEV_RANK.high);
  assert.ok(SEV_RANK.high > SEV_RANK.custom);
});

// --- Value-type classification ---
test('classifyValue covers core types', () => {
  assert.equal(classifyValue('12345'), 'int');
  assert.equal(classifyValue('true'), 'bool');
  assert.equal(classifyValue('550e8400-e29b-41d4-a716-446655440000'), 'uuid');
  assert.equal(classifyValue('https://evil.com'), 'url');
  assert.equal(classifyValue('a@b.com'), 'email');
  assert.equal(classifyValue('my-cool-page'), 'slug');
  assert.equal(classifyValue('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.aaaa'), 'jwt');
});

// --- Confidence scoring (the examples that kill "false certainty") ---
const conf = (url) => {
  const { results } = runEngine([url], OPTS);
  return results[0]?.confidence;
};
test('SSRF to metadata IP is high confidence', () => {
  assert.equal(conf('https://t.com/p?url=http://169.254.169.254/latest'), 'high');
});
test('SSRF confidence: external host medium, known CDN low, non-URL low', () => {
  const ext = 'https://attacker-controlled.example/x';
  assert.equal(computeConfidence('ssrf', [{ key: 'url', value: ext, type: classifyValue(ext) }]), 'medium');
  const cdn = 'https://cdn.partner.com/x';
  assert.equal(computeConfidence('ssrf', [{ key: 'url', value: cdn, type: classifyValue(cdn) }]), 'low');
  assert.equal(computeConfidence('ssrf', [{ key: 'url', value: 'home', type: 'text' }]), 'low');
});
test('IDOR on a long numeric id is higher confidence than a tiny one', () => {
  assert.equal(computeConfidence('idor', [{ key: 'id', value: '10294857', type: classifyValue('10294857') }]), 'high');
  assert.equal(computeConfidence('idor', [{ key: 'id', value: '203', type: classifyValue('203') }]), 'low');
});
test('Open Redirect: URL value flagged high, bool value not flagged at all', () => {
  assert.equal(conf('https://t.com/p?redirect=https://evil.com'), 'high');
  // per-param strict now requires a URL-ish value, so redirect=true is not a hit
  assert.equal(runEngine(['https://t.com/p?redirect=true'], OPTS).stats.redirect, 0);
});
test('every result carries a confidence', () => {
  const { results } = runEngine(['https://t.com/p?id=10234&redirect=https://e.com'], OPTS);
  assert.ok(['high', 'medium', 'low'].includes(results[0].confidence));
});

// --- JWT analyzer ---
test('analyzeJwt flags alg:none and expiry', () => {
  const tok = jwt({ alg: 'none' }, { exp: 1000000000, iss: 'internal-auth' }); // exp in 2001
  const a = analyzeJwt(tok);
  assert.equal(a.alg, 'none');
  assert.ok(a.issues.some((i) => /alg:none/.test(i)));
  assert.equal(a.expired, true);
  assert.equal(a.iss, 'internal-auth');
});
test('analyzeJwt returns null for non-tokens', () => {
  assert.equal(analyzeJwt('not.a.jwt'), null);
});
test('collectJwts extracts and ranks JWTs from result URLs', () => {
  const tok = jwt({ alg: 'none' }, { sub: '1' });
  const { results } = runEngine([`https://t.com/cb?token=${tok}`], OPTS);
  const j = collectJwts(results);
  assert.ok(j.length >= 1);
  assert.equal(j[0].alg, 'none');
});

// --- Input parsing (method/status) ---
test('parseInputLine reads httpx json, method lines, and status lines', () => {
  assert.deepEqual(parseInputLine('{"url":"https://t.com/a","method":"DELETE","status_code":200}'), { url: 'https://t.com/a', method: 'DELETE', status: 200 });
  assert.deepEqual(parseInputLine('POST https://t.com/x'), { url: 'https://t.com/x', method: 'POST', status: null });
  assert.deepEqual(parseInputLine('https://t.com/y [403]'), { url: 'https://t.com/y', method: 'GET', status: 403 });
  assert.equal(parseInputLine('https://t.com/z').method, 'GET');
});

// --- IDOR verb matrix ---
test('buildVerbMatrix groups templates and flags destructive verb sets', () => {
  const lines = [
    'GET https://t.com/api/orders/12345',
    'PUT https://t.com/api/orders/67890',
    'DELETE https://t.com/api/orders/11111',
    'GET https://t.com/api/products/22222',
  ];
  const { results } = runEngine(lines, { ...OPTS, uniq: true });
  const matrix = buildVerbMatrix(results);
  const orders = matrix.find((r) => r.template.includes('/api/orders/{num}'));
  assert.ok(orders, 'orders template exists');
  assert.deepEqual(orders.methods, ['DELETE', 'GET', 'PUT']);
  assert.equal(orders.destructive, true);
});

// --- Env-drift matrix ---
test('buildEnvMatrix flags a path open on one host but blocked on another', () => {
  const lines = [
    'https://prod.t.com/admin [403]',
    'https://staging.t.com/admin [200]',
  ];
  const { results } = runEngine(lines, { ...OPTS, uniq: true });
  const env = buildEnvMatrix(results);
  const admin = env.find((r) => r.path.includes('/admin'));
  assert.ok(admin, 'admin path tracked across hosts');
  assert.equal(admin.drift, true);
});

// --- Parameter dossier ---
test('buildParamDossier aggregates a param across endpoints/hosts with types', () => {
  const lines = [
    'https://a.t.com/p?redirect=https://evil.com',
    'https://b.t.com/login?redirect=https://x.com',
    'https://a.t.com/go?redirect=true',
  ];
  const { results } = runEngine(lines, { ...OPTS, uniq: true });
  const dossier = buildParamDossier(results);
  const redir = dossier.find((d) => d.param === 'redirect');
  assert.ok(redir, 'redirect param tracked');
  assert.ok(redir.endpoints >= 2);
  assert.ok(redir.hosts >= 2);
  assert.ok(redir.types.some((t) => t.startsWith('url')));
});

// --- Fuzz export ---
test('fuzzUrl turns {val} into FUZZ and fills other placeholders', () => {
  assert.equal(fuzzUrl('api.t.com/user/{num}/orders?id={val}'), 'https://api.t.com/user/1/orders?id=FUZZ');
});

// --- Rarity ranking ---
test('buildTemplates assigns higher rarity to a unique segment', () => {
  const lines = [];
  for (let i = 0; i < 30; i++) lines.push(`https://t.com/api/products?id=${1000 + i}`);
  lines.push('https://t.com/internal/debug/heapdump?id=99999');
  const { results } = runEngine(lines, OPTS);
  const tmpl = buildTemplates(results);
  const common = tmpl.find((t) => t.template.includes('/api/products'));
  const rare = tmpl.find((t) => t.template.includes('/internal/debug/heapdump'));
  assert.ok(rare.rarity > common.rarity, 'rare endpoint ranks higher on rarity');
});

// --- Determinism ---
test('runEngine output is stable across runs', () => {
  const lines = [];
  for (let i = 0; i < 200; i++) lines.push(`https://t.com/p?redirect=https://evil.com&n=${i}`);
  const a = runEngine(lines, OPTS).results.map((r) => r.url).join('|');
  const b = runEngine(lines, OPTS).results.map((r) => r.url).join('|');
  assert.equal(a, b);
});
