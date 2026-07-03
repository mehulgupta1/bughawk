// IndexedDB-backed key/value store. Same `bbd:` key pattern as before, but the
// engine underneath is IndexedDB (via `idb`) instead of localStorage. All
// functions return Promises.
import { openDB } from 'idb';
import { logPerf } from './telemetry.js';

const PREFIX = 'bbd:';
const DB_NAME = 'bbd-db';
const STORE = 'kv';
// Legacy per-row store (superseded by chunked blobs). Kept only so existing
// per-row data migrates into chunks on first load; `rangeFor` scopes a project.
const SUBROWS = 'subrows';
const rangeFor = (projectId) => IDBKeyRange.bound(`${projectId}::`, `${projectId}::￿`);

export const KEYS = {
  projects: `${PREFIX}projects`,
  activeProjectId: `${PREFIX}activeProjectId`,
  theme: `${PREFIX}theme`,
  subdomains: (projectId) => `${PREFIX}project:${projectId}:subdomains`,
  activity: (projectId) => `${PREFIX}project:${projectId}:activity`,
  notes: (projectId) => `${PREFIX}project:${projectId}:notes`,
  keywords: (projectId) => `${PREFIX}project:${projectId}:keywords`,
  scope: (projectId) => `${PREFIX}project:${projectId}:scope`,
  assets: (projectId) => `${PREFIX}project:${projectId}:assets`,
  ports: (projectId) => `${PREFIX}project:${projectId}:ports`,
  portActivity: (projectId) => `${PREFIX}project:${projectId}:port-activity`,
  portSessions: (projectId) => `${PREFIX}project:${projectId}:port-sessions`,
  urlSessions: (projectId) => `${PREFIX}project:${projectId}:url-sessions`,
  subSessions: (projectId) => `${PREFIX}project:${projectId}:sub-sessions`,
  urlLastScan: (projectId) => `${PREFIX}project:${projectId}:url-lastscan`,
  surfaceSnapshot: (projectId) => `${PREFIX}project:${projectId}:surface-snapshot`,
  surfaceEvents: (projectId) => `${PREFIX}project:${projectId}:surface-events`,
  surfaceWeights: (projectId) => `${PREFIX}project:${projectId}:surface-weights`,
  nucleiFindings: (projectId) => `${PREFIX}project:${projectId}:nuclei-findings`,
  findings: (projectId) => `${PREFIX}project:${projectId}:findings`,
  jsRecon: (projectId) => `${PREFIX}project:${projectId}:jsrecon`,
  jsReconPrev: (projectId) => `${PREFIX}project:${projectId}:jsrecon-prev`,
  worklistDone: (projectId) => `${PREFIX}project:${projectId}:worklist-done`,
  cve: 'bbd:cve-cache',
  kev: 'bbd:kev-catalog',
  wordlists: 'bbd:wordlists',
  notebook: 'bbd:notebook',
  dorksOpened: 'bbd:dorks-opened',
  customDorks: 'bbd:custom-dorks',
  apiKeys: 'bbd:api-keys',
  auth: 'bbd:auth',
};

let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
        if (!database.objectStoreNames.contains(SUBROWS)) database.createObjectStore(SUBROWS);
      },
    });
  }
  return dbPromise;
}

export async function get(key, fallback = null) {
  try {
    const val = await (await db()).get(STORE, key);
    return val === undefined ? fallback : val;
  } catch (e) {
    console.error('storage.get failed', key, e);
    return fallback;
  }
}

export async function set(key, value) {
  try {
    await (await db()).put(STORE, value, key);
    return true;
  } catch (e) {
    console.error('storage.set failed', key, e);
    return false;
  }
}

// Write several [key, value] pairs in a single transaction.
export async function setMany(entries) {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite');
    await Promise.all(entries.map(([k, v]) => tx.store.put(v, k)));
    await tx.done;
    return true;
  } catch (e) {
    console.error('storage.setMany failed', e);
    return false;
  }
}

export async function del(key) {
  try {
    await (await db()).delete(STORE, key);
  } catch (e) {
    console.error('storage.delete failed', key, e);
  }
}

// Back-compat alias (older code referenced `remove`).
export const remove = del;

export async function list() {
  try {
    return await (await db()).getAllKeys(STORE);
  } catch (e) {
    console.error('storage.list failed', e);
    return [];
  }
}

// ── Chunked-blob subdomain records ─────────────────────────────────────────
//
// Records are stored as ~5000-record blobs (`subchunk:i`) instead of one row
// per record. 100k individual IndexedDB puts took ~30s on import; ~20 blob puts
// take ~2s, load stays fast, and the whole set writes in a single transaction.
const REC_CHUNK = 5000;
const chunkKey = (pid, i) => `${PREFIX}project:${pid}:subchunk:${i}`;
const chunkMetaKey = (pid) => `${PREFIX}project:${pid}:subchunk-meta`;

// Pure (exported for testing): split records into fixed-size chunks.
export function chunkRecords(records, size = REC_CHUNK) {
  const out = [];
  for (let i = 0; i < records.length; i += size) out.push(records.slice(i, i + size));
  return out;
}

