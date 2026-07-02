import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as storage from '../lib/storage.js';
import { timed } from '../lib/telemetry.js';

const { KEYS } = storage;
const ACTIVITY_CAP = 50;
const HISTORY_CAP = 50;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Dedupe identity for a port record: host + port + protocol.
export function portKey(p) {
  return `${p.host}:${p.port}/${p.proto || 'tcp'}`;
}

function makeRecord(p, now) {
  const t = now ?? Date.now();
  return {
    id: uid(),
    key: portKey(p),
    host: p.host,
    ip: p.ip ?? null,
    port: p.port,
    proto: p.proto || 'tcp',
    state: p.state || 'open',
    service: p.service || '',
    product: p.product || '',
    version: p.version || '',
    cpe: p.cpe || '',
    banner: p.banner || '',
    scripts: p.scripts || {},
    // cve layer (filled async)
    cves: [],
    kev: false,
    epss: null,
    cveFetchedAt: null,
    // workflow (mirrors subdomain record)
    history: [{ state: p.state || 'open', observedAt: t }],
    tag: false,
    tags: [],
    audit: 'untested',
    note: '',
    addedAt: t,
  };
}

function pushHistory(history, state, now) {
  const h = Array.isArray(history) ? history : [];
  const last = h.length ? h[h.length - 1] : null;
  if (last && String(last.state) === String(state)) return h;
  const next = [...h, { state, observedAt: now }];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

// Pure import/merge: dedupe by host:port/proto, track state history, build the
// activity entry (closed-port detection included). Exported for testing.
export function mergeImport(prevRecords, partials, now = Date.now()) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const newIds = [];
  const seenKeys = new Set();

  const byKey = new Map();
  for (const r of prevRecords) byKey.set(r.key, r);

  for (const p of partials) {
    if (!p.host || p.port == null) { skipped++; continue; }
    const k = portKey(p);
    seenKeys.add(k);
    const existing = byKey.get(k);
    if (!existing) {
      const rec = makeRecord(p, now);
      byKey.set(k, rec);
      newIds.push(rec.id);
      added++;
    } else {
      byKey.set(k, {
        ...existing,
        ip: p.ip ?? existing.ip,
        state: p.state || existing.state,
        service: p.service || existing.service,
        product: p.product || existing.product,
        version: p.version || existing.version,
        cpe: p.cpe || existing.cpe,
        banner: p.banner || existing.banner,
        scripts: { ...(existing.scripts || {}), ...(p.scripts || {}) },
        history: pushHistory(existing.history, p.state || existing.state, now),
      });
      updated++;
    }
  }

  const records = Array.from(byKey.values());
  const entry = {
    id: uid(), at: now, added, updated, skipped,
    total: partials.length, newIds: newIds.slice(0, 500),
    openCount: records.filter((r) => (r.state || '').startsWith('open')).length,
    totalCount: records.length,
  };
  return { records, entry, summary: { added, updated, skipped } };
}

// Manages port records + activity log for ONE active project. Mirrors
// useSubdomains: switching project reloads the namespaced dataset.
const SESSIONS_CAP = 30;

