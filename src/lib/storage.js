// IndexedDB-backed key/value store. Same `bbd:` key pattern as before, but the
// engine underneath is IndexedDB (via `idb`) instead of localStorage. All
// functions return Promises.
import { openDB } from 'idb';

const PREFIX = 'bbd:';
const DB_NAME = 'bbd-db';
const STORE = 'kv';
// Subdomain records live one-per-row here (keyed `${projectId}::${id}`) instead
// of one giant value in `kv`. A 100k-record project was a single 28.6MB
// structured-clone on every load and a full rewrite on every edit; per-row lets
// us load a project by key-range and write only the rows that changed.
const SUBROWS = 'subrows';
const rowKey = (projectId, id) => `${projectId}::${id}`;
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

// ── Per-row subdomain records ──────────────────────────────────────────────

// All records for a project. Migrates a legacy single-blob `KEYS.subdomains`
// value into rows on first access, then drops the blob (one-time, per project).
export async function loadRecords(projectId) {
  if (!projectId) return [];
  try {
    const rows = await (await db()).getAll(SUBROWS, rangeFor(projectId));
    if (rows.length) return rows;
    const legacy = await get(KEYS.subdomains(projectId), null);
    if (Array.isArray(legacy) && legacy.length) {
      await putRecords(projectId, legacy);
      await del(KEYS.subdomains(projectId));
      return legacy;
    }
    return [];
  } catch (e) {
    console.error('storage.loadRecords failed', projectId, e);
    return [];
  }
}

// How many rows to write per transaction. Each chunk clones its rows on the
// calling thread; awaiting between chunks yields to the browser so a 100k-row
// write stays responsive (paints between slices) instead of freezing for
// seconds. Not atomic across chunks — fine for import/edit persistence.
const WRITE_CHUNK = 5000;

async function putChunked(store, projectId, records) {
  const database = await db();
  for (let i = 0; i < records.length; i += WRITE_CHUNK) {
    const tx = database.transaction(store, 'readwrite');
    const end = Math.min(i + WRITE_CHUNK, records.length);
    for (let j = i; j < end; j++) tx.store.put(records[j], rowKey(projectId, records[j].id));
    await tx.done;
  }
}

// Bulk-write a full record set (used by migration + wholesale replaces like
// loadSession). Does not remove rows that are absent — pair with a clear if the
// set should be authoritative.
export async function putRecords(projectId, records) {
  await putChunked(SUBROWS, projectId, records);
}

// Pure diff (exported for testing): given the new record list and the map of
// what's persisted, return which rows to put (new or identity-changed) and which
// ids to delete (gone). `curr` is the id→record map to carry forward as the new
// baseline. Getting this wrong deletes user data, so it has its own test.
export function recordDelta(records, prevMap = new Map()) {
  const curr = new Map();
  const puts = [];
  for (const r of records) {
    curr.set(r.id, r);
    if (prevMap.get(r.id) !== r) puts.push(r);
  }
  const deleteIds = [];
  for (const id of prevMap.keys()) {
    if (!curr.has(id)) deleteIds.push(id);
  }
  return { puts, deleteIds, curr };
}

// Incremental sync: write only rows whose object identity changed since the
// last persisted map, delete rows no longer present. Returns the new id→record
// map to carry forward. This is the write path that makes single-host edits
// cheap instead of re-serializing the whole dataset.
export async function syncRecords(projectId, records, prevMap = new Map()) {
  const { puts, deleteIds, curr } = recordDelta(records, prevMap);
  await putChunked(SUBROWS, projectId, puts);
  if (deleteIds.length) {
    const database = await db();
    for (let i = 0; i < deleteIds.length; i += WRITE_CHUNK) {
      const tx = database.transaction(SUBROWS, 'readwrite');
      const end = Math.min(i + WRITE_CHUNK, deleteIds.length);
      for (let j = i; j < end; j++) tx.store.delete(rowKey(projectId, deleteIds[j]));
      await tx.done;
    }
  }
  return curr;
}

// Delete every record row for a project (project delete / wipe).
export async function deleteProjectRecords(projectId) {
  try {
    await (await db()).delete(SUBROWS, rangeFor(projectId));
    await del(KEYS.subdomains(projectId)); // drop any un-migrated legacy blob too
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
