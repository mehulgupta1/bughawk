import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFromResponse } from './techstack.js';

test('detects server + version, CDN/WAF, backend, frontend, cloud, db', () => {
  const raw = [
    'HTTP/1.1 200 OK',
    'Server: nginx/1.18.0',
    'X-Powered-By: Express',
    'CF-RAY: 7abc-DEL',
    'Set-Cookie: connect.sid=xyz; Path=/',
    '',
    '<html><script src="/_next/static/x.js"></script>__NEXT_DATA__ react-dom.production.min.js',
    'img: https://assets.s3.amazonaws.com/logo.png  MongoError: failed',
  ].join('\n');
  const got = detectFromResponse(raw);
  const find = (cat, name) => got.find((d) => d.cat === cat && d.name.startsWith(name));

  assert.equal(find('server', 'Nginx').version, '1.18.0');
  assert.ok(find('cdn', 'Cloudflare'));
  assert.ok(find('waf', 'Cloudflare WAF'));
  assert.ok(find('backend', 'Node.js / Express'));
  assert.ok(find('frontend', 'Next.js'));
  assert.ok(find('frontend', 'React'));
  assert.ok(find('cloud', 'AWS (S3)'));
  assert.ok(find('database', 'MongoDB'));
});

test('extracts Angular and jQuery versions from body', () => {
  const raw = 'HTTP/1.1 200 OK\n\n<app ng-version="15.2.1"></app><script src="/js/jquery-3.6.0.min.js"></script>';
  const got = detectFromResponse(raw);
  assert.equal(got.find((d) => d.name === 'Angular').version, '15.2.1');
  assert.equal(got.find((d) => d.name === 'jQuery').version, '3.6.0');
});

test('no false stack on a bare response', () => {
  const got = detectFromResponse('HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello');
  assert.equal(got.length, 0);
});
