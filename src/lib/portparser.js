// portparser.js — turn raw pasted port-scan output into port records.
//
// Mirrors lib/parser.js: never throws, returns partial records (no id/meta).
// The unit is a host:port pair. One blob can yield many ports per host.
//
// Auto-detected formats:
//   • Nmap XML        (-oX)  — richest: service/product/version/cpe + scripts
//   • Nmap normal     (-oN)  — the human PORT/STATE/SERVICE/VERSION table
//   • Nmap/Masscan grepable (-oG) — "Host: ip ()\tPorts: 22/open/tcp//ssh//.."
//   • Masscan normal         — "Discovered open port 22/tcp on 1.2.3.4"
//   • Masscan/Naabu JSON     — {"ip":..,"port":..} or {"ip":..,"ports":[..]}
//   • Naabu / generic        — "host:port"
//   • Rustscan               — "Open 1.2.3.4:22"  or  "1.2.3.4 -> [22,80]"
//
// A blob may mix formats; lines that match nothing are skipped (counted).

const STATES = new Set(['open', 'closed', 'filtered', 'open|filtered', 'closed|filtered', 'unfiltered']);

// Strip scheme/path/port and lowercase. Keeps IPs and hostnames intact.
export function normalizeHost(raw) {
  if (!raw) return '';
  let h = String(raw).trim();
  h = h.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  h = h.replace(/^[^@]*@/, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/\.+$/, '');
  return h.toLowerCase();
}

const IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// Pull a product + version out of an Nmap VERSION string or a raw banner.
// "OpenSSH 6.6.1p1 Ubuntu 2ubuntu2" -> { product:'OpenSSH', version:'6.6.1p1' }
export function splitProductVersion(s) {
  const str = String(s || '').trim();
  if (!str) return { product: '', version: '' };
  const m = str.match(/^(.*?)[\s/]+v?(\d[\w.\-]*)/);
  if (m) return { product: m[1].trim(), version: m[2] };
  return { product: str, version: '' };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// ---------- Nmap XML ----------

function parseNmapXml(text) {
  const records = [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    return records;
  }
  if (!doc || doc.querySelector('parsererror')) return records;

  for (const hostEl of doc.querySelectorAll('host')) {
    let ip = null;
    let host = null;
    for (const addr of hostEl.querySelectorAll('address')) {
      const a = addr.getAttribute('addr');
      const t = addr.getAttribute('addrtype');
      if (t === 'ipv4' || t === 'ipv6') ip = a;
    }
    const hostnameEl = hostEl.querySelector('hostnames > hostname');
    if (hostnameEl) host = hostnameEl.getAttribute('name');
    const targetHost = normalizeHost(host || ip || '');
    if (!targetHost) continue;

    for (const portEl of hostEl.querySelectorAll('ports > port')) {
      const port = numOrNull(portEl.getAttribute('portid'));
      const proto = (portEl.getAttribute('protocol') || 'tcp').toLowerCase();
      const stateEl = portEl.querySelector('state');
      const state = (stateEl?.getAttribute('state') || 'open').toLowerCase();
      const svcEl = portEl.querySelector('service');
      const service = svcEl?.getAttribute('name') || '';
      const product = svcEl?.getAttribute('product') || '';
      const verStr = svcEl?.getAttribute('version') || '';
      const cpeEl = portEl.querySelector('service > cpe');
      const cpe = cpeEl?.textContent || '';
      const scripts = {};
      for (const sc of portEl.querySelectorAll('script')) {
        const id = sc.getAttribute('id');
        if (id) scripts[id] = sc.getAttribute('output') || '';
      }
      if (port == null) continue;
      records.push({
        host: targetHost, ip, port, proto, state, service,
        product, version: verStr, cpe, banner: '', scripts,
      });
    }
  }
  return records;
}

// ---------- Nmap grepable (-oG) / Masscan grepable ----------

function parseGrepableLine(line, ctx) {
  const m = line.match(/^Host:\s*(\S+)\s*(?:\(([^)]*)\))?\s+Ports:\s*(.+)$/i);
  if (!m) return null;
  const ip = m[1];
  const name = (m[2] || '').trim();
  const host = normalizeHost(name || ip);
  const out = [];
  for (const chunk of m[3].split(',')) {
    // port/state/proto/owner/service/rpc/version/
    const f = chunk.trim().split('/');
    const port = numOrNull(f[0]);
    if (port == null) continue;
    const state = (f[1] || 'open').toLowerCase();
    const proto = (f[2] || 'tcp').toLowerCase();
    const service = (f[4] || '').trim();
    const verStr = (f[6] || '').replace(/\\x[0-9a-f]{2}/gi, ' ').trim();
    const pv = splitProductVersion(verStr);
    out.push({
      host, ip, port, proto, state, service,
      product: pv.product, version: pv.version, cpe: '', banner: verStr, scripts: {},
    });
  }
  ctx.format = ctx.format || 'grepable';
  return out;
}

