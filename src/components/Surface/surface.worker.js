// Attack-surface graph, computed off the main thread. buildGraph +
// buildWorklist + queryGraph over 100k hosts froze the UI for seconds when the
// tab opened or a filter toggled. The worker reads data straight from
// IndexedDB, caches the built node list per (project, version), and returns only
// the capped slices the UI actually renders — so nothing large ever crosses
// postMessage back to the main thread.
import { get, KEYS, loadRecords } from '../../lib/storage.js';
import { buildGraph, queryGraph } from '../../lib/graph.js';
import { buildWorklist, worklistCsv } from '../../lib/worklist.js';
import { newHostsSince } from '../../lib/events.js';
import { buildTemplates, csvCell } from '../UrlParser/engine.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const WL_PAGE = 100;

// Cache the expensive graph so filter/weight/page/done changes don't rebuild it.
let cache = { key: null, nodes: null, byHost: null, rarityMap: null };

async function ensureNodes(projectId, version) {
  const key = `${projectId}::${version}`;
  if (cache.key === key && cache.nodes) return;
  const [subs, ports, last, nuclei, events, scopeRules] = await Promise.all([
    loadRecords(projectId),
    get(KEYS.ports(projectId), []),
    get(KEYS.urlLastScan(projectId), null),
    get(KEYS.nucleiFindings(projectId), []),
    get(KEYS.surfaceEvents(projectId), []),
    get(KEYS.scope(projectId), []),
  ]);
  const urlResults = last && Array.isArray(last.parsedData) ? last.parsedData : [];
  const newHosts = newHostsSince(events, Date.now() - WEEK);
  const nodes = buildGraph({ subs, ports, urlResults, nuclei, scopeRules, newHosts });
  const byHost = new Map(nodes.map((n) => [n.host, n]));
  const rarityMap = new Map();
  for (const t of buildTemplates(urlResults)) rarityMap.set(t.template, t.rarity);
  cache = { key, nodes, byHost, rarityMap };
}

function filterWorklist(worklist, byHost, wl, done) {
  return worklist.filter((it) => {
    if (it.score < wl.minScore) return false;
    if (wl.inScopeOnly && byHost.get(it.host)?.inScope === 'out') return false;
    if (wl.hideDone && done[it.id]) return false;
    return true;
  });
}

onmessage = async (e) => {
  const { reqId, projectId, version, q, weights, wl, done, exportCsv } = e.data || {};
  if (!projectId) { postMessage({ reqId, hostCount: 0, results: [], wlSlice: [], wlCount: 0, wlPages: 1, page: 0, takeovers: [] }); return; }
  try {
    await ensureNodes(projectId, version);
    const { nodes, byHost, rarityMap } = cache;
    const worklist = buildWorklist(nodes, rarityMap, weights);
    const wlFiltered = filterWorklist(worklist, byHost, wl, done);

    if (exportCsv) { postMessage({ reqId, csv: worklistCsv(wlFiltered, csvCell) }); return; }

    const wlPages = Math.max(1, Math.ceil(wlFiltered.length / WL_PAGE));
    const page = Math.min(wl.page, wlPages - 1);
    const matched = queryGraph(nodes, q);
    const takeovers = nodes.filter((n) => n.takeover);
    postMessage({
      reqId,
      hostCount: nodes.length,
      results: matched.slice(0, 300),
      resultCount: matched.length,
      takeovers: takeovers.slice(0, 500),
      takeoverCount: takeovers.length,
      wlSlice: wlFiltered.slice(page * WL_PAGE, page * WL_PAGE + WL_PAGE),
      wlCount: wlFiltered.length,
      wlPages,
      page,
    });
  } catch (err) {
    postMessage({ reqId, error: String(err && err.message ? err.message : err) });
  }
};
