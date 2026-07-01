// Cross-tab attack-surface graph. Pure join over data the other tabs already
// store in IndexedDB: subdomains + ports + URL findings + scope. One node per
// host; everything else becomes a query/filter over the node list.
import { scopeOf } from './scope.js';
import { CATEGORIES, SEV_RANK, CONF_RANK } from '../components/UrlParser/engine.js';

const TAKEOVER_FP = CATEGORIES.find((c) => c.id === 'takeover').paths;
const STD_PORTS = new Set([80, 443]);

export function hostOf(url) {
  try { const h = new URL(url).hostname; if (h) return h; } catch { /* not a full URL */ }
  return String(url || '').replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
}

// Parse `nuclei -jsonl` output into findings.
export function parseNuclei(text) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    try {
      const o = JSON.parse(s);
      const raw = o.host || o['matched-at'] || o.matched || o.url || '';
      out.push({
        host: hostOf(raw),
        name: (o.info && o.info.name) || o['template-id'] || o.templateID || 'finding',
        severity: ((o.info && o.info.severity) || o.severity || 'info').toLowerCase(),
        url: o['matched-at'] || o.matched || o.url || raw,
        templateId: o['template-id'] || o.templateID || '',
      });
    } catch { /* skip bad line */ }
  }
  return out;
}

// subs/ports/urlResults = arrays; scopeRules = scope tab rules; newHosts = Set.
export function buildGraph({ subs = [], ports = [], urlResults = [], nuclei = [], scopeRules = [], newHosts = new Set() }) {
  const nodes = new Map();
  const node = (h) => {
    let n = nodes.get(h);
    if (!n) {
      n = { host: h, inScope: scopeOf(h, scopeRules), status: null, ip: null, cname: '', tech: [], ports: [], findings: [], nuclei: [], maxSev: null, maxConf: null, takeover: false, nonStdPort: false, isNew: newHosts.has(h) };
      nodes.set(h, n);
    }
    return n;
  };

  for (const s of subs) {
    if (!s.host) continue;
    const n = node(s.host);
    n.status = s.status ?? n.status;
    n.ip = s.ip || n.ip;
    n.cname = s.cname || n.cname;
    if (s.tech && s.tech.length) n.tech = s.tech;
    if (TAKEOVER_FP.test(`${n.cname} ${s.title || ''}`)) n.takeover = true;
  }
  for (const p of ports) {
    if (!p.host) continue;
    const n = node(p.host);
    if (p.port && !n.ports.includes(p.port)) n.ports.push(p.port);
  }
  for (const r of urlResults) {
    const h = hostOf(r.url);
    if (!h) continue;
    const n = node(h);
    n.findings.push({ categories: r.categories, severity: r.severity, confidence: r.confidence, url: r.url });
  }
  for (const f of nuclei) {
    if (!f.host) continue;
    node(f.host).nuclei.push(f);
  }

  for (const n of nodes.values()) {
    n.ports.sort((a, b) => a - b);
    n.nonStdPort = n.ports.some((p) => !STD_PORTS.has(p));
    for (const f of n.findings) {
      if (!n.maxSev || (SEV_RANK[f.severity] ?? -1) > (SEV_RANK[n.maxSev] ?? -1)) n.maxSev = f.severity;
      if (!n.maxConf || (CONF_RANK[f.confidence] ?? -1) > (CONF_RANK[n.maxConf] ?? -1)) n.maxConf = f.confidence;
    }
    for (const f of n.nuclei) {
      if (!n.maxSev || (SEV_RANK[f.severity] ?? -1) > (SEV_RANK[n.maxSev] ?? -1)) n.maxSev = f.severity;
      n.maxConf = 'high'; // a nuclei match is confirmed signal
    }
  }
  return [...nodes.values()];
}

// Filter the node list. Every flag is opt-in (undefined = ignore).
export function queryGraph(nodes, { inScope, nonStdPort, highConf, takeover, isNew, hasFinding } = {}) {
  return nodes.filter((n) => {
    if (inScope && n.inScope !== 'in') return false;
    if (nonStdPort && !n.nonStdPort) return false;
    if (hasFinding && n.findings.length === 0 && n.nuclei.length === 0) return false;
    if (highConf && n.maxConf !== 'high') return false;
    if (takeover && !n.takeover) return false;
    if (isNew && !n.isNew) return false;
    return true;
  });
}
