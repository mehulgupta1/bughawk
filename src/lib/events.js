// Event-sourced surface log. Each import diffs against the previous snapshot and
// appends timestamped events; the feed/churn/resurrection views are reducers
// over that append-only array.
import { get, set, KEYS } from './storage.js';

// Minimal per-host signature used for diffing.
export function snapshotSig(subs = [], ports = []) {
  const sig = {};
  for (const s of subs) {
    if (!s.host) continue;
    sig[s.host] = sig[s.host] || { ports: [], status: s.status ?? null };
  }
  for (const p of ports) {
    if (!p.host) continue;
    sig[p.host] = sig[p.host] || { ports: [], status: null };
    if (p.port && !sig[p.host].ports.includes(p.port)) sig[p.host].ports.push(p.port);
  }
  return sig;
}

// Diff prev -> curr. A host reappearing after a prior host_gone is host_back
// (resurrection), not host_new. Returns the new events to append.
export function computeEvents(prevSig = {}, currSig = {}, priorEvents = [], now = Date.now()) {
  const ev = [];
  const goneBefore = new Set(priorEvents.filter((e) => e.type === 'host_gone').map((e) => e.entity));
  for (const h of Object.keys(currSig)) {
    if (!(h in prevSig)) {
      ev.push({ ts: now, type: goneBefore.has(h) ? 'host_back' : 'host_new', entity: h });
    } else {
      for (const p of currSig[h].ports) {
        if (!prevSig[h].ports.includes(p)) ev.push({ ts: now, type: 'port_new', entity: h, detail: p });
      }
    }
  }
  for (const h of Object.keys(prevSig)) {
    if (!(h in currSig)) ev.push({ ts: now, type: 'host_gone', entity: h });
  }
  return ev;
}

export function newHostsSince(events = [], since = 0) {
  return new Set(events.filter((e) => (e.type === 'host_new' || e.type === 'host_back') && e.ts >= since).map((e) => e.entity));
}

export function resurrections(events = []) {
  return events.filter((e) => e.type === 'host_back');
}

// Persist a snapshot for a project and append any change events. Called
// automatically after every import. First snapshot establishes a silent
// baseline (no flood of host_new for pre-existing data). Returns # new events.
export async function recordSnapshot(projectId, subs, ports) {
  if (!projectId) return 0;
  // Don't snapshot an empty/loading state (would emit spurious host_gone).
  if ((!subs || subs.length === 0) && (!ports || ports.length === 0)) return 0;
  const currSig = snapshotSig(subs, ports);
  const prev = await get(KEYS.surfaceSnapshot(projectId), null);
  if (!prev) {
    await set(KEYS.surfaceSnapshot(projectId), { ts: Date.now(), sig: currSig });
    return 0;
  }
  const events = await get(KEYS.surfaceEvents(projectId), []);
  const newEvents = computeEvents(prev.sig || {}, currSig, events, Date.now());
  if (newEvents.length === 0) return 0;
  await set(KEYS.surfaceEvents(projectId), [...events, ...newEvents]);
  await set(KEYS.surfaceSnapshot(projectId), { ts: Date.now(), sig: currSig });
  return newEvents.length;
}

// Hosts ranked by how often they changed (churn = where new code/bugs land).
export function churn(events = []) {
  const m = {};
  for (const e of events) m[e.entity] = (m[e.entity] || 0) + 1;
  return Object.entries(m).map(([entity, count]) => ({ entity, count })).sort((a, b) => b.count - a.count);
}