// ---------- Masscan normal ----------

function parseMasscanLine(line, ctx) {
  // Discovered open port 22/tcp on 1.2.3.4
  const m = line.match(/^Discovered open port\s+(\d+)\/(tcp|udp)\s+on\s+(\S+)/i);
  if (!m) return null;
  ctx.format = ctx.format || 'masscan';
  return [{
    host: normalizeHost(m[3]), ip: IP_RE.test(m[3]) ? m[3] : null,
    port: numOrNull(m[1]), proto: m[2].toLowerCase(), state: 'open',
    service: '', product: '', version: '', cpe: '', banner: '', scripts: {},
  }];
}

// ---------- JSON line (Naabu / Masscan / httpx-style) ----------

function parseJsonLine(line, ctx) {
  const t = line.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  let obj;
  try { obj = JSON.parse(t); } catch { return null; }
  const arr = Array.isArray(obj) ? obj : [obj];
  const out = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    const ip = o.ip || o.address || null;
    const host = normalizeHost(o.host || o.domain || o.input || ip || '');
    if (!host) continue;
    // masscan json: { ip, ports:[{port,proto,status}] }
    if (Array.isArray(o.ports)) {
      for (const p of o.ports) {
        const port = numOrNull(p.port);
        if (port == null) continue;
        out.push({
          host, ip, port,
          proto: (p.proto || p.protocol || 'tcp').toLowerCase(),
          state: (p.status || p.state || 'open').toLowerCase(),
          service: p.service?.name || p.service || '', product: '', version: '',
          cpe: '', banner: '', scripts: {},
        });
      }
      continue;
    }
    // naabu json: { host, ip, port }
    const port = numOrNull(o.port);
    if (port == null) continue;
    out.push({
      host, ip, port,
      proto: (o.protocol || o.proto || 'tcp').toLowerCase(),
      state: (o.state || 'open').toLowerCase(),
      service: o.service || '', product: '', version: '', cpe: '', banner: '', scripts: {},
    });
  }
  if (out.length) ctx.format = ctx.format || 'json';
  return out.length ? out : null;
}

// ---------- Rustscan ----------

function parseRustscanLine(line, ctx) {
  // "Open 1.2.3.4:22"
  let m = line.match(/^Open\s+(\S+):(\d+)\s*$/i);
  if (m) {
    ctx.format = ctx.format || 'rustscan';
    return [oneOpen(m[1], m[2])];
  }
  // "1.2.3.4 -> [22,80,443]"
  m = line.match(/^(\S+)\s*->\s*\[([\d,\s]+)\]\s*$/);
  if (m) {
    ctx.format = ctx.format || 'rustscan';
    return m[2].split(',').map((p) => oneOpen(m[1], p.trim())).filter(Boolean);
  }
  return null;
}