// All records for a project. Migrates legacy formats (single blob, or the
// intermediate per-row store) into chunks on first access, then drops them.
export async function loadRecords(projectId) {
  if (!projectId) return [];
  try {
    const _t = performance.now();
    const meta = await get(chunkMetaKey(projectId), null);
    if (meta && meta.chunks > 0) {
      const parts = await Promise.all(
        Array.from({ length: meta.chunks }, (_, i) => get(chunkKey(projectId, i), []))
      );
      const out = [];
      for (const p of parts) if (Array.isArray(p)) for (const r of p) out.push(r);
      logPerf('load-records', { rows: out.length, getAllMs: Math.round(performance.now() - _t), migrated: false });
      return out;
    }
    // Migrate a legacy single-blob dataset.
    const legacy = await get(KEYS.subdomains(projectId), null);
    if (Array.isArray(legacy) && legacy.length) {
      await saveRecords(projectId, legacy);
      await del(KEYS.subdomains(projectId));
      logPerf('load-records', { rows: legacy.length, getAllMs: Math.round(performance.now() - _t), migrated: legacy.length });
      return legacy;
    }
    // Migrate the intermediate per-row store.
    const rows = await (await db()).getAll(SUBROWS, rangeFor(projectId));
    if (rows.length) {
      await saveRecords(projectId, rows);
      await (await db()).delete(SUBROWS, rangeFor(projectId));
      logPerf('load-records', { rows: rows.length, getAllMs: Math.round(performance.now() - _t), migrated: rows.length });
      return rows;
    }
    logPerf('load-records', { rows: 0, getAllMs: Math.round(performance.now() - _t), migrated: false });
    return [];
  } catch (e) {
    console.error('storage.loadRecords failed', projectId, e);
    return [];
  }
}

// Write the full record set as chunk blobs in one transaction (fast bulk write),
// then drop any leftover chunks from a previously-larger dataset.
export async function saveRecords(projectId, records) {
  const prevMeta = await get(chunkMetaKey(projectId), null);
  const prevChunks = prevMeta ? prevMeta.chunks : 0;
  const parts = chunkRecords(records);
  const entries = parts.map((p, i) => [chunkKey(projectId, i), p]);
  entries.push([chunkMetaKey(projectId), { chunks: parts.length, count: records.length }]);
  await setMany(entries);
  for (let i = parts.length; i < prevChunks; i++) await del(chunkKey(projectId, i));
}

// Delete every stored record chunk for a project (project delete / wipe), plus
// any un-migrated legacy formats.
export async function deleteProjectRecords(projectId) {
  try {
    const meta = await get(chunkMetaKey(projectId), null);
    const chunks = meta ? meta.chunks : 0;
    const ops = [del(chunkMetaKey(projectId)), del(KEYS.subdomains(projectId))];
    for (let i = 0; i < chunks; i++) ops.push(del(chunkKey(projectId, i)));
    await Promise.all(ops);
    try { await (await db()).delete(SUBROWS, rangeFor(projectId)); } catch { /* legacy per-row */ }
  } catch (e) {
    console.error('storage.deleteProjectRecords failed', projectId, e);
  }
}

// Whole-workspace backup: every `bbd:*` key (all projects, wordlists, dorks,
// API keys, settings) in one object. Auth is excluded by default so a backup
// file isn't a credential leak — pass includeAuth to override.
export async function exportAll({ includeAuth = false } = {}) {
  const keys = (await list()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  const data = {};
  for (const k of keys) {
    if (!includeAuth && k === KEYS.auth) continue;
    data[k] = await get(k);
  }
  // Subdomain records now live in their own store — include them or a backup
  // would silently drop every project's subdomains.
  const store = (await db()).transaction(SUBROWS).store;
  const [rk, rv] = await Promise.all([store.getAllKeys(), store.getAll()]);
  const subrows = rk.map((k, i) => [k, rv[i]]);
  return { format: 'bughawk-workspace', version: 2, exportedAt: new Date().toISOString(), data, subrows };
}

// Restore a backup. mode 'replace' wipes existing bbd:* keys first; 'merge'
// overwrites matching keys and keeps the rest. Auth is never overwritten unless
// the dump contains it AND includeAuth is set.
export async function importAll(dump, { mode = 'replace', includeAuth = false } = {}) {
  if (!dump || dump.format !== 'bughawk-workspace' || !dump.data) {
    throw new Error('Not a BugHawk workspace backup file.');
  }
  const entries = Object.entries(dump.data).filter(([k]) => includeAuth || k !== KEYS.auth);
  if (mode === 'replace') {
    const existing = (await list()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX) && (includeAuth || k !== KEYS.auth));
    for (const k of existing) await del(k);
    await (await db()).clear(SUBROWS);
  }
  await setMany(entries);
  // Restore per-row records (v2+ backups). Older backups carry them as a legacy
  // blob inside `data`, which loadRecords() migrates on first project open.
  if (Array.isArray(dump.subrows) && dump.subrows.length) {
    const tx = (await db()).transaction(SUBROWS, 'readwrite');
    await Promise.all(dump.subrows.map(([k, v]) => tx.store.put(v, k)));
    await tx.done;
  }
  return entries.length;
}

// One-time migration: copy any existing `bbd:*` localStorage entries into
// IndexedDB, then clear them. No-op if nothing is there.
export async function migrateFromLocalStorage() {
  if (typeof localStorage === 'undefined') return;
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw == null) continue;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        entries.push([key, parsed]);
      }
    }
  } catch {
    return;
  }
  if (entries.length === 0) return;
  const ok = await setMany(entries);
  if (ok) {
    for (const [key] of entries) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    }
    console.info(`Migrated ${entries.length} key(s) from localStorage to IndexedDB.`);
  }
}
