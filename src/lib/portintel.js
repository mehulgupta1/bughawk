// portintel.js — 100% offline intelligence layer for port records.
//
// Everything here is static lookup tables + pure functions. No network. The
// enrich() function derives severity, category, dangerous-config flags, known
// exploits, Nuclei suggestions and a recon checklist for a single record.
// Derived data is NOT persisted — change the rules here without migrating data.

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
export const SEVERITY_WEIGHT = { critical: 40, high: 20, medium: 8, low: 2, info: 0 };

export const CATEGORIES = [
  'Database', 'Remote Access', 'Web', 'Mail', 'File Transfer',
  'Directory', 'Cache / Queue', 'Container / Orchestration', 'VPN', 'Other',
];

// Canonical service knowledge base. Keyed by well-known port.
// nuclei[] = template tags to run next; recon[] = manual enumeration steps.
const SERVICE_DB = {
  21:    { service: 'ftp',        category: 'File Transfer',  severity: 'high',     nuclei: ['ftp', 'default-login'], recon: ['Try anonymous login: ftp <host>', 'Check writable dirs', 'Look for config/backup files'] },
  22:    { service: 'ssh',        category: 'Remote Access',  severity: 'low',      nuclei: ['ssh'],                  recon: ['Grab banner for version', 'Check weak ciphers/algos', 'Spray only with authorization'] },
  23:    { service: 'telnet',     category: 'Remote Access',  severity: 'critical', nuclei: ['telnet', 'default-login'], recon: ['Cleartext protocol — flag immediately', 'Test default creds'] },
  25:    { service: 'smtp',       category: 'Mail',           severity: 'medium',   nuclei: ['smtp'],                 recon: ['Test open relay', 'VRFY/EXPN user enum', 'Check STARTTLS'] },
  53:    { service: 'dns',        category: 'Directory',      severity: 'medium',   nuclei: ['dns'],                  recon: ['Attempt zone transfer (AXFR)', 'Check for cache snooping'] },
  80:    { service: 'http',       category: 'Web',            severity: 'low',      nuclei: ['tech-detect', 'cves'],  recon: ['Run nuclei web templates', 'Directory brute-force', 'Check for known CVEs by tech'] },
  88:    { service: 'kerberos',   category: 'Directory',      severity: 'medium',   nuclei: [],                       recon: ['User enumeration (kerbrute)', 'AS-REP roasting check'] },
  8000:  { service: 'http-alt',   category: 'Web',            severity: 'medium',   nuclei: ['tech-detect', 'cves'],  recon: ['Dev/app server?', 'Run web templates'] },
  110:   { service: 'pop3',       category: 'Mail',           severity: 'medium',   nuclei: ['pop3'],                 recon: ['Check STARTTLS', 'Test creds with authorization'] },
  111:   { service: 'rpcbind',    category: 'Other',          severity: 'medium',   nuclei: [],                       recon: ['rpcinfo -p <host>', 'Enumerate NFS exports'] },
  135:   { service: 'msrpc',      category: 'Remote Access',  severity: 'medium',   nuclei: [],                       recon: ['Enumerate RPC endpoints'] },
  139:   { service: 'netbios',    category: 'File Transfer',  severity: 'high',     nuclei: ['smb'],                  recon: ['enum4linux-ng', 'Null session check'] },
  143:   { service: 'imap',       category: 'Mail',           severity: 'medium',   nuclei: ['imap'],                 recon: ['Check STARTTLS', 'Test creds with authorization'] },
  389:   { service: 'ldap',       category: 'Directory',      severity: 'high',     nuclei: ['ldap'],                 recon: ['Anonymous bind check', 'Dump naming contexts'] },
  443:   { service: 'https',      category: 'Web',            severity: 'low',      nuclei: ['tech-detect', 'ssl', 'cves'], recon: ['Run nuclei web templates', 'Check TLS config & cert SANs', 'Directory brute-force'] },
  445:   { service: 'smb',        category: 'File Transfer',  severity: 'high',     nuclei: ['smb', 'ms17-010'],      recon: ['Check SMBv1 / MS17-010 (EternalBlue)', 'List shares with null session', 'enum4linux-ng'] },
  465:   { service: 'smtps',      category: 'Mail',           severity: 'low',      nuclei: ['smtp'],                 recon: ['Verify TLS', 'Test open relay'] },
  587:   { service: 'smtp',       category: 'Mail',           severity: 'medium',   nuclei: ['smtp'],                 recon: ['Open relay test', 'STARTTLS check'] },
  636:   { service: 'ldaps',      category: 'Directory',      severity: 'medium',   nuclei: ['ldap'],                 recon: ['Anonymous bind check over TLS'] },
  993:   { service: 'imaps',      category: 'Mail',           severity: 'low',      nuclei: ['imap'],                 recon: ['Verify TLS'] },
  995:   { service: 'pop3s',      category: 'Mail',           severity: 'low',      nuclei: ['pop3'],                 recon: ['Verify TLS'] },
  1433:  { service: 'mssql',      category: 'Database',       severity: 'critical', nuclei: ['mssql', 'default-login'], recon: ['Test sa / default creds', 'Check xp_cmdshell', 'Enumerate DBs'] },
  1521:  { service: 'oracle',     category: 'Database',       severity: 'critical', nuclei: ['oracle'],               recon: ['SID enumeration', 'Default creds (system/manager)'] },
  2049:  { service: 'nfs',        category: 'File Transfer',  severity: 'high',     nuclei: [],                       recon: ['showmount -e <host>', 'Mount exports, check perms'] },
  2375:  { service: 'docker',     category: 'Container / Orchestration', severity: 'critical', nuclei: ['docker'],   recon: ['Unauthenticated Docker API = RCE', 'docker -H <host>:2375 ps'] },
  2376:  { service: 'docker-tls', category: 'Container / Orchestration', severity: 'high',  nuclei: ['docker'],      recon: ['Check client-cert requirement'] },
  3000:  { service: 'http-alt',   category: 'Web',            severity: 'medium',   nuclei: ['tech-detect', 'grafana'], recon: ['Often Grafana/Node app', 'Run web templates'] },
  3306:  { service: 'mysql',      category: 'Database',       severity: 'critical', nuclei: ['mysql', 'default-login'], recon: ['Test root / empty password', 'Check remote access enabled', 'Enumerate DBs'] },
  3389:  { service: 'rdp',        category: 'Remote Access',  severity: 'high',     nuclei: ['rdp'],                  recon: ['Check NLA', 'BlueKeep (CVE-2019-0708)', 'Spray only with authorization'] },
  5432:  { service: 'postgres',   category: 'Database',       severity: 'critical', nuclei: ['postgres', 'default-login'], recon: ['Test postgres/postgres', 'Check trust auth', 'Enumerate DBs'] },
  5601:  { service: 'kibana',     category: 'Web',            severity: 'high',     nuclei: ['kibana'],               recon: ['Often unauthenticated', 'Check Elasticsearch behind it', 'Known RCE CVEs'] },
  5900:  { service: 'vnc',        category: 'Remote Access',  severity: 'high',     nuclei: ['vnc'],                  recon: ['Check no-auth VNC', 'Test weak passwords'] },
  5984:  { service: 'couchdb',    category: 'Database',       severity: 'critical', nuclei: ['couchdb'],              recon: ['Check admin party (no auth)', 'CVE-2017-12635 priv esc'] },
  6379:  { service: 'redis',      category: 'Cache / Queue',  severity: 'critical', nuclei: ['redis'],               recon: ['redis-cli -h <host> ping (no-auth = critical)', 'CONFIG GET dir → webshell/SSH key write', 'Module load RCE'] },
  6443:  { service: 'kubernetes', category: 'Container / Orchestration', severity: 'critical', nuclei: ['kubernetes'], recon: ['Anonymous API access check', 'kubectl --insecure-skip-tls-verify'] },
  8080:  { service: 'http-proxy', category: 'Web',            severity: 'medium',   nuclei: ['tech-detect', 'cves', 'log4j'], recon: ['Tomcat/Jenkins/proxy?', 'Test Log4Shell on inputs', 'Run web templates'] },
  8443:  { service: 'https-alt',  category: 'Web',            severity: 'medium',   nuclei: ['tech-detect', 'ssl', 'cves'], recon: ['Admin consoles often here', 'Run web templates'] },
  8081:  { service: 'http-alt',   category: 'Web',            severity: 'medium',   nuclei: ['tech-detect'],          recon: ['Run web templates'] },
  9000:  { service: 'http-alt',   category: 'Web',            severity: 'medium',   nuclei: ['tech-detect', 'sonarqube'], recon: ['SonarQube/PHP-FPM?', 'Run web templates'] },
  9200:  { service: 'elasticsearch', category: 'Database',    severity: 'critical', nuclei: ['elastic'],             recon: ['curl <host>:9200/_cat/indices (no-auth = critical)', 'Dump indices'] },
  10250: { service: 'kubelet',    category: 'Container / Orchestration', severity: 'critical', nuclei: ['kubernetes'], recon: ['Kubelet API — /pods, /exec', 'Anonymous auth check'] },
  11211: { service: 'memcached',  category: 'Cache / Queue',  severity: 'high',     nuclei: ['memcached'],            recon: ['stats command (no-auth)', 'Amplification/DDoS reflector', 'Dump keys'] },
  15672: { service: 'rabbitmq',   category: 'Cache / Queue',  severity: 'high',     nuclei: ['rabbitmq', 'default-login'], recon: ['guest/guest default login', 'Management UI exposure'] },
  27017: { service: 'mongodb',    category: 'Database',       severity: 'critical', nuclei: ['mongodb'],              recon: ['mongo <host> (no-auth = critical)', 'show dbs / dump collections'] },
  27018: { service: 'mongodb',    category: 'Database',       severity: 'critical', nuclei: ['mongodb'],              recon: ['Shard member — check auth'] },
  50070: { service: 'hadoop',     category: 'Database',       severity: 'high',     nuclei: ['hadoop'],               recon: ['HDFS namenode UI', 'Unauth file browse'] },
};

