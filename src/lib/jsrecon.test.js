import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJs, extractSecrets, extractLinks, classify, extractDomains, extractGraphql, detectFramework, extractChunks, extractSourceMaps } from './jsrecon.js';

const SAMPLE = `
const API = "https://api.example.com/v1/users";
fetch("/api/v2/orders?id=1&token=abc");
var admin = "/admin/dashboard";
let s3 = "https://assets.example.com.s3.amazonaws.com/logo.png";
const key = "AKIAIOSFODNN7EXAMPLE";
const g = "AIzaSyA1234567890abcdefghijklmnopqrstuvw";
const gh = "ghp_0123456789abcdef0123456789abcdef0123";
const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij";
const api_key = "1a2b3c4d5e6f7g8h9i0jKLMNOP";
const db = "mongodb+srv://user:pass@cluster0.mongodb.net/db";
const q = \`query GetUser { __schema { types { name } } }\`;
const p = "/internal/debug/heapdump";
const reset = "/password/reset?token=xyz";
`;

test('analyzeJs returns all sections with counts', () => {
  const r = analyzeJs(SAMPLE);
  assert.ok(r.counts.secrets >= 4);
  assert.ok(r.urls.length >= 1);
  assert.ok(r.endpoints.length + r.paths.length >= 3);
  const pnames = r.params.map((p) => p.name);          // params are {name,example,count} objects
  assert.ok(pnames.includes('id') && pnames.includes('token'));
});

test('extractSecrets finds AWS/Google/GitHub/JWT/DB, ranked by severity', () => {
  const s = extractSecrets(SAMPLE);
  const names = s.map((x) => x.type);
  assert.ok(names.includes('AWS Access Key ID'));
  assert.ok(names.includes('Google API Key'));
  assert.ok(names.includes('GitHub Personal Access Token'));
  assert.ok(names.includes('JWT Token'));
  assert.ok(names.includes('DB Connection String'));
  assert.equal(s[0].severity, 'critical'); // sorted hardest first
});

test('links classify into urls / endpoints / paths', () => {
  const { urls, paths } = classify(extractLinks(SAMPLE));
  assert.ok(urls.some((u) => u.includes('api.example.com')));
  assert.ok(paths.some((p) => p.startsWith('/admin')));
});

test('domains include s3 + api hosts, graphql detects schema', () => {
  const links = extractLinks(SAMPLE);
  const d = extractDomains(SAMPLE, links);
  assert.ok(d.some((h) => h.includes('amazonaws.com')));
  const gq = extractGraphql(SAMPLE);
  assert.ok(gq.includes('GetUser'));
  assert.ok(gq.some((g) => g.includes('introspection present')));
});

test('juicy flags admin/internal/auth paths with reasons', () => {
  const r = analyzeJs(SAMPLE);
  const admin = r.juicy.find((j) => j.path.includes('/admin'));
  assert.ok(admin && admin.reasons.includes('admin'));
  assert.ok(r.juicy.some((j) => j.reasons.includes('internal')));
});

test('entropy gate drops a low-entropy generic api key', () => {
  const s = extractSecrets('api_key = "aaaaaaaaaaaaaaaa"');
  assert.ok(!s.some((x) => x.type === 'Generic API Key'));
});

test('detectFramework finds Next.js + webpack + React markers', () => {
  const fw = detectFramework('a=__webpack_require__;b="/_next/static/chunks/x.js";c=react-dom.production.min');
  const names = fw.map((f) => f.framework);
  assert.ok(names.includes('Next.js'));
  assert.ok(names.includes('Webpack'));
  assert.ok(names.includes('React'));
});

test('extractChunks rebuilds webpack chunk URLs from id->hash map', () => {
  // minified webpack chunk-URL builder: u(e) => "static/chunks/"+e+"."+{183:"abc",256:"def",990:"f00"}[e]+".js"
  const js = 'r.u=function(e){return"static/chunks/"+e+"."+{183:"abc1",256:"def2",990:"f00d"}[e]+".js"}';
  const base = 'https://t.com/_next/static/chunks/webpack-1.js';
  const c = extractChunks(js, base);
  assert.ok(c.includes('https://t.com/_next/static/chunks/183.abc1.js'));
  assert.ok(c.includes('https://t.com/_next/static/chunks/990.f00d.js'));
});

