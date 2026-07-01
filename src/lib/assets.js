// assets.js — pure helpers for the Assets vault: line classification (auto-route),
// host extraction, and normalization. No side effects, never throws.

// Decide which bucket a raw line belongs to.
//   *.js (with or without query)        -> 'jsfiles'
//   has scheme / path / query           -> 'urls'
//   bare domain-looking token           -> 'subdomains'
//   anything else                        -> 'urls' (safe default)
export function classifyLine(line) {
  const t = String(line || '').trim();
  if (!t) return null;
  const noQuery = t.split('?')[0].split('#')[0];
  if (/\.m?js$/i.test(noQuery)) return 'jsfiles';
  if (/:\/\//.test(t) || t.includes('/') || t.includes('?')) return 'urls';
  // bare token: looks like a hostname (has a dot, no spaces)
  if (/^[a-z0-9*]([a-z0-9.-]*[a-z0-9])?$/i.test(t) && t.includes('.')) return 'subdomains';
  return 'urls';
}

// Extract the host from a URL or host string (strip scheme/userinfo/path/port).
export function extractHost(raw) {
  if (!raw) return '';
  let h = String(raw).trim();
  h = h.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  h = h.replace(/^[^@/]*@/, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/:\d+$/, '');
  h = h.replace(/\.+$/, '');
  return h.toLowerCase();
}

// Normalize a single value per the chosen options.
export function normalizeValue(v, opts = {}) {
  let s = String(v || '').trim();
  if (opts.stripScheme) s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  if (opts.dropPort) s = s.replace(/:(\d+)(\/|$|\?)/, '$2');
  if (opts.stripWww) s = s.replace(/^www\./i, '').replace(/:\/\/www\./i, '://');
  if (opts.lowercase) s = s.toLowerCase();
  return s;
}

// Normalize + dedupe a list of item values. Returns deduped string array.
export function normalizeList(values, opts = {}) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    let s = normalizeValue(v, opts);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  if (opts.sort) out.sort((a, b) => a.localeCompare(b));
  return out;
}

// Split a raw blob into [host or url] lines (trim, drop blanks/comments).
export function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}