// Fallback category by service-name keyword (when port isn't well-known).
const CATEGORY_BY_NAME = [
  [/sql|mongo|redis|memcache|postgre|oracle|elastic|couch|cassandra|db/i, 'Database'],
  [/ssh|telnet|rdp|vnc|rlogin|winrm/i, 'Remote Access'],
  [/http|web|nginx|apache|tomcat|jetty|iis/i, 'Web'],
  [/smtp|imap|pop|mail/i, 'Mail'],
  [/ftp|smb|nfs|netbios|tftp/i, 'File Transfer'],
  [/ldap|dns|kerberos/i, 'Directory'],
  [/docker|kube|kubelet|containerd/i, 'Container / Orchestration'],
  [/vpn|ipsec|openvpn|wireguard|pptp/i, 'VPN'],
];

// Known public-exploit fingerprints. Linked out, never hosted here.
const EXPLOIT_RULES = [
  { test: (r) => r.port === 445, label: 'EternalBlue / MS17-010 (SMBv1 RCE)', url: 'https://www.exploit-db.com/search?q=ms17-010' },
  { test: (r) => r.port === 3389, label: 'BlueKeep CVE-2019-0708 (RDP RCE)', url: 'https://www.exploit-db.com/search?q=bluekeep' },
  { test: (r) => r.port === 6379, label: 'Redis unauth RCE (module/SSH-key/cron)', url: 'https://www.exploit-db.com/search?q=redis' },
  { test: (r) => r.port === 2375, label: 'Docker API unauth RCE', url: 'https://www.exploit-db.com/search?q=docker+api' },
  { test: (r) => [8080, 8443, 443].includes(r.port), label: 'Log4Shell CVE-2021-44228 (test inputs)', url: 'https://www.exploit-db.com/search?q=log4j' },
  { test: (r) => /jenkins/i.test(r.product), label: 'Jenkins script-console / known RCEs', url: 'https://www.exploit-db.com/search?q=jenkins' },
  { test: (r) => /tomcat/i.test(r.product), label: 'Tomcat (Ghostcat / manager deploy)', url: 'https://www.exploit-db.com/search?q=tomcat' },
  { test: (r) => /vsftpd/i.test(r.product) && /2\.3\.4/.test(r.version), label: 'vsftpd 2.3.4 backdoor', url: 'https://www.exploit-db.com/search?q=vsftpd+2.3.4' },
  { test: (r) => /proftpd/i.test(r.product), label: 'ProFTPD known RCEs', url: 'https://www.exploit-db.com/search?q=proftpd' },
  { test: (r) => /openssh/i.test(r.product) && /^[1-6]\./.test(r.version), label: 'OpenSSH user-enum / legacy CVEs', url: 'https://www.exploit-db.com/search?q=openssh' },
];

