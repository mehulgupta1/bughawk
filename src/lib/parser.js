// parser.js — turn raw pasted scan output into subdomain records.
//
// Supported formats (tried in this order, per line, never throws):
//   1. httpx bracket:        https://sub.example.com [200]
//   2. httpx with extras:    https://sub.example.com [200] [Title] [tech1,tech2]
//   3. CSV:                  sub.example.com,200  |  sub.example.com,200,Title
//   4. JSON Lines:           {"url":"https://...","status_code":200,"title":"..","tech":[..]}
//   5. Plain domain:         sub.example.com               -> status "unknown"
//
// A line that matches nothing usable yields { host, status: 'unknown' } when a
// host can still be extracted, otherwise it is dropped (returned as null).

export const UNKNOWN = 'unknown';

// Strip scheme, path, query, port, trailing dots and lowercase.
export function normalizeHost(raw) {
  if (!raw) return '';
  let h = String(raw).trim();
  h = h.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ''); // scheme
  h = h.replace(/^[^@]*@/, ''); // userinfo
  h = h.split('/')[0].split('?')[0].split('#')[0]; // path/query/frag
  h = h.replace(/:\d+$/, ''); // port
  h = h.replace(/\.+$/, ''); // trailing dot
  return h.toLowerCase();
}

function toStatus(val) {
  if (val == null || val === '') return UNKNOWN;
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 100 || n > 599) return UNKNOWN;
  return n;
}

function cleanTech(val) {
  if (Array.isArray(val)) return val.map((t) => String(t).trim()).filter(Boolean);
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

// ---- per-format parsers: return a partial record or null ----

function parseJsonLine(line) {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  let obj;
  try {
    obj = JSON.parse(t);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const host = normalizeHost(obj.url || obj.host || obj.input || obj.domain || '');
  if (!host) return null;
  const ip =
    obj.ip ||
    (Array.isArray(obj.a) && obj.a.length ? obj.a[0] : null) ||
    obj.host_ip ||
    null;
  // Keep the FULL parsed object as `fields` (minus the noisy raw url/input keys)
  // so dynamic columns can surface whatever httpx flags produced.
  const fields = { ...obj };
  delete fields.url;
  delete fields.input;
  return {
    host,
    status: toStatus(obj.status_code ?? obj.status ?? obj.statusCode),
    title: (obj.title || '').toString().trim(),
    tech: cleanTech(obj.tech || obj.technologies),
    length: numOrNull(obj.content_length ?? obj.length ?? obj.contentLength),
    ip,
    fields,
  };
}

function parseBracket(line) {
  // first token is a url/host, followed by one or more [..] groups
  const t = line.trim();
  if (!t.includes('[')) return null;
  const firstBracket = t.indexOf('[');
  const head = t.slice(0, firstBracket).trim();
  const host = normalizeHost(head.split(/\s+/)[0]);
  if (!host) return null;
  const groups = [];
  const re = /\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(t)) !== null) groups.push(m[1].trim());
  // groups[0] is conventionally the status code
  const status = toStatus(groups[0]);
  let title = '';
  let tech = [];
  let length = null;
  // Heuristic: a group that is purely numeric & not the status -> length.
  // A comma-list or known-ish token -> tech. Otherwise the first leftover -> title.
  for (let i = 1; i < groups.length; i++) {
    const g = groups[i];
    if (!g) continue;
    if (/^\d+$/.test(g)) {
      if (length == null) length = parseInt(g, 10);
      continue;
    }
    if (g.includes(',')) {
      tech = tech.concat(cleanTech(g));
      continue;
    }
    if (!title) title = g;
    else tech.push(g);
  }
  return { host, status, title, tech, length };
}

function parseCsv(line) {
  const t = line.trim();
  if (!t.includes(',')) return null;
  const parts = splitCsv(t);
  const host = normalizeHost(parts[0]);
  if (!host) return null;
  return {
    host,
    status: toStatus(parts[1]),
    title: (parts[2] || '').trim(),
    tech: cleanTech(parts[3]),
    length: numOrNull(parts[4]),
  };
}

function parsePlain(line) {
  const host = normalizeHost(line.trim().split(/\s+/)[0]);
  if (!host || !host.includes('.')) return null;
  return { host, status: UNKNOWN, title: '', tech: [], length: null };
}

// ---- helpers ----

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// Minimal CSV field splitter that respects double-quoted fields.
function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Parse a single line -> partial record (no id/meta) or null.
export function parseLine(line) {
  if (line == null) return null;
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  return (
    parseJsonLine(t) || parseBracket(t) || parseCsv(t) || parsePlain(t) || null
  );
}

// Parse a whole blob. Returns { records, stats }.
// records have no id (caller assigns / merges).
export function parseText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const records = [];
  let parsed = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const rec = parseLine(line);
    if (rec) {
      records.push(rec);
      parsed++;
    } else {
      skipped++;
    }
  }
  return {
    records,
    stats: { total: parsed + skipped, parsed, skipped },
  };
}

// Count non-empty, non-comment lines (for the live row count in the modal).
export function countLines(text) {
  let n = 0;
  const lines = String(text || '').split(/\r?\n/);
  for (const l of lines) {
    const t = l.trim();
    if (t && !t.startsWith('#')) n++;
  }
  return n;
}
