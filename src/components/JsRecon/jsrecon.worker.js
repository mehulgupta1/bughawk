// Web Worker — analyzes a slice of JS sources off the main thread, streams per-file
// results back. The tab runs a pool of these (one per core) and aggregates.
// Inputs: { urls:[string] } | { files:[File] } | { text }
// URLs are fetched through the same-origin Vite proxy (/__jsproxy) which fetches
// server-side → no CORS, any target's JS works straight from the browser.
import { analyzeJs } from '../../lib/jsrecon.js';

const PROXY = '/__jsproxy?url=';

const SECTIONS = ['secrets', 'misconfigs', 'framework', 'chunks', 'sourcemaps', 'urls', 'endpoints', 'paths', 'params', 'domains', 'graphql', 'juicy', 'environment', 'versions', 'hardcodedIds'];

function perFile(source, body) {
  const baseUrl = /^https?:\/\//.test(source) ? source : undefined;
  const r = analyzeJs(body, baseUrl);
  const pf = {
    source,
    secrets: r.secrets, misconfigs: r.misconfigs, juicy: r.juicy,
    framework: r.framework.map((f) => f.framework),
    params: r.params.map((p) => p.name),
    hardcodedIds: r.hardcodedIds.map((x) => `${x.type}: ${x.value}`),
    chunks: r.chunks, sourcemaps: r.sourcemaps, urls: r.urls, endpoints: r.endpoints,
    paths: r.paths, domains: r.domains, graphql: r.graphql, environment: r.environment, versions: r.versions,
    summary: r.summary,
  };
  const found = SECTIONS.reduce((n, k) => n + (pf[k] ? pf[k].length : 0), 0);
  return found ? pf : null;
}

self.onmessage = async (e) => {
  const { urls, files, text } = e.data;
  const bySource = [];
  const errors = [];

  if (urls) {
    const POOL = 8;
    let next = 0;
    async function run() {
      while (next < urls.length) {
        const u = urls[next++];
        try {
          const res = await fetch(PROXY + encodeURIComponent(u), { redirect: 'follow' });
          if (!res.ok) throw new Error((await res.text()).slice(0, 120) || 'HTTP ' + res.status);
          const pf = perFile(u, await res.text());
          if (pf) bySource.push(pf);
        } catch (err) {
          errors.push(u + '  →  ' + (err && err.message ? err.message : err));
        }
        self.postMessage({ tick: 1 });
      }
    }
    await Promise.all(Array.from({ length: Math.min(POOL, urls.length) }, run));
    self.postMessage({ done: true, bySource, errors });
    return;
  }

  const inputs = files || [{ name: 'pasted', body: text }];
  for (const f of inputs) {
    try {
      const pf = perFile(f.name || 'file', f.text ? await f.text() : f.body);
      if (pf) bySource.push(pf);
    } catch (err) {
      errors.push((f.name || 'file') + '  →  ' + (err && err.message ? err.message : err));
    }
    self.postMessage({ tick: 1 });
  }
  self.postMessage({ done: true, bySource, errors });
};