// Dangerous-config detectors — operate on parsed script output / banner / state.
const DANGEROUS_RULES = [
  {
    flag: 'Redis without authentication',
    severity: 'critical',
    test: (r) => r.port === 6379 && r.state.startsWith('open') &&
      (/no auth|NOAUTH|requirepass.{0,4}$/i.test(scriptBlob(r)) || !/auth/i.test(scriptBlob(r))) &&
      hasScript(r, 'redis-info'),
  },
  {
    flag: 'MongoDB no authentication',
    severity: 'critical',
    test: (r) => [27017, 27018].includes(r.port) && /no.?auth|unauthorized.{0,3}false|access control is not enabled/i.test(scriptBlob(r)),
  },
  {
    flag: 'Elasticsearch open (no auth)',
    severity: 'critical',
    test: (r) => r.port === 9200 && /"cluster_name"|\bindices\b/i.test(scriptBlob(r)),
  },
  {
    flag: 'FTP anonymous login allowed',
    severity: 'high',
    test: (r) => r.service === 'ftp' && /anonymous (login|ftp) allowed|ftp-anon/i.test(scriptBlob(r)),
  },
  {
    flag: 'Telnet exposed (cleartext)',
    severity: 'critical',
    test: (r) => r.service === 'telnet' && r.state.startsWith('open'),
  },
  {
    flag: 'SMBv1 / MS17-010 likely',
    severity: 'critical',
    test: (r) => /smbv1|VULNERABLE.*MS17-010|CVE-2017-0143/i.test(scriptBlob(r)),
  },
  {
    flag: 'VNC without authentication',
    severity: 'high',
    test: (r) => r.service === 'vnc' && /no authentication|security types:.*none/i.test(scriptBlob(r)),
  },
  {
    flag: 'Expired or self-signed TLS certificate',
    severity: 'low',
    test: (r) => /ssl-cert/i.test(scriptKeys(r)) && /self.?signed|expired/i.test(scriptBlob(r)),
  },
];

