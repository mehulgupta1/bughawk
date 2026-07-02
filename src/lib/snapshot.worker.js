// Attack-surface snapshot, computed off the main thread. App auto-snapshots
// after every subs/ports change; snapshotSig scans all records, so at 100k that
// was a multi-hundred-ms main-thread stall on every import/edit. The worker
// reads the data from IndexedDB and does the diff + write itself.
import { get, KEYS, loadRecords } from './storage.js';
import { recordSnapshot } from './events.js';

onmessage = async (e) => {
  const { projectId } = e.data || {};
  if (!projectId) return;
  try {
    const [subs, ports] = await Promise.all([
      loadRecords(projectId),
      get(KEYS.ports(projectId), []),
    ]);
    await recordSnapshot(projectId, subs, ports);
  } catch { /* best effort — the feed just won't update this round */ }
};
