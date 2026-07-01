// scope.js — the scope rule engine. Pure, never throws.
//
// A scope rule has a typed pattern and an in/out designation. Matching rule:
// OUT-of-scope always wins over IN. A target matching no rule is "unknown" —
// that gap is intentional and surfaced as the coverage report.
//
// Rule kinds (auto-detected from the pattern):
//   wildcard  '*.example.com'   → subdomains only (NOT the apex)
//   host      'admin.example.com'→ exact host
//   cidr      '203.0.113.0/24'  → IP within range
//   regex     '/admin/.*'       → matched against the full target string

export const IN = 'in';
export const OUT = 'out';
export const UNKNOWN = 'unknown';

let _id = 0;
function rid() {
  return `s${Date.now().toString(36)}${(_id++).toString(36)}`;
}

// Strip scheme/path/port, lowercase. Keeps IPs and hostnames.
export function normalizeTarget(raw) {
  if (!raw) return '';
  let h = String(raw).trim();
  h = h.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  h = h.replace(/^[^@/]*@/, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/:\d+$/, '');
  h = h.replace(/\.+$/, '');
  return h.toLowerCase();
}

const IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const CIDR_RE = /^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/;

export function detectKind(pattern) {
  const p = String(pattern || '').trim();
  if (CIDR_RE.test(p)) return 'cidr';
  if (p.startsWith('*.')) return 'wildcard';
  if (p.startsWith('/') || /[\\^$()[\]{}+?]/.test(p)) return 'regex';
  if (p.includes('/')) return 'regex'; // a URL path pattern
  return 'host';
}

// Build a normalized rule from a raw pattern + scope ('in'|'out').
export function makeRule(pattern, scope = IN, extra = {}) {
  const kind = detectKind(pattern);
  let pat = String(pattern || '').trim();
  if (kind === 'host' || kind === 'wildcard') pat = normalizeTarget(pat.replace(/^\*\./, '')) ;
  if (kind === 'wildcard') pat = `*.${pat}`;
  return {
    id: rid(),
    kind,
    pattern: kind === 'cidr' || kind === 'regex' ? String(pattern).trim() : pat,
    scope: scope === OUT ? OUT : IN,
    note: extra.note || '',
    tier: extra.tier || '',
  };
}

// ---- matching ----

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

// Describe a CIDR: host count + first/last address. Returns null if invalid.
export function cidrInfo(cidr) {
  const c = String(cidr || '').trim();
  if (!CIDR_RE.test(c)) return null;
  const [range, bitsRaw] = c.split('/');
  const bits = parseInt(bitsRaw, 10);
  const base = ipToInt(range);
  if (base == null || Number.isNaN(bits) || bits < 0 || bits > 32) return null;
  const size = bits === 0 ? 2 ** 32 : 2 ** (32 - bits);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (base & mask) >>> 0;
  const last = (network + size - 1) >>> 0;
  return { bits, count: size, first: intToIp(network), last: intToIp(last) };
}

