// Smart auto-flagging: hosts whose name contains a "juicy" keyword get an
// automatic indicator (distinct from the user's manual star/tags).

export const DEFAULT_KEYWORDS = [
  'admin', 'staging', 'dev', 'internal', 'test', 'vpn', 'git', 'jenkins',
  'grafana', 'kibana', 'api', 'backup', 'old', 'beta',
];

// Returns the first matching keyword for a host, or null.
export function matchKeyword(host, keywords) {
  if (!host || !keywords || !keywords.length) return null;
  const h = host.toLowerCase();
  for (const k of keywords) {
    if (k && h.includes(k)) return k;
  }
  return null;
}