export function usePorts(projectId, onMeta) {
  const [records, setRecords] = useState([]);
  const [activity, setActivity] = useState([]);
  const [sessions, setSessions] = useState([]); // in-app named snapshots
  const [isLoading, setIsLoading] = useState(true);
  const loadedFor = useRef(null);
  const freshLoad = useRef(false);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setRecords([]); setActivity([]); setSessions([]); setIsLoading(false); loadedFor.current = null;
      return;
    }
    setIsLoading(true);
    loadedFor.current = null;
    (async () => {
      const [data, log, snaps] = await Promise.all([
        storage.get(KEYS.ports(projectId), []),
        storage.get(KEYS.portActivity(projectId), []),
        storage.get(KEYS.portSessions(projectId), []),
      ]);
      if (cancelled) return;
      freshLoad.current = true;
      setRecords(Array.isArray(data) ? data : []);
      setActivity(Array.isArray(log) ? log : []);
      setSessions(Array.isArray(snaps) ? snaps : []);
      loadedFor.current = projectId;
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Debounced persist for in-place edits (tag/note/cve), skipping initial load.
  useEffect(() => {
    if (!projectId || loadedFor.current !== projectId) return;
    if (onMeta) onMeta(projectId, { portCount: records.length });
    if (freshLoad.current) { freshLoad.current = false; return; }
    const id = setTimeout(() => storage.set(KEYS.ports(projectId), records), 400);
    return () => clearTimeout(id);
  }, [records, projectId, onMeta]);

  const importRecords = useCallback((partials) => timed(`Import ports (${(partials || []).length} rows)`, async () => {
    if (!projectId) return { added: 0, updated: 0, skipped: 0 };
    const { records: next, entry, summary } = mergeImport(recordsRef.current, partials);
    const nextActivity = [entry, ...activity].slice(0, ACTIVITY_CAP);
    await storage.setMany([
      [KEYS.ports(projectId), next],
      [KEYS.portActivity(projectId), nextActivity],
    ]);
    setRecords(next);
    setActivity(nextActivity);
    return summary;
  }), [projectId, activity]);

  // Apply a Map<recordId, {cves,kev,epss}> from the cve layer and persist.
  const applyCve = useCallback((resultMap) => {
    if (!resultMap || !resultMap.size) return;
    const now = Date.now();
    setRecords((prev) => prev.map((r) => {
      const d = resultMap.get(r.id);
      if (!d) return r;
      return { ...r, cves: d.cves, kev: d.kev, epss: d.epss, cveFetchedAt: now };
    }));
  }, []);

  const toggleTag = useCallback((id) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, tag: !r.tag } : r)));
  }, []);
  const setNote = useCallback((id, note) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
  }, []);
  const setAudit = useCallback((id, audit) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, audit } : r)));
  }, []);
  const toggleLabel = useCallback((id, label) => {
    setRecords((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const tags = r.tags || [];
      return { ...r, tags: tags.includes(label) ? tags.filter((t) => t !== label) : [...tags, label] };
    }));
  }, []);
  const bulkSetAudit = useCallback((ids, audit) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setRecords((prev) => prev.map((r) => (set.has(r.id) ? { ...r, audit } : r)));
  }, []);
  const deleteMany = useCallback((ids) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    setRecords((prev) => prev.filter((r) => !set.has(r.id)));
  }, []);
  // Load a full session backup ({records, activity}) and persist it, replacing
  // the current project's port data.
  const loadSession = useCallback(async (sessionData) => {
    if (!projectId || !sessionData) return;
    const nextRecords = Array.isArray(sessionData.records)
      ? sessionData.records
      : Array.isArray(sessionData) ? sessionData : [];
    const nextActivity = Array.isArray(sessionData.activity) ? sessionData.activity : [];
    await storage.setMany([
      [KEYS.ports(projectId), nextRecords],
      [KEYS.portActivity(projectId), nextActivity],
    ]);
    setRecords(nextRecords);
    setActivity(nextActivity);
  }, [projectId]);

  // ── In-app named snapshots (stored in IndexedDB per project) ──

  const persistSessions = useCallback(async (next) => {
    setSessions(next);
    if (projectId) await storage.set(KEYS.portSessions(projectId), next);
  }, [projectId]);

  // Save the current port data as a named snapshot. Returns the snapshot.
  const saveSnapshot = useCallback(async (name) => {
    if (!projectId) return null;
    const snap = {
      id: uid(),
      name: (name || `Session ${new Date().toLocaleString()}`).trim(),
      savedAt: Date.now(),
      count: recordsRef.current.length,
      records: recordsRef.current,
      activity,
    };
    const next = [snap, ...sessions].slice(0, SESSIONS_CAP);
    await persistSessions(next);
    return snap;
  }, [projectId, sessions, activity, persistSessions]);

  // Reload a saved snapshot into the live dataset (overwrites current).
  const reloadSnapshot = useCallback(async (id) => {
    const snap = sessions.find((s) => s.id === id);
    if (!snap || !projectId) return;
    const nextRecords = Array.isArray(snap.records) ? snap.records : [];
    const nextActivity = Array.isArray(snap.activity) ? snap.activity : [];
    await storage.setMany([
      [KEYS.ports(projectId), nextRecords],
      [KEYS.portActivity(projectId), nextActivity],
    ]);
    setRecords(nextRecords);
    setActivity(nextActivity);
  }, [sessions, projectId]);

  const deleteSnapshot = useCallback(async (id) => {
    await persistSessions(sessions.filter((s) => s.id !== id));
  }, [sessions, persistSessions]);

  const renameSnapshot = useCallback(async (id, name) => {
    await persistSessions(sessions.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)));
  }, [sessions, persistSessions]);

  const clearAll = useCallback(() => {
    setRecords([]);
    setActivity([]);
    if (projectId) {
      storage.setMany([
        [KEYS.ports(projectId), []],
        [KEYS.portActivity(projectId), []],
      ]);
    }
  }, [projectId]);

  return {
    records, activity, sessions, isLoading,
    importRecords, applyCve, loadSession,
    saveSnapshot, reloadSnapshot, deleteSnapshot, renameSnapshot,
    toggleTag, setNote, setAudit, toggleLabel, bulkSetAudit, deleteMany, clearAll,
  };
}
