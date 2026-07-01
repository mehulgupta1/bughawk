// portdiff.js — compare two sets of port records and report what changed.
// Used to diff the current live data against a saved session snapshot
// (or any two record arrays). Pure, never throws.

function isOpen(r) {
  return !!(r.state && r.state.startsWith('open'));
}

// Compare baseline (prev) -> current (curr). Returns grouped changes.
//   opened  : port now open that wasn't open/present before
//   closed  : port that was open before but is gone or no longer open
//   changed : same port, but service/product/version/state changed
export function diffRecords(prevRecords, currRecords) {
  const prev = new Map((prevRecords || []).map((r) => [r.key, r]));
  const curr = new Map((currRecords || []).map((r) => [r.key, r]));

  const opened = [];
  const closed = [];
  const changed = [];

  for (const [key, c] of curr) {
    const p = prev.get(key);
    if (!p) {
      if (isOpen(c)) opened.push(c);
      continue;
    }
    const wasOpen = isOpen(p);
    const nowOpen = isOpen(c);
    if (nowOpen && !wasOpen) {
      opened.push(c);
      continue; // counted as opened, don't double-report
    }
    if (!nowOpen && wasOpen) {
      closed.push(c);
      continue;
    }
    // same open/closed status — did the service fingerprint move?
    if (c.product !== p.product || c.version !== p.version || c.service !== p.service || c.state !== p.state) {
      changed.push({
        rec: c,
        from: { state: p.state, label: svcLabel(p) },
        to: { state: c.state, label: svcLabel(c) },
      });
    }
  }

  // Ports that existed (open) in baseline but are absent from current.
  for (const [key, p] of prev) {
    if (!curr.has(key) && isOpen(p)) closed.push(p);
  }

  return { opened, closed, changed };
}

function svcLabel(r) {
  return [r.service, r.product, r.version].filter(Boolean).join(' ') || '—';
}

export function diffIsEmpty(d) {
  return !d || (d.opened.length === 0 && d.closed.length === 0 && d.changed.length === 0);
}

// Group a diff by host for display: host -> { opened[], closed[], changed[] }.
export function groupDiffByHost(diff) {
  const m = new Map();
  const bucket = (host) => {
    if (!m.has(host)) m.set(host, { opened: [], closed: [], changed: [] });
    return m.get(host);
  };
  for (const r of diff.opened) bucket(r.host).opened.push(r);
  for (const r of diff.closed) bucket(r.host).closed.push(r);
  for (const c of diff.changed) bucket(c.rec.host).changed.push(c);
  return [...m.entries()].sort((a, b) => totalChanges(b[1]) - totalChanges(a[1]) || a[0].localeCompare(b[0]));
}

function totalChanges(g) {
  return g.opened.length + g.closed.length + g.changed.length;
}