test('extractChunks handles name-map + hash-map (two object literals)', () => {
  const js = 'u=e=>"static/chunks/"+({12:"app",34:"vendor",56:"main"}[e]||e)+"."+{12:"aa",34:"bb",56:"cc"}[e]+".js"';
  const c = extractChunks(js, 'https://t.com/_next/static/chunks/wp.js');
  assert.ok(c.includes('https://t.com/_next/static/chunks/app.aa.js'));
  assert.ok(c.includes('https://t.com/_next/static/chunks/vendor.bb.js'));
});

test('recall: decodes \\x / \\u / %-escaped URLs hidden in minified code', () => {
  const js = 'var a="https:\\x2f\\x2fapi.secret.example\\x2fv1\\x2fkeys";var b="https://h.com/p%2Fadmin%2Fusers";';
  const r = analyzeJs(js);
  assert.ok(r.urls.some((u) => u.includes('api.secret.example/v1/keys')), 'hex-escaped URL decoded');
  assert.ok(r.urls.some((u) => u.includes('/p/admin/users')), 'percent-escaped path decoded');
});

test('recall: finds base64-embedded URL', () => {
  const hidden = Buffer.from('https://internal.api.example/admin/secret').toString('base64');
  const r = analyzeJs(`var blob="${hidden}";`);
  assert.ok(r.urls.some((u) => u.includes('internal.api.example/admin/secret')));
});

test('precision: placeholders & code fragments are NOT secrets', () => {
  const s = extractSecrets('api_key="your_api_key_here"; password="changeme"; secret="${process.env.X}"; token="o=V.href)),z&&(A.delete("');
  assert.equal(s.filter((x) => x.type.startsWith('Generic')).length, 0);
});

test('coverage: detects OpenAI / Anthropic / Stripe-webhook / Sentry-DSN', () => {
  const js = [
    'k1="sk-proj-' + 'A'.repeat(24) + 'T3BlbkFJ' + 'B'.repeat(24) + '"',
    'k2="sk-ant-api03-' + 'c'.repeat(40) + '"',
    'k3="whsec_' + 'd'.repeat(40) + '"',
    'k4="https://' + 'a'.repeat(32) + '@o1.ingest.sentry.io/123"',
  ].join(';');
  const names = extractSecrets(js).map((x) => x.type);
  assert.ok(names.some((n) => n.startsWith('OpenAI API Key')));
  assert.ok(names.includes('Anthropic API Key'));
  assert.ok(names.includes('Stripe Webhook Secret'));
  assert.ok(names.includes('Sentry DSN'));
});

test('strict: context gate suppresses ambiguous patterns without the provider keyword', () => {
  // a bare AC+32hex is NOT a Twilio SID unless "twilio" appears in the file
  const noCtx = extractSecrets('var x="AC' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' + '";');
  assert.ok(!noCtx.some((s) => s.type === 'Twilio Account SID'), 'no twilio keyword → suppressed');
  const withCtx = extractSecrets('// twilio config\nvar x="AC' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' + '";');
  assert.ok(withCtx.some((s) => s.type === 'Twilio Account SID'), 'twilio keyword present → reported');
});

test('strict: reject filter drops pure-hex hashes from the high-entropy rule', () => {
  const s = extractSecrets('const secret = "' + 'a1b2c3d4e5f6a7b8'.repeat(2) + 'deadbeefdeadbeef" ');
  assert.ok(!s.some((x) => x.type === 'High-Entropy Secret'), 'pure hex is an asset hash, not a secret');
  // cross-type dedup keeps the strongest rule for a value, so just assert it's detected
  const real = extractSecrets('const secret = "Xy9_Kp2mNq4Rs7Tv0Wz3Ab6Cd8Ef1Gh5Jk"');
  assert.ok(real.some((x) => x.value.startsWith('Xy9_Kp2m')), 'mixed high-entropy secret reported');
});

test('juicy: path-traversal flagged on every link (no g-flag lastIndex drift)', () => {
  const r = analyzeJs('a="../../etc/passwd"; b="../xyz/q"; c="../admin/panel"');
  const trav = r.juicy.filter((j) => j.reasons.includes('path-traversal'));
  assert.ok(trav.length >= 3, 'all ../ links flagged, not just the first');
});

test('source maps are extracted and resolved against the file URL', () => {
  const js = 'console.log(1)\n//# sourceMappingURL=app.min.js.map';
  const sm = extractSourceMaps(js, 'https://t.com/static/app.min.js');
  assert.ok(sm.includes('https://t.com/static/app.min.js.map'));
});
