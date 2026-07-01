// Priority worklist — one ranked queue across the whole attack surface.
// score = Σ (signal points × weight). Pure; UI supplies weights + done set.
import { urlTemplate } from '../components/UrlParser/engine.js';

const SEV_PTS = { critical: 10, high: 6, medium: 3, low: 2, custom: 5, info: 1 };
const CONF_PTS = { high: 3, medium: 2, low: 1 };

export const DEFAULT_WEIGHTS = {
  severity: 1,
  confidence: 1,
  scope: 1,
  fresh: 1,
  rarity: 0.5,
  port: 1,
  takeover: 1,
};

export const WEIGHT_LABELS = {
  severity: 'Severity',
  confidence: 'Confidence',
  scope: 'In-scope',
  fresh: 'Freshness (new)',
  rarity: 'Endpoint rarity',
  port: 'Non-standard port',
  takeover: 'Takeover',
};

function scopePts(inScope) {
  if (inScope === 'in') return 3;
  if (inScope === 'out') return -8; // out-of-scope sinks to the bottom
  return 0;
}

// nodes: from buildGraph. rarityMap: template -> rarity. weights: see DEFAULT.
export function buildWorklist(nodes, rarityMap = new Map(), weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const items = [];

  for (const n of nodes) {
    const scope = scopePts(n.inScope) * w.scope;
    const fresh = (n.isNew ? 3 : 0) * w.fresh;

    if (n.takeover) {
      items.push({
        id: `takeover|${n.host}`,
        kind: 'takeover',
        host: n.host,
        detail: n.cname || 'dangling CNAME',
        severity: 'high',
        confidence: 'high',
        parts: { base: 10 * w.takeover, scope, fresh },
        url: null,
      });
    }

    if (n.nonStdPort && n.inScope !== 'out') {
      const alt = n.ports.filter((p) => p !== 80 && p !== 443);
      items.push({
        id: `port|${n.host}`,
        kind: 'port',
        host: n.host,
        detail: `ports ${alt.join(', ')}`,
        severity: 'medium',
        confidence: 'medium',
        parts: { base: 4 * w.port, scope, fresh },
        url: null,
      });
    }

    for (const f of (n.nuclei || [])) {
      items.push({
        id: `nuclei|${f.templateId || f.name}|${n.host}`,
        kind: 'nuclei',
        host: n.host,
        detail: f.name,
        severity: f.severity,
        confidence: 'high', // a nuclei match is confirmed, not a candidate
        url: f.url || null,
        parts: { sev: (SEV_PTS[f.severity] || 0) * w.severity, conf: 3 * w.confidence, scope, fresh },
      });
    }

    for (const f of n.findings) {
      const rarity = (rarityMap.get(urlTemplate(f.url)) || 0) * w.rarity;
      items.push({
        id: `find|${f.url}`,
        kind: 'finding',
        host: n.host,
        detail: f.categories.join(', '),
        severity: f.severity,
        confidence: f.confidence,
        url: f.url,
        parts: {
          sev: (SEV_PTS[f.severity] || 0) * w.severity,
          conf: (CONF_PTS[f.confidence] || 0) * w.confidence,
          scope,
          fresh,
          rarity,
        },
      });
    }
  }

  for (const it of items) {
    it.score = Math.round(Object.values(it.parts).reduce((a, b) => a + b, 0) * 10) / 10;
  }
  items.sort((a, b) => b.score - a.score || (a.host < b.host ? -1 : 1));
  return items;
}

export function worklistCsv(items, csvCell) {
  const rows = ['Rank,Score,Kind,Severity,Confidence,Host,Detail,URL'];
  items.forEach((it, i) => {
    rows.push([i + 1, it.score, it.kind, csvCell(it.severity || ''), csvCell(it.confidence || ''), csvCell(it.host), csvCell(it.detail), csvCell(it.url || '')].join(','));
  });
  return rows.join('\n');
}
