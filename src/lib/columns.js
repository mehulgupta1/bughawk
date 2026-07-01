// Dynamic column system: the visible data columns adapt to whatever fields the
// imported data actually contains (per project). Host + Status are pinned and
// rendered specially by the table; everything here is the *data* columns in
// between, plus the canonical few we always understand.

// Canonical data columns we know how to read off the record top-level.
const CANON = [
  { key: 'title', label: 'Title', type: 'string', get: (r) => r.title },
  { key: 'cname', label: 'CNAME', type: 'string', get: (r) => (r.fields && r.fields.cname) || r.cname },
  { key: 'ip', label: 'IP', type: 'string', get: (r) => r.ip },
  { key: 'tech', label: 'Tech Stack', type: 'array', get: (r) => r.tech },
  { key: 'length', label: 'Length', type: 'number', get: (r) => r.length },
];
const CANON_KEYS = new Set(CANON.map((c) => c.key));

// Field keys that just duplicate canonical data — don't surface twice.
const ALIASES = new Set([
  'status', 'status_code', 'statusCode', 'host', 'domain', 'title', 'tech',
  'technologies', 'length', 'content_length', 'contentLength', 'ip', 'a',
  'failed', 'timestamp', 'time',
]);

const LABELS = {
  ip: 'IP', cname: 'CNAME', webserver: 'Server', content_length: 'Length',
  status_code: 'Status', favicon: 'Favicon', hash: 'Hash', words: 'Words',
  lines: 'Lines', location: 'Redirect', cdn_name: 'CDN', cdn: 'CDN',
  content_type: 'Content-Type', method: 'Method', scheme: 'Scheme', port: 'Port',
};

function humanize(key) {
  if (LABELS[key]) return LABELS[key];
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nonEmpty(v) {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// Compute the data columns available for a set of records (memoize at callsite).
// Detection samples up to SAMPLE records — which fields *exist* is stable enough
// that scanning all 100k on every edit isn't worth the main-thread cost.
const SAMPLE = 4000;

export function getAvailableColumns(records) {
  const cols = [];
  const sample = records.length > SAMPLE ? records.slice(0, SAMPLE) : records;

  // canonical present?
  for (const c of CANON) {
    if (sample.some((r) => nonEmpty(c.get(r)))) cols.push({ ...c, source: 'canonical' });
  }

  // dynamic field keys (from full parsed JSONL objects)
  const seen = new Map(); // key -> { allNumber, anyArray }
  for (const r of sample) {
    const f = r.fields;
    if (!f) continue;
    for (const k of Object.keys(f)) {
      if (CANON_KEYS.has(k) || ALIASES.has(k)) continue;
      const v = f[k];
      if (!nonEmpty(v)) continue;
      const meta = seen.get(k) || { allNumber: true, anyArray: false };
      if (Array.isArray(v)) meta.anyArray = true;
      else if (typeof v !== 'number') meta.allNumber = false;
      seen.set(k, meta);
    }
  }
  for (const [key, meta] of seen) {
    const type = meta.anyArray ? 'array' : meta.allNumber ? 'number' : 'string';
    cols.push({
      key,
      label: humanize(key),
      type,
      source: 'field',
      get: (r) => r.fields && r.fields[key],
    });
  }
  return cols;
}

// Default-visible data columns (spec: minimal — Status + Host pinned, Title on).
export const DEFAULT_VISIBLE = ['title', 'cname', 'tech', 'ip'];

export function formatScalar(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
