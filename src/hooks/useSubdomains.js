import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as storage from '../lib/storage.js';
import { statusGroup, STATUS_GROUPS } from '../lib/status.js';
import { logPerf } from '../lib/telemetry.js';

const { KEYS } = storage;
const ACTIVITY_CAP = 50;
const HISTORY_CAP = 50;
const NEW_IDS_CAP = 500;

function computeBreakdown(records) {
  const b = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
  for (const r of records) b[statusGroup(r.status)]++;
  return b;
}

// activity-log snapshot shape uses short keys per the spec.
function snapshotBreakdown(records) {
  const b = { twoXX: 0, threeXX: 0, fourXX: 0, fiveXX: 0, other: 0 };
  const map = { '2xx': 'twoXX', '3xx': 'threeXX', '4xx': 'fourXX', '5xx': 'fiveXX', other: 'other' };
  for (const r of records) b[map[statusGroup(r.status)]]++;
  return b;
}

export { STATUS_GROUPS };

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Build a fresh record from a parsed partial.
function makeRecord(partial, now) {
  const t = now ?? Date.now();
  return {
    id: uid(),
    host: partial.host,
    status: partial.status,
    title: partial.title || '',
    tech: partial.tech || [],
    length: partial.length ?? null,
    ip: partial.ip ?? null,
    fields: partial.fields || {}, // full set of detected fields (dynamic columns)
    history: [{ status: partial.status, observedAt: t }],
    tag: false, // star / flagged
    tags: [], // colored labels: interesting/login/api/cdn/oos
    audit: 'untested', // untested | tested | vulnerable
    note: '',
    addedAt: t,
  };
}

// Append a history entry only when status actually changed from the latest one.
function pushHistory(history, status, now) {
  const h = Array.isArray(history) ? history : [];
  const last = h.length ? h[h.length - 1] : null;
  if (last && String(last.status) === String(status)) return h;
  const next = [...h, { status, observedAt: now }];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

// Pure import/merge: dedupe by host, track history, build the activity entry.
// Exported for testing. Returns { records, entry, summary }.
export function mergeImport(prevRecords, partials, now = Date.now()) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const newHostIds = [];

  const byHost = new Map();
  for (const r of prevRecords) byHost.set(r.host, r);

  for (const p of partials) {
    if (!p.host) {
      skipped++;
      continue;
    }
    const existing = byHost.get(p.host);
    if (!existing) {
      const rec = makeRecord(p, now);
      byHost.set(p.host, rec);
      newHostIds.push(rec.id);
      added++;
    } else {
      const mergedStatus = p.status !== 'unknown' ? p.status : existing.status;
      byHost.set(p.host, {
        ...existing,
        status: mergedStatus,
        title: p.title || existing.title,
        tech: p.tech && p.tech.length ? p.tech : existing.tech,
        length: p.length ?? existing.length,
        ip: p.ip ?? existing.ip ?? null,
        fields: { ...(existing.fields || {}), ...(p.fields || {}) },
        history: pushHistory(existing.history, mergedStatus, now),
      });
      updated++;
    }
  }

  const records = Array.from(byHost.values());
  const entry = {
    id: uid(),
    at: now,
    added,
    updated,
    skipped,
    total: partials.length,
    statusBreakdown: snapshotBreakdown(records),
    totalCount: records.length,
    newCount: newHostIds.length,
    newHostIds: newHostIds.slice(0, NEW_IDS_CAP),
  };
  return { records, entry, summary: { added, updated, skipped } };
}

