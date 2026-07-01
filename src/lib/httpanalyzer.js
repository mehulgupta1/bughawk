// HTTP request/response analyzer. Parses raw HTTP text and runs a large set of
// security checks, returning findings tagged with a technique category so the UI
// can surface relevant techniques. Reuses the URL-parser engine for injection
// point + JWT detection.
import { CATEGORIES, analyzeJwt } from '../components/UrlParser/engine.js';

const SEV_ORDER = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

// ---- parsing ----
export function parseRequest(raw) {
  const text = (raw || '').replace(/\r\n/g, '\n');
  const sep = text.indexOf('\n\n');
  const head = sep === -1 ? text : text.slice(0, sep);
  const body = sep === -1 ? '' : text.slice(sep + 2);
  const lines = head.split('\n');
  const start = (lines.shift() || '').trim();
  const m = start.match(/^([A-Z]+)\s+(\S+)\s+(HTTP\/[\d.]+)/i);
  const headers = {};
  for (const l of lines) {
    const i = l.indexOf(':');
    if (i === -1) continue;
    headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  const method = m ? m[1].toUpperCase() : '';
  const path = m ? m[2] : start;
  const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  return { method, path, query, httpVersion: m ? m[3] : '', headers, body };
}

export function parseResponse(raw) {
  const text = (raw || '').replace(/\r\n/g, '\n');
  const sep = text.indexOf('\n\n');
  const head = sep === -1 ? text : text.slice(0, sep);
  const body = sep === -1 ? '' : text.slice(sep + 2);
  const lines = head.split('\n');
  const start = (lines.shift() || '').trim();
  const status = (start.match(/\s(\d{3})\s/) || start.match(/\s(\d{3})$/) || [])[1] || '';
  const headers = {};
  const setCookies = [];
  for (const l of lines) {
    const i = l.indexOf(':');
    if (i === -1) continue;
    const k = l.slice(0, i).trim().toLowerCase();
    const v = l.slice(i + 1).trim();
    if (k === 'set-cookie') setCookies.push(v);
    else headers[k] = v;
  }
  return { status: Number(status) || 0, headers, setCookies, body };
}

// ---- secret / leak patterns for response bodies ----
const LEAKS = [
  [/AKIA[A-Z0-9]{16}/, 'critical', 'AWS access key id', 'secrets'],
  [/-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/, 'critical', 'Private key', 'auth'],
  [/AIza[A-Za-z0-9_\-]{35}/, 'high', 'Google API key', 'secrets'],
  [/sk_live_[A-Za-z0-9]{20,}/, 'critical', 'Stripe live secret key', 'secrets'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'high', 'GitHub token', 'secrets'],
  [/glpat-[A-Za-z0-9_\-]{20,}/, 'high', 'GitLab token', 'secrets'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'high', 'Slack token', 'secrets'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, 'medium', 'JWT in body', 'auth'],
  [/\b(?:SQL syntax|mysql_fetch|ORA-\d{5}|SQLSTATE|psql:|SQLite3::)/i, 'medium', 'SQL error leak', 'sqli'],
  [/\b(?:Traceback \(most recent call last\)|at [\w.$]+\([\w.]+:\d+\)|Exception in thread|stack trace)/i, 'medium', 'Stack trace / debug leak', 'logic'],
  [/\b(?:10|192\.168|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, 'low', 'Internal IP address', 'ssrf'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'info', 'Email address', 'logic'],
];

function add(findings, sev, title, detail, fix, cat) {
  findings.push({ sev, title, detail, fix, cat });
}

// ---- response analysis ----
export function analyzeResponse(res) {
  const f = [];
  const h = res.headers;
  const has = (k) => h[k] !== undefined;

  if (!has('strict-transport-security')) add(f, 'medium', 'Missing HSTS', 'No Strict-Transport-Security header.', 'Add HSTS with a long max-age + includeSubDomains.', 'headers');
  if (!has('content-security-policy')) add(f, 'medium', 'Missing CSP', 'No Content-Security-Policy header.', 'Add a restrictive CSP.', 'headers');
  else if (/unsafe-inline|unsafe-eval|\*/.test(h['content-security-policy'])) add(f, 'medium', 'Weak CSP', 'CSP allows unsafe-inline / unsafe-eval / wildcard.', 'Remove unsafe-* and wildcards; use nonces/hashes.', 'xss');
  if (h['x-content-type-options'] !== 'nosniff') add(f, 'low', 'Missing X-Content-Type-Options', 'nosniff not set -> MIME sniffing.', 'Set X-Content-Type-Options: nosniff.', 'headers');
  if (!has('x-frame-options') && !/frame-ancestors/i.test(h['content-security-policy'] || '')) add(f, 'medium', 'Clickjacking possible', 'No X-Frame-Options / frame-ancestors.', 'Set X-Frame-Options: DENY or CSP frame-ancestors.', 'csrf');
  if (!has('referrer-policy')) add(f, 'low', 'Missing Referrer-Policy', 'Tokens may leak via Referer.', 'Set Referrer-Policy: no-referrer / strict-origin.', 'headers');

  // Info disclosure
  if (h.server && /\d/.test(h.server)) add(f, 'low', 'Server version disclosure', `Server: ${h.server}`, 'Suppress version in Server header.', 'headers');
  for (const k of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-runtime', 'x-debug']) {
    if (has(k)) add(f, 'info', `Header leak: ${k}`, `${k}: ${h[k]}`, 'Remove debug/version headers.', 'headers');
  }

  // CORS
  const acao = h['access-control-allow-origin'];
  const acac = (h['access-control-allow-credentials'] || '').toLowerCase() === 'true';
  if (acao === '*' && acac) add(f, 'high', 'CORS misconfig', 'ACAO:* with credentials:true.', 'Never combine wildcard origin with credentials.', 'cors');
  else if (acao && acao !== '*' && acac) add(f, 'high', 'CORS reflects origin + credentials', `ACAO: ${acao} with credentials:true — verify it reflects arbitrary origins.`, 'Strictly allowlist origins.', 'cors');
  else if (acao === '*') add(f, 'medium', 'Permissive CORS', 'ACAO:* — fine only for public data.', 'Restrict if endpoint is authenticated.', 'cors');
  if ((h['access-control-allow-origin'] || '') === 'null') add(f, 'high', 'CORS allows null origin', 'Origin: null is exploitable from sandboxed iframes.', 'Do not allow null origin.', 'cors');

  // Cookies
  for (const c of res.setCookies) {
    const name = c.split('=')[0];
    const low = c.toLowerCase();
    if (!/;\s*secure/i.test(c)) add(f, 'medium', `Cookie not Secure: ${name}`, c, 'Add Secure flag.', 'auth');
    if (!/;\s*httponly/i.test(c)) add(f, 'medium', `Cookie not HttpOnly: ${name}`, c, 'Add HttpOnly to block JS theft.', 'auth');
    if (!/samesite/i.test(low)) add(f, 'low', `Cookie missing SameSite: ${name}`, c, 'Set SameSite=Lax/Strict.', 'csrf');
    else if (/samesite=none/i.test(low) && !/secure/i.test(low)) add(f, 'medium', `SameSite=None without Secure: ${name}`, c, 'SameSite=None requires Secure.', 'csrf');
  }

  // Caching of sensitive responses
  const cc = h['cache-control'] || '';
  if (res.setCookies.length && !/no-store|private/i.test(cc)) add(f, 'low', 'Sensitive response cacheable', 'Response sets cookies but is not no-store/private.', 'Set Cache-Control: no-store, private.', 'cache');

  // Content-Type
  if (h['content-type'] && !/charset/i.test(h['content-type'])) add(f, 'info', 'Content-Type without charset', h['content-type'], 'Specify charset to avoid sniffing.', 'headers');

  // Body leaks
  const body = res.body || '';
  for (const [re, sev, title, cat] of LEAKS) {
    const m = body.match(re);
    if (m) add(f, sev, `Body leak: ${title}`, m[0].slice(0, 80), 'Remove secret/error from response.', cat);
  }
  if (res.status >= 500) add(f, 'low', `Server error ${res.status}`, 'Verbose 5xx may leak internals.', 'Return generic errors; check stack traces.', 'logic');

  f.sort((a, b) => SEV_ORDER[b.sev] - SEV_ORDER[a.sev]);
  return f;
}

// ---- request analysis ----
const STATE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function analyzeRequest(req) {
  const f = [];
  const h = req.headers;
  const auth = h.authorization || '';

  if (/^basic /i.test(auth)) add(f, 'info', 'Basic auth in use', 'Credentials base64-encoded (not encrypted at app layer).', 'Ensure TLS; prefer tokens.', 'auth');
  const bearer = auth.match(/bearer\s+([A-Za-z0-9._-]+)/i);
  if (bearer) {
    const jwt = analyzeJwt(bearer[1]);
    if (jwt) {
      const bad = jwt.issues.filter((i) => /alg:none|forgeable|injection|expired/.test(i));
      add(f, bad.length ? 'high' : 'info', 'JWT in Authorization header', `alg:${jwt.alg}; ${jwt.issues.join('; ')}`, 'Verify signature, alg allowlist, expiry.', 'auth');
    }
  }

  // Injectable params (query + form body) via the URL-parser categories.
  let q = req.query || '';
  if (/application\/x-www-form-urlencoded/i.test(h['content-type'] || '') && req.body) q += (q ? '&' : '?') + req.body;
  if (q) {
    for (const cat of CATEGORIES) {
      if (cat.id === 'custom_regex' || !cat.params) continue;
      const hit = cat.valueCheck ? (cat.params.test(q) && cat.valueCheck.test(q))
        : cat.strict ? (cat.params.test(q) && cat.strict.test(q))
        : cat.params.test(q);
      if (hit) add(f, cat.sev === 'critical' ? 'high' : 'medium', `Injectable param: ${cat.label}`, 'A parameter matches this attack class — test it.', `See ${cat.id} techniques.`, cat.id);
    }
  }

  if (STATE_METHODS.has(req.method)) {
    const hasCsrf = /csrf|xsrf|_token/i.test(req.query + ' ' + req.body) || h['x-csrf-token'] || h['x-xsrf-token'];
    const cookieAuth = !!h.cookie;
    if (cookieAuth && !hasCsrf) add(f, 'medium', 'Possible CSRF', `${req.method} with cookie auth and no visible CSRF token.`, 'Use anti-CSRF tokens or SameSite cookies.', 'csrf');
  }

  if (/application\/xml|text\/xml/i.test(h['content-type'] || '') || /<\?xml/.test(req.body || '')) add(f, 'medium', 'XML body — XXE candidate', 'Server parses XML; test for XXE.', 'Disable external entities.', 'xxe');
  if (h['x-forwarded-for'] || h['x-forwarded-host'] || h['x-original-url'] || h['x-rewrite-url']) add(f, 'info', 'Proxy headers present', 'X-Forwarded-* / X-Original-URL — test trust & ACL bypass.', 'Do not trust client proxy headers.', 'bypass403');
  if (/[?&][^=]*(token|key|secret|password|jwt)=/i.test(req.query)) add(f, 'medium', 'Secret in URL query', 'Sensitive value in URL leaks via logs/Referer.', 'Move secrets to headers/body.', 'auth');

  f.sort((a, b) => SEV_ORDER[b.sev] - SEV_ORDER[a.sev]);
  return f;
}