function scriptBlob(r) {
  if (!r.scripts) return r.banner || '';
  return Object.values(r.scripts).join('\n') + '\n' + (r.banner || '');
}
function scriptKeys(r) {
  return r.scripts ? Object.keys(r.scripts).join(',') : '';
}
function hasScript(r, id) {
  return !!(r.scripts && Object.keys(r.scripts).some((k) => k.includes(id)));
}

export function categoryOf(rec) {
  const known = SERVICE_DB[rec.port];
  if (known) return known.category;
  const name = `${rec.service} ${rec.product}`;
  for (const [re, cat] of CATEGORY_BY_NAME) if (re.test(name)) return cat;
  return 'Other';
}

// Non-standard port for a recognizable service (e.g. SSH on :2222) is itself
// noteworthy — attackers hide things on odd ports.
function nonStandardPort(rec) {
  if (!rec.service) return false;
  const std = Object.entries(SERVICE_DB).find(([, v]) => v.service === rec.service);
  return std ? Number(std[0]) !== rec.port : false;
}

// The core: derive everything for one record. Pure, cheap, memoize at callsite.
export function enrich(rec) {
  const known = SERVICE_DB[rec.port] || null;
  const category = categoryOf(rec);
  const open = rec.state && rec.state.startsWith('open');

  // Base severity from the service table, gated by state: a filtered port is
  // not an exposure. open|filtered is downgraded one notch (scanner uncertain).
  let baseSev = known ? known.severity : 'info';
  if (!open) baseSev = 'info';
  else if (rec.state === 'open|filtered') baseSev = downgrade(baseSev);

  // Dangerous-config detectors can raise severity.
  const dangerousFlags = [];
  let sev = baseSev;
  for (const rule of DANGEROUS_RULES) {
    try {
      if (rule.test(rec)) {
        dangerousFlags.push(rule.flag);
        if (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[sev]) sev = rule.severity;
      }
    } catch { /* never throw from a rule */ }
  }

  // CVE/KEV signal (filled by the async cve layer) can also raise severity.
  if (open) {
    if (rec.kev) sev = max(sev, 'critical');
    else if (Array.isArray(rec.cves) && rec.cves.some((c) => (c.cvss || 0) >= 9)) sev = max(sev, 'high');
    else if (Array.isArray(rec.cves) && rec.cves.length) sev = max(sev, 'medium');
  }

  const exploits = open ? EXPLOIT_RULES.filter((e) => { try { return e.test(rec); } catch { return false; } })
    .map((e) => ({ label: e.label, url: e.url })) : [];

  const nuclei = known ? known.nuclei : (category === 'Web' ? ['tech-detect', 'cves'] : []);
  const recon = known ? known.recon : [];
  const anomalies = [];
  if (nonStandardPort(rec)) anomalies.push(`${rec.service} on non-standard port ${rec.port}`);

  return { category, severity: sev, dangerousFlags, exploits, nuclei, recon, anomalies };
}

