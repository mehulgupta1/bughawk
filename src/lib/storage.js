// IndexedDB-backed key/value store. Same `bbd:` key pattern as before, but the
// engine underneath is IndexedDB (via `idb`) instead of localStorage. All
// functions return Promises.
import { openDB } from 'idb';

const PREFIX = 'bbd:';
const DB_NAME = 'bbd-db';
const STORE = 'kv';

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
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
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
