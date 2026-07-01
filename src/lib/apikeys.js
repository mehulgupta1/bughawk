// API-key registry for recon tools. Field sets mirror what each tool's repo
// actually consumes (subfinder provider-config.yaml providers, chaos CHAOS_KEY,
// findomain env tokens, and the single-key tools). Keys are stored locally in
// IndexedDB and never sent anywhere — this is just a vault + config generator.

export const API_TOOLS = [
  {
    id: 'subfinder',
    name: 'Subfinder',
    icon: '🌐',
    doc: 'https://github.com/projectdiscovery/subfinder#post-installation-instructions',
    desc: 'Passive subdomain enumeration. Keys live in provider-config.yaml — fill the sources you have.',
    exportKind: 'yaml',
    exportName: 'provider-config.yaml',
    fields: [
      { key: 'virustotal', label: 'VirusTotal', ph: 'apikey' },
      { key: 'securitytrails', label: 'SecurityTrails', ph: 'apikey' },
      { key: 'shodan', label: 'Shodan', ph: 'apikey' },
      { key: 'chaos', label: 'Chaos', ph: 'apikey' },
      { key: 'github', label: 'GitHub token(s)', ph: 'ghp_xxx, ghp_yyy', multi: true },
      { key: 'censys', label: 'Censys', ph: 'API_ID:API_SECRET' },
      { key: 'passivetotal', label: 'PassiveTotal', ph: 'username:apikey' },
      { key: 'fofa', label: 'FOFA', ph: 'email:apikey' },
      { key: 'intelx', label: 'IntelX', ph: 'host:apikey' },
      { key: 'binaryedge', label: 'BinaryEdge', ph: 'apikey' },
      { key: 'certspotter', label: 'CertSpotter', ph: 'apikey' },
      { key: 'fullhunt', label: 'FullHunt', ph: 'apikey' },
      { key: 'hunter', label: 'Hunter', ph: 'apikey' },
      { key: 'leakix', label: 'LeakIX', ph: 'apikey' },
      { key: 'netlas', label: 'Netlas', ph: 'apikey' },
      { key: 'quake', label: 'Quake', ph: 'apikey' },
      { key: 'bevigil', label: 'BeVigil', ph: 'apikey' },
      { key: 'builtwith', label: 'BuiltWith', ph: 'apikey' },
      { key: 'c99', label: 'C99', ph: 'apikey' },
      { key: 'whoisxmlapi', label: 'WhoisXML API', ph: 'apikey' },
      { key: 'zoomeyeapi', label: 'ZoomEye', ph: 'apikey' },
      { key: 'threatbook', label: 'ThreatBook', ph: 'apikey' },
      { key: 'dnsdb', label: 'DNSDB', ph: 'apikey' },
    ],
  },
  {
    id: 'chaos',
    name: 'Chaos',
    icon: '🌪',
    doc: 'https://github.com/projectdiscovery/chaos-client',
    desc: 'ProjectDiscovery Chaos dataset. Consumed from the CHAOS_KEY environment variable.',
    exportKind: 'env',
    env: { CHAOS_KEY: 'key' },
    fields: [{ key: 'key', label: 'Chaos API key', ph: 'apikey' }],
  },
  {
    id: 'findomain',
    name: 'Findomain',
    icon: '🔎',
    doc: 'https://github.com/Findomain/Findomain#access-tokens-configuration',
    desc: 'Subdomain finder. Tokens are read from environment variables.',
    exportKind: 'env',
    env: {
      findomain_fb_token: 'facebook',
      findomain_virustotal_token: 'virustotal',
      findomain_securitytrails_token: 'securitytrails',
      findomain_spyse_token: 'spyse',
    },
    fields: [
      { key: 'facebook', label: 'Facebook CT token', ph: 'APPID|APPSECRET' },
      { key: 'virustotal', label: 'VirusTotal', ph: 'apikey' },
      { key: 'securitytrails', label: 'SecurityTrails', ph: 'apikey' },
      { key: 'spyse', label: 'Spyse (deprecated)', ph: 'token' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    doc: 'https://github.com/settings/tokens',
    desc: 'Personal access token(s) — used for GitHub dorking and tools that hit the GitHub API.',
    exportKind: 'env',
    env: { GITHUB_TOKEN: 'token' },
    fields: [{ key: 'token', label: 'GitHub PAT(s)', ph: 'ghp_xxx, ghp_yyy', multi: true }],
  },
  {
    id: 'shodan',
    name: 'Shodan',
    icon: '🛰',
    doc: 'https://github.com/achillean/shodan-python',
    desc: 'Shodan API key. (shodan init <key>, or SHODAN_API_KEY env.)',
    exportKind: 'env',
    env: { SHODAN_API_KEY: 'key' },
    fields: [{ key: 'key', label: 'Shodan API key', ph: 'apikey' }],
  },
  {
    id: 'virustotal',
    name: 'VirusTotal',
    icon: '🧪',
    doc: 'https://docs.virustotal.com/docs/api-overview',
    desc: 'VirusTotal API key — used by subfinder, findomain and direct lookups.',
    exportKind: 'env',
    env: { VT_API_KEY: 'key' },
    fields: [{ key: 'key', label: 'VirusTotal API key', ph: 'apikey' }],
  },
];

export const TOOL_BY_ID = Object.fromEntries(API_TOOLS.map((t) => [t.id, t]));

// split a possibly comma/space/newline separated value into a list
function listOf(v) {
  return String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

// subfinder provider-config.yaml from the subfinder field values
export function toSubfinderYaml(values = {}) {
  const tool = TOOL_BY_ID.subfinder;
  const lines = [];
  for (const f of tool.fields) {
    const items = listOf(values[f.key]);
    if (!items.length) continue;
    lines.push(`${f.key}:`);
    for (const it of items) lines.push(`  - ${it}`);
  }
  return lines.length ? lines.join('\n') + '\n' : '# fill in some keys first\n';
}

// `export NAME=value` lines for a tool's env mapping
export function toEnv(toolId, values = {}) {
  const tool = TOOL_BY_ID[toolId];
  if (!tool || !tool.env) return '';
  const out = [];
  for (const [envName, fieldKey] of Object.entries(tool.env)) {
    const v = (values[fieldKey] || '').trim();
    if (v) out.push(`export ${envName}="${v}"`);
  }
  return out.join('\n');
}

// count of filled fields for a tool (for the tab badge)
export function filledCount(tool, values = {}) {
  return tool.fields.reduce((n, f) => n + ((values[f.key] || '').trim() ? 1 : 0), 0);
}