// Manages the subdomain dataset + activity log for ONE active project.
// Switching projectId reloads the namespaced dataset (full isolation).
export function useSubdomains(projectId, onMeta) {
  const [records, setRecords] = useState([]);
  const [activity, setActivity] = useState([]);
  const [sessions, setSessions] = useState([]); // in-app named snapshots
  const [isLoading, setIsLoading] = useState(true);
  const loadedFor = useRef(null);
  const freshLoad = useRef(false);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  // id -> record currently persisted to the row store, so writes touch only
  // what changed (see storage.syncRecords).
  const persistedRef = useRef(new Map());

  // Load when the active project changes.
  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setRecords([]);
      setActivity([]);
      setSessions([]);
      setIsLoading(false);
      loadedFor.current = null;
      persistedRef.current = new Map();
      return;
    }
    setIsLoading(true);
    loadedFor.current = null;
    (async () => {
      const _t = import.meta.env?.DEV ? performance.now() : 0;
      const [data, log, sess] = await Promise.all([
        storage.loadRecords(projectId),
        storage.get(KEYS.activity(projectId), []),
        storage.get(KEYS.subSessions(projectId), []),
      ]);
      if (import.meta.env?.DEV) {
        const ms = Math.round(performance.now() - _t);
        console.log(`[load subs] ${ms}ms — records=${Array.isArray(data) ? data.length : 0}, sessions=${Array.isArray(sess) ? sess.length : 0}`);
        logPerf('load-subs', { ms, records: Array.isArray(data) ? data.length : 0 });
      }
      if (cancelled) return;
      freshLoad.current = true; // don't re-write what we just read back
      const recs = Array.isArray(data) ? data : [];
      persistedRef.current = new Map(recs.map((r) => [r.id, r]));
      setRecords(recs);
      setActivity(Array.isArray(log) ? log : []);
      setSessions(Array.isArray(sess) ? sess : []);
      loadedFor.current = projectId;
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Debounced persist for in-place edits (tag/note). Skips the initial load.
  useEffect(() => {
    if (!projectId || loadedFor.current !== projectId) return;
    if (onMeta) onMeta(projectId, { subdomainCount: records.length });
    // Records that were just loaded from storage don't need to be written back.
    if (freshLoad.current) {
      freshLoad.current = false;
      return;
    }
    const id = setTimeout(() => {
      storage.syncRecords(projectId, records, persistedRef.current)
        .then((m) => { persistedRef.current = m; });
    }, 400);
    return () => clearTimeout(id);
  }, [records, projectId, onMeta]);

  // Merge parsed partials, dedupe by host, append an activity entry, and write
  // records + activity in a single IndexedDB transaction. Returns the summary.
  const importRecords = useCallback(
    async (partials) => {
      if (!projectId) return { added: 0, updated: 0, skipped: 0 };
      const { records: nextRecords, entry, summary } = mergeImport(
        recordsRef.current,
        partials
      );
      const nextActivity = [entry, ...activity].slice(0, ACTIVITY_CAP);

      persistedRef.current = await storage.syncRecords(projectId, nextRecords, persistedRef.current);
      await storage.set(KEYS.activity(projectId), nextActivity);

      setRecords(nextRecords);
      setActivity(nextActivity);
      if (onMeta)
        onMeta(projectId, {
          subdomainCount: nextRecords.length,
          breakdown: computeBreakdown(nextRecords),
          lastImportedAt: entry.at,
        });

      return summary;
    },
    [projectId, activity, onMeta]
  );

  const toggleTag = useCallback((id) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, tag: !r.tag, taggedAt: !r.tag ? Date.now() : null } : r
      )
    );
  }, []);

  const setNote = useCallback((id, note) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
  }, []);

  const setAudit = useCallback((id, audit) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, audit } : r)));
  }, []);

  // Toggle a single colored tag on a record.
  const toggleLabel = useCallback((id, label) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const tags = r.tags || [];
        return {
          ...r,
          tags: tags.includes(label) ? tags.filter((t) => t !== label) : [...tags, label],
        };
      })
    );
  }, []);

  // Bulk: add a colored tag to many records.
  const bulkAddLabel = useCallback((ids, label) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setRecords((prev) =>
      prev.map((r) => {
        if (!set.has(r.id)) return r;
        const tags = r.tags || [];
        return tags.includes(label) ? r : { ...r, tags: [...tags, label] };
      })
    );
  }, []);

  // Bulk: set audit on many records.
  const bulkSetAudit = useCallback((ids, audit) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setRecords((prev) => prev.map((r) => (set.has(r.id) ? { ...r, audit } : r)));
  }, []);

  const deleteMany = useCallback((ids) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setRecords((prev) => prev.filter((r) => !set.has(r.id)));
  }, []);

  const clearAll = useCallback(() => setRecords([]), []);

  const loadSession = useCallback(async (sessionData) => {
    if (!projectId || !sessionData) return;
    const nextRecords = Array.isArray(sessionData.records) ? sessionData.records : (Array.isArray(sessionData) ? sessionData : []);
    const nextActivity = Array.isArray(sessionData.activity) ? sessionData.activity : [];

    // Wholesale replace: syncRecords deletes rows not in the session and writes
    // the new ones in one transaction.
    persistedRef.current = await storage.syncRecords(projectId, nextRecords, persistedRef.current);
    await storage.set(KEYS.activity(projectId), nextActivity);
    setRecords(nextRecords);
    setActivity(nextActivity);
  }, [projectId]);

  // ── In-app named sessions (snapshots stored in IndexedDB, reload anytime) ──
  const saveNamedSession = useCallback(async (name) => {
    if (!projectId) return;
    const snap = {
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
      name: (name || '').trim() || `Session ${new Date().toLocaleString()}`,
      at: Date.now(),
      count: recordsRef.current.length,
      records: recordsRef.current,
      activity,
    };
    const next = [snap, ...sessions].slice(0, 50);
    setSessions(next);
    await storage.set(KEYS.subSessions(projectId), next);
  }, [projectId, sessions, activity]);

  const loadNamedSession = useCallback(async (id) => {
    const s = sessions.find((x) => x.id === id);
    if (s) await loadSession(s);
  }, [sessions, loadSession]);

  const deleteNamedSession = useCallback(async (id) => {
    if (!projectId) return;
    const next = sessions.filter((x) => x.id !== id);
    setSessions(next);
    await storage.set(KEYS.subSessions(projectId), next);
  }, [projectId, sessions]);

  // Stable object identity (all methods are useCallback'd) so consumers can be
  // memoized and don't re-render on unrelated tab switches.
  return useMemo(() => ({
    records,
    activity,
    sessions,
    isLoading,
    importRecords,
    toggleTag,
    toggleLabel,
    bulkAddLabel,
    setAudit,
    bulkSetAudit,
    deleteMany,
    setNote,
    clearAll,
    loadSession,
    saveNamedSession,
    loadNamedSession,
    deleteNamedSession,
  }), [records, activity, sessions, isLoading, importRecords, toggleTag, toggleLabel, bulkAddLabel, setAudit, bulkSetAudit, deleteMany, setNote, clearAll, loadSession, saveNamedSession, loadNamedSession, deleteNamedSession]);
}

