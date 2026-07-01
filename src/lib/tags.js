// Colored tag labels + audit statuses for subdomain records.

export const TAGS = [
  { key: 'interesting', label: 'interesting' },
  { key: 'login', label: 'login' },
  { key: 'api', label: 'api' },
  { key: 'cdn', label: 'cdn' },
  { key: 'oos', label: 'out-of-scope' },
];

export const TAG_MAP = Object.fromEntries(TAGS.map((t) => [t.key, t]));

export const AUDIT_OPTIONS = [
  { key: 'untested', label: 'Untested' },
  { key: 'tested', label: 'Tested' },
  { key: 'vulnerable', label: 'Vulnerable' },
];