function oneOpen(rawHost, rawPort) {
  const port = numOrNull(rawPort);
  if (port == null) return null;
  return {
    host: normalizeHost(rawHost), ip: IP_RE.test(rawHost) ? rawHost : null,
    port, proto: 'tcp', state: 'open',
    service: '', product: '', version: '', cpe: '', banner: '', scripts: {},
  };
}

// ---------- Nmap normal (-oN), stateful: header sets current host ----------

function parseNmapNormalLine(line, ctx) {
  const hm = line.match(/^Nmap scan report for\s+(.+?)\s*$/);
  if (hm) {
    const raw = hm[1].trim();
    const paren = raw.match(/^(.+?)\s+\(([^)]+)\)$/);
    if (paren) {
      ctx.curHost = normalizeHost(paren[1]);
      ctx.curIp = paren[2];
    } else {
      ctx.curHost = normalizeHost(raw);
      ctx.curIp = IP_RE.test(raw) ? raw : null;
    }
    return [];
  }
  // 22/tcp open ssh OpenSSH 6.6.1p1 Ubuntu ...
  const pm = line.match(/^(\d+)\/(tcp|udp)\s+(open|closed|filtered|open\|filtered|closed\|filtered|unfiltered)\s+(\S+)(?:\s+(.*))?$/);
  if (pm && ctx.curHost) {
    ctx.format = ctx.format || 'nmap';
    const verStr = (pm[5] || '').trim();
    const pv = splitProductVersion(verStr);
    return [{
      host: ctx.curHost, ip: ctx.curIp || null,
      port: numOrNull(pm[1]), proto: pm[2].toLowerCase(), state: pm[3].toLowerCase(),
      service: pm[4], product: pv.product, version: pv.version, cpe: '',
      banner: verStr, scripts: {},
    }];
  }
  return null;
}

// ---------- generic host:port (Naabu / dnsx text) ----------

function parseHostPortLine(line, ctx) {
  const t = line.trim();
  // avoid URLs and time stamps; require single colon-delimited port at end
  const m = t.match(/^([a-zA-Z0-9._-]+):(\d{1,5})$/);
  if (!m) return null;
  const port = numOrNull(m[2]);
  if (port == null || port < 1 || port > 65535) return null;
  ctx.format = ctx.format || 'list';
  return [oneOpen(m[1], m[2])];
}

const LINE_PARSERS = [
  parseJsonLine,
  parseGrepableLine,
  parseMasscanLine,
  parseRustscanLine,
  parseNmapNormalLine,
  parseHostPortLine,
];

// Parse a whole blob -> { records, stats }.
export function parseText(text) {
  const raw = String(text || '');
  const records = [];

  // XML is a whole-document format — detect & short-circuit.
  if (raw.includes('<nmaprun')) {
    const xml = parseNmapXml(raw);
    return {
      records: xml,
      stats: { total: xml.length, parsed: xml.length, skipped: 0, format: 'nmap-xml' },
    };
  }

  const ctx = { curHost: null, curIp: null, format: null };
  const lines = raw.split(/\r?\n/);
  let parsed = 0;
  let skipped = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    let hit = null;
    for (const fn of LINE_PARSERS) {
      const r = fn(line, ctx);
      if (r) { hit = r; break; }
    }
    if (hit && hit.length) {
      for (const rec of hit) records.push(rec);
      parsed++;
    } else if (hit) {
      // matched a stateful header (nmap report line) — not data, not skipped
    } else {
      skipped++;
    }
  }

  return {
    records,
    stats: { total: parsed + skipped, parsed: records.length, skipped, format: ctx.format || 'unknown' },
  };
}

// Count plausible data lines for the live row hint in the import panel.
export function countLines(text) {
  let n = 0;
  for (const l of String(text || '').split(/\r?\n/)) {
    const t = l.trim();
    if (t && !t.startsWith('#')) n++;
  }
  return n;
}
