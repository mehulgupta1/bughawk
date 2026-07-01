import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUES, TECHNIQUE_COUNT } from './techniques.js';
import { parseRequest, parseResponse, analyzeRequest, analyzeResponse } from './httpanalyzer.js';

test('ships 500+ techniques', () => {
  assert.ok(TECHNIQUE_COUNT >= 500, `only ${TECHNIQUE_COUNT} techniques`);
  assert.ok(TECHNIQUES.every((t) => t.cat && t.t));
});

test('parseRequest splits start line, headers, body', () => {
  const raw = 'POST /login?next=https://evil.com HTTP/1.1\nHost: t.com\nContent-Type: application/x-www-form-urlencoded\nCookie: s=1\n\nuser=a&pass=b';
  const r = parseRequest(raw);
  assert.equal(r.method, 'POST');
  assert.equal(r.headers.host, 't.com');
  assert.equal(r.body, 'user=a&pass=b');
  assert.ok(r.query.includes('next='));
});

test('analyzeResponse flags missing headers, insecure cookie, CORS, body leak', () => {
  const raw = 'HTTP/1.1 200 OK\nContent-Type: text/html\nSet-Cookie: session=abc; Path=/\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true\n\nkey AKIAIOSFODNN7EXAMPLE';
  const f = analyzeResponse(parseResponse(raw));
  const titles = f.map((x) => x.title).join(' | ');
  assert.ok(/Missing HSTS/.test(titles));
  assert.ok(/not Secure|not HttpOnly/.test(titles));
  assert.ok(/CORS/.test(titles));
  assert.ok(f.some((x) => x.sev === 'critical'), 'AWS key should be critical');
});

test('analyzeRequest flags injectable param, CSRF, secret-in-url', () => {
  const raw = 'POST /search?q=<script>alert(1)</script>&token=abcdefghijklmnopqrst HTTP/1.1\nHost: t.com\nCookie: s=1\n\n';
  const f = analyzeRequest(parseRequest(raw));
  const titles = f.map((x) => x.title).join(' | ');
  assert.ok(/Injectable param/.test(titles));
  assert.ok(/CSRF/.test(titles));
  assert.ok(/Secret in URL/.test(titles));
});

test('analyzeRequest decodes a bad JWT in Authorization', () => {
  const tok = Buffer.from('{"alg":"none"}').toString('base64').replace(/=+$/, '') + '.' + Buffer.from('{"sub":"1"}').toString('base64').replace(/=+$/, '') + '.';
  const raw = `GET /me HTTP/1.1\nHost: t.com\nAuthorization: Bearer ${tok}\n\n`;
  const f = analyzeRequest(parseRequest(raw));
  assert.ok(f.some((x) => /JWT in Authorization/.test(x.title) && x.sev === 'high'));
});