function downgrade(sev) {
  const i = SEVERITIES.indexOf(sev);
  return SEVERITIES[Math.min(i + 1, SEVERITIES.length - 1)];
}
function max(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// Attack-surface score 0–100 for a set of already-enriched records.
// Weighted sum of severities, squashed so a handful of criticals saturates it.
export function attackSurfaceScore(enriched) {
  let raw = 0;
  for (const e of enriched) raw += SEVERITY_WEIGHT[e.severity] || 0;
  const score = Math.round(100 * (1 - Math.exp(-raw / 80)));
  return Math.min(100, score);
}

export function scoreBand(score) {
  if (score >= 75) return { label: 'Critical exposure', sev: 'critical' };
  if (score >= 50) return { label: 'High exposure', sev: 'high' };
  if (score >= 25) return { label: 'Moderate exposure', sev: 'medium' };
  if (score > 0) return { label: 'Low exposure', sev: 'low' };
  return { label: 'No exposure', sev: 'info' };
}

// One-click follow-up commands for a record.
export function nextCommands(rec) {
  const cmds = [];
  const h = rec.host || rec.ip || '<host>';
  cmds.push({ label: 'Nmap service+scripts', cmd: `nmap -sCV -p${rec.port} ${h}` });
  const e = enrich(rec);
  if (e.nuclei.length) {
    cmds.push({ label: 'Nuclei', cmd: `nuclei -u ${schemeFor(rec)}${h}:${rec.port} -tags ${e.nuclei.join(',')}` });
  }
  if (e.category === 'Web') {
    cmds.push({ label: 'ffuf dir brute', cmd: `ffuf -u ${schemeFor(rec)}${h}:${rec.port}/FUZZ -w wordlist.txt` });
  }
  return cmds;
}

function schemeFor(rec) {
  return /https|ssl|443/.test(`${rec.service}${rec.port}`) ? 'https://' : 'http://';
}
