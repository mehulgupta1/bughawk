// Priority Worklist computed off the main thread. buildGraph + buildWorklist
// over the full dataset (a scope test + regex per host) freezes the UI at 100k
// records. The worker reads the project's data straight from IndexedDB itself,
// so nothing large is postMessage-cloned across the thread boundary.
import { get, KEYS, loadRecords } from '../../lib/storage.js';
import { buildGraph } from '../../lib/graph.js';
import { buildWorklist } from '../../lib/worklist.js';
import { newHostsSince } from '../../lib/events.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;

onmessage = async (e) => {
  const { projectId, reqId } = e.data || {};
  if (!projectId) { postMessage({ reqId, top: [] }); return; }
  try {
    const [subs, ports, last, nuclei, events, scopeRules, weights] = await Promise.all([
      loadRecords(projectId),
      get(KEYS.ports(projectId), []),
      get(KEYS.urlLastScan(projectId), null),
      get(KEYS.nucleiFindings(projectId), []),
      get(KEYS.surfaceEvents(projectId), []),
      get(KEYS.scope(projectId), []),
      get(KEYS.surfaceWeights(projectId), undefined),
    ]);
    const newHosts = newHostsSince(events, Date.now() - WEEK);
    const nodes = buildGraph({
      subs, ports,
      urlResults: last && Array.isArray(last.parsedData) ? last.parsedData : [],
      nuclei, scopeRules, newHosts,
    });
    postMessage({ reqId, top: buildWorklist(nodes, new Map(), weights).slice(0, 10) });
  } catch {
    postMessage({ reqId, top: [] });
  }
};