export function ipInCidr(ip, cidr) {
  if (!IP_RE.test(ip)) return false;
  const [range, bitsRaw] = cidr.split('/');
  const bits = parseInt(bitsRaw, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const a = ipToInt(ip);
  const b = ipToInt(range);
  if (a == null || b == null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function ruleMatches(rule, target, rawTarget) {
  switch (rule.kind) {
    case 'cidr':
      return ipInCidr(target, rule.pattern);
    case 'wildcard': {
      const base = rule.pattern.slice(2); // strip '*.'
      return target.endsWith(`.${base}`);
    }
    case 'host':
      return target === rule.pattern;
    case 'regex':
      try {
        const body = rule.pattern.replace(/^\/(.*)\/$/, '$1');
        return new RegExp(body, 'i').test(rawTarget) || new RegExp(body, 'i').test(target);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// Resolve a target's scope. OUT wins over IN; no match → UNKNOWN.
// Returns { scope, rule } where rule is the deciding rule (or null).
export function matchScope(rawTarget, rules) {
  const target = normalizeTarget(rawTarget);
  if (!target || !rules || !rules.length) return { scope: UNKNOWN, rule: null };
  let inHit = null;
  for (const r of rules) {
    if (ruleMatches(r, target, String(rawTarget).toLowerCase())) {
      if (r.scope === OUT) return { scope: OUT, rule: r }; // out wins immediately
      if (!inHit) inHit = r;
    }
  }
  return inHit ? { scope: IN, rule: inHit } : { scope: UNKNOWN, rule: null };
}

// Convenience: just the scope label.
export function scopeOf(rawTarget, rules) {
  return matchScope(rawTarget, rules).scope;
}

// ---- program-scope paste parser (HackerOne / Bugcrowd / Intigriti / plain) ----

const OUT_RE = /out[\s_-]?of[\s_-]?scope|ineligible|excluded|not in scope/i;
const IN_RE = /\bin[\s_-]?scope\b|\beligible\b/i;
// Lines that are table headers / metadata noise we should skip.
const NOISE_RE = /^(asset|identifier|type|category|severity|max|bounty|tier|eligible|created|updated|instruction|coverage|target)s?\b/i;
const ASSET_RE = /((?:\*\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\d{1,2})?|\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|https?:\/\/\S+)/i;

// Parse a pasted scope blob into rules. Section headers ("Out of scope") flip
// the active scope; inline keywords on a row override it.
export function parseScopeText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rules = [];
  const seen = new Set();
  let section = IN; // default assume in-scope until told otherwise

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header? (a short line that is essentially just the keyword)
    const isShort = line.length <= 24 && line.split(/\s+/).length <= 4;
    if (isShort && OUT_RE.test(line) && !ASSET_RE.test(line)) { section = OUT; continue; }
    if (isShort && IN_RE.test(line) && !ASSET_RE.test(line)) { section = IN; continue; }

    if (NOISE_RE.test(line) && !ASSET_RE.test(line)) continue;

    const m = line.match(ASSET_RE);
    if (!m) continue;
    const pattern = m[1];

    // Row-level scope: inline keyword beats the active section.
    let scope = section;
    if (OUT_RE.test(line)) scope = OUT;
    else if (IN_RE.test(line)) scope = IN;

    const rule = makeRule(pattern, scope);
    const key = `${rule.kind}:${rule.pattern}:${rule.scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }
  return rules;
}

// Merge new rules into existing, de-duping by kind+pattern (new scope wins).
export function mergeRules(existing, incoming) {
  const byKey = new Map();
  for (const r of existing) byKey.set(`${r.kind}:${r.pattern}`, r);
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    const k = `${r.kind}:${r.pattern}`;
    if (byKey.has(k)) {
      const prev = byKey.get(k);
      if (prev.scope !== r.scope) { byKey.set(k, { ...prev, scope: r.scope }); updated++; }
    } else {
      byKey.set(k, r);
      added++;
    }
  }
  return { rules: [...byKey.values()], added, updated };
}

// ---- scope diff (old rules vs new rules) ----

export function diffScope(oldRules, newRules) {
  const key = (r) => `${r.kind}:${r.pattern}`;
  const oldMap = new Map((oldRules || []).map((r) => [key(r), r]));
  const newMap = new Map((newRules || []).map((r) => [key(r), r]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [k, r] of newMap) {
    if (!oldMap.has(k)) added.push(r);
    else if (oldMap.get(k).scope !== r.scope) changed.push({ from: oldMap.get(k), to: r });
  }
  for (const [k, r] of oldMap) if (!newMap.has(k)) removed.push(r);
  return { added, removed, changed };
}

// ---- coverage over discovered hosts ----

// hosts: array of host strings. Returns counts + the unknown list (gap).
export function coverage(hosts, rules) {
  const uniq = [...new Set((hosts || []).filter(Boolean))];
  let inC = 0, outC = 0;
  const unknown = [];
  for (const h of uniq) {
    const s = scopeOf(h, rules);
    if (s === IN) inC++;
    else if (s === OUT) outC++;
    else unknown.push(h);
  }
  return { total: uniq.length, in: inC, out: outC, unknown };
}
