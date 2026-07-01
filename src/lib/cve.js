// cve.js — online vuln intelligence: Shodan CVEDB (per-product CVEs, which also
// carry EPSS + KEV flags) plus the CISA KEV catalog (actively-exploited list).
//
// Both are free and CORS-friendly. Results are cached in IndexedDB so re-scans
// are instant and rate-limit safe. Everything degrades gracefully offline —
// failures return empty, and the offline severity/exploit layer still works.
import * as storage from './storage.js';

const { KEYS } = storage;
const CVEDB = 'https://cvedb.shodan.io';
const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CVE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const KEV_TTL = 24 * 60 * 60 * 1000; // 1 day
const MAX_CVES = 15; // keep the worst N per product, by CVSS

// ---- CISA KEV catalog (Set of actively-exploited CVE IDs) ----

let kevMem = null;

export async function getKevSet() {
  if (kevMem) return kevMem;
  const cached = await storage.get(KEYS.kev, null);
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < KEV_TTL) {
    kevMem = new Set(cached.ids);
    return kevMem;
  }
  try {
    const res = await fetch(KEV_URL);
    if (!res.ok) throw new Error(`KEV ${res.status}`);
    const json = await res.json();
    const ids = (json.vulnerabilities || []).map((v) => v.cveID).filter(Boolean);
    await storage.set(KEYS.kev, { ids, fetchedAt: Date.now() });
    kevMem = new Set(ids);
  } catch (e) {
    console.warn('KEV fetch failed; using stale/empty', e);
    kevMem = new Set(cached?.ids || []);
  }
  return kevMem;
}

// ---- Shodan CVEDB per-product lookup, cached by product@version ----

function cacheKeyFor(product, version) {
  return `${(product || '').toLowerCase()}@${version || '*'}`;
}

async function getCveCache() {
  return (await storage.get(KEYS.cve, {})) || {};
}

// Look up CVEs for one product (optionally version). Returns the normalized
// shape we store on a record: { cves:[{id,cvss,epss,kev,summary}], kev, epss }.
export async function lookupProduct(product, version, { force = false } = {}) {
  const empty = { cves: [], kev: false, epss: null };
  if (!product) return empty;

  const ck = cacheKeyFor(product, version);
  const cache = await getCveCache();
  const hit = cache[ck];
  if (!force && hit && hit.fetchedAt && Date.now() - hit.fetchedAt < CVE_TTL) {
    return hit.data;
  }

  let data = empty;
  try {
    const params = new URLSearchParams({ product: String(product).toLowerCase() });
    const res = await fetch(`${CVEDB}/cves?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      const list = json.cves || [];
      const kevSet = await getKevSet();
      const filtered = version
        ? list.filter((c) => !c.cpes || c.cpes.some((cp) => cp.includes(version)) || true)
        : list;
      const cves = filtered
        .map((c) => ({
          id: c.cve_id || c.id,
          cvss: c.cvss ?? c.cvss_v3 ?? null,
          epss: c.epss ?? null,
          kev: !!c.kev || kevSet.has(c.cve_id || c.id),
          summary: (c.summary || '').slice(0, 280),
        }))
        .filter((c) => c.id)
        .sort((a, b) => (b.cvss || 0) - (a.cvss || 0))
        .slice(0, MAX_CVES);
      const epss = cves.reduce((m, c) => Math.max(m, c.epss || 0), 0) || null;
      data = { cves, kev: cves.some((c) => c.kev), epss };
    }
  } catch (e) {
    console.warn('CVEDB lookup failed', product, e);
    return hit?.data || empty;
  }

  cache[ck] = { data, fetchedAt: Date.now() };
  await storage.set(KEYS.cve, cache);
  return data;
}

// Enrich many records. Looks up each distinct product@version once, applies the
// result to every matching record. Reports progress via onProgress(done,total).
// Returns a Map keyed by record.id -> { cves, kev, epss } for the caller to apply.
export async function enrichRecords(records, { force = false, onProgress } = {}) {
  const targets = records.filter((r) => r.product && (r.state || '').startsWith('open'));
  const byProduct = new Map();
  for (const r of targets) {
    const ck = cacheKeyFor(r.product, r.version);
    if (!byProduct.has(ck)) byProduct.set(ck, { product: r.product, version: r.version, ids: [] });
    byProduct.get(ck).ids.push(r.id);
  }

  const result = new Map();
  let done = 0;
  const total = byProduct.size;
  for (const { product, version, ids } of byProduct.values()) {
    const data = await lookupProduct(product, version, { force });
    for (const id of ids) result.set(id, data);
    done++;
    onProgress?.(done, total);
  }
  return result;
}
