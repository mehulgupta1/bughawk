// tls.js — read TLS intel out of Nmap script output captured on a port record.
// Looks at the `ssl-cert` and `ssl-enum-ciphers` scripts (record.scripts). Pure.

function findScript(rec, idPart) {
  const scripts = rec && rec.scripts;
  if (!scripts) return '';
  const key = Object.keys(scripts).find((k) => k.includes(idPart));
  return key ? scripts[key] : '';
}

// Parse the ssl-cert script. Returns null if no cert data present.
export function parseCert(rec) {
  const out = findScript(rec, 'ssl-cert');
  if (!out) return null;

  const cn = matchOne(out, /(?:commonName|CN)=([^/\n,]+)/i);
  const issuer = matchOne(out, /Issuer:[^\n]*?(?:commonName|CN)=([^/\n,]+)/i)
    || matchOne(out, /Issuer:\s*([^\n]+)/i);
  const notAfterRaw = matchOne(out, /Not valid after:\s*([^\n]+)/i);
  const notBeforeRaw = matchOne(out, /Not valid before:\s*([^\n]+)/i);

  // Subject Alternative Name: DNS:a.com, DNS:b.com, IP Address:1.2.3.4
  const sanLine = matchOne(out, /Subject Alternative Name:\s*([^\n]+)/i) || '';
  const sans = [...sanLine.matchAll(/DNS:([^\s,]+)/gi)].map((m) => m[1].toLowerCase());

  const notAfter = notAfterRaw ? new Date(notAfterRaw) : null;
  const expired = notAfter ? notAfter.getTime() < Date.now() : false;
  const daysLeft = notAfter ? Math.round((notAfter.getTime() - Date.now()) / 86400000) : null;
  const selfSigned = /self.?signed/i.test(out) ||
    (!!cn && !!issuer && cn.trim().toLowerCase() === String(issuer).trim().toLowerCase());
  const wildcard = sans.some((s) => s.startsWith('*.')) || (cn || '').startsWith('*.');

  return {
    cn: cn ? cn.trim() : null,
    issuer: issuer ? issuer.trim() : null,
    notBefore: notBeforeRaw || null,
    notAfter: notAfterRaw || null,
    daysLeft,
    expired,
    expiringSoon: daysLeft != null && daysLeft >= 0 && daysLeft <= 21,
    selfSigned,
    wildcard,
    sans,
  };
}

// Parse ssl-enum-ciphers for weak/legacy protocols. Returns [] if none.
export function weakProtocols(rec) {
  const out = findScript(rec, 'ssl-enum-ciphers');
  if (!out) return [];
  const weak = [];
  if (/SSLv2/i.test(out)) weak.push('SSLv2');
  if (/SSLv3/i.test(out)) weak.push('SSLv3');
  if (/TLSv1\.0/i.test(out)) weak.push('TLS 1.0');
  if (/TLSv1\.1/i.test(out)) weak.push('TLS 1.1');
  // Nmap appends a letter grade; flag anything worse than A.
  const grade = matchOne(out, /least strength:\s*([A-F])/i);
  if (grade && grade > 'A') weak.push(`grade ${grade}`);
  return weak;
}

// Collect all SAN hostnames across records that look like new in-scope hosts
// (skip wildcards and raw IPs). Returns a deduped, sorted array of host strings.
export function collectSanHosts(records) {
  const set = new Set();
  for (const r of records) {
    const cert = parseCert(r);
    if (!cert) continue;
    for (const s of cert.sans) {
      if (!s || s.startsWith('*.')) continue;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) continue;
      set.add(s);
    }
  }
  return [...set].sort();
}

function matchOne(text, re) {
  const m = String(text).match(re);
  return m ? m[1] : null;
}