// Derive a filtered + sorted view. Memoized so rows don't re-filter per render.
// `statusCode`: exact code to match (number or string), or null for all.
// `flaggedOnly`: when true, restrict to tagged hosts.
export function useFilteredRecords(records, { query, statusCode, flaggedOnly, sort }) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const useCode = statusCode != null && statusCode !== 'all';

    let out;
    if (q || useCode || flaggedOnly) {
      out = records.filter((r) => {
        if (q && !r.host.includes(q)) return false;
        if (flaggedOnly && !r.tag) return false;
        if (useCode && String(r.status) !== String(statusCode)) return false;
        return true;
      });
    } else {
      out = records.slice();
    }

    if (sort && sort.key) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      out = out.slice().sort((a, b) => {
        if (sort.key === 'host') {
          return a.host < b.host ? -dir : a.host > b.host ? dir : 0;
        }
        if (sort.key === 'length') {
          return ((a.length ?? -1) - (b.length ?? -1)) * dir;
        }
        if (sort.key === 'status') {
          const av = typeof a.status === 'number' ? a.status : 999;
          const bv = typeof b.status === 'number' ? b.status : 999;
          return (av - bv) * dir;
        }
        return 0;
      });
    }
    return out;
  }, [records, query, statusCode, flaggedOnly, sort]);
}
