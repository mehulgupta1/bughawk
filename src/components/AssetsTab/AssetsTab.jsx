import { useMemo, useRef, useState } from 'react';
import { classifyLine, extractHost, normalizeValue, splitLines } from '../../lib/assets.js';
import StatusBadge from '../SubdomainTab/StatusBadge.jsx';
import { useActiveValue } from '../../hooks/useActiveValue.js';

// Per-project storage vault: three buckets of raw assets (subdomains / URLs / JS
// files) with smart auto-routing, cross-tab send/pull, scope awareness, normalize
// tools, multi-select bulk ops, source tags, new-since-last-seen, dead-endpoint
// detection, and full-vault JSON backup.

const SECTIONS = [
  { key: 'subdomains', label: 'Subdomains', icon: '🌐', ph: 'Paste subdomains, one per line…' },
  { key: 'urls', label: 'URLs', icon: '🔗', ph: 'Paste URLs, one per line…' },
  { key: 'jsfiles', label: 'JS Files', icon: '📜', ph: 'Paste .js file URLs, one per line…' },
];
const RENDER_CAP = 1000;
const EMPTY = { subdomains: [], urls: [], jsfiles: [], seen: {}, activity: [] };
const BUCKET_LABEL = { subdomains: 'Subdomains', urls: 'URLs', jsfiles: 'JS Files' };
const ACTIVITY_CAP = 50;

function actId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function withActivity(dataObj, entry) {
  return { ...dataObj, activity: [entry, ...(dataObj.activity || [])].slice(0, ACTIVITY_CAP) };
}

// Item: { v, src, addedAt, dead }. Migrate legacy string arrays transparently.
function toItem(x) {
  if (typeof x === 'string') return { v: x, addedAt: 0 };
  return { v: x.v, src: x.src, addedAt: x.addedAt || 0, dead: x.dead };
}
function bucketItems(data, key) {
  return (data[key] || []).map(toItem);
}

export default function AssetsTab({ assets, onSave, onCopyToast, subRecords: rawSubRecords, tabActive = true, onSendToSubdomains, scopeStatus, hasScope }) {
  // Freeze while hidden (kept-mounted) so a background load/import doesn't
  // recompute dead-endpoint detection over 100k subdomains off-screen.
  const subRecords = useActiveValue(rawSubRecords || [], tabActive);
  const data = assets || EMPTY;
  const [active, setActive] = useState('subdomains');
  const [smartOpen, setSmartOpen] = useState(false);

  const ipCount = useMemo(() => new Set((subRecords || []).map((r) => r.ip).filter(Boolean)).size, [subRecords]);

  const saveBucket = (key, items) => onSave({ ...data, [key]: items });

  // Append values to a bucket as items, deduping against existing values.
  const appendTo = (key, values, src) => {
    const items = bucketItems(data, key);
    const existing = new Set(items.map((i) => i.v.toLowerCase()));
    const now = Date.now();
    const added = [];
    for (const v of values) {
      const val = v.trim();
      if (!val) continue;
      if (existing.has(val.toLowerCase())) continue;
      existing.add(val.toLowerCase());
      added.push({ v: val, src: src || undefined, addedAt: now });
    }
    if (!added.length) return 0;
    const entry = { id: actId(), at: now, added: added.length, label: `Added ${added.length} to ${BUCKET_LABEL[key]}${src ? ` · ${src}` : ''}` };
    onSave(withActivity({ ...data, [key]: [...added, ...items] }, entry));
    return added.length;
  };

  // Smart import: route each line to its bucket.
  const smartImport = (text, src) => {
    const lines = splitLines(text);
    const routed = { subdomains: [], urls: [], jsfiles: [] };
    for (const l of lines) {
      const k = classifyLine(l);
      if (k) routed[k].push(l);
    }
    const now = Date.now();
    const next = { ...data };
    let total = 0;
    for (const key of ['subdomains', 'urls', 'jsfiles']) {
      if (!routed[key].length) continue;
      const items = bucketItems(next, key);
      const existing = new Set(items.map((i) => i.v.toLowerCase()));
      const added = [];
      for (const v of routed[key]) {
        if (existing.has(v.toLowerCase())) continue;
        existing.add(v.toLowerCase());
        added.push({ v, src: src || undefined, addedAt: now });
      }
      next[key] = [...added, ...items];
      total += added.length;
    }
    if (total > 0) {
      const entry = { id: actId(), at: now, added: total, label: `Smart-imported ${total} assets (${routed.subdomains.length} subs · ${routed.urls.length} urls · ${routed.jsfiles.length} js)${src ? ` · ${src}` : ''}` };
      onSave(withActivity(next, entry));
    } else {
      onSave(next);
    }
    onCopyToast?.(
      `Routed: ${routed.subdomains.length} subdomains, ${routed.urls.length} URLs, ${routed.jsfiles.length} JS · ${total} new`
    );
  };

  const importVault = (json) => {
    const next = { ...EMPTY, seen: {} };
    for (const key of ['subdomains', 'urls', 'jsfiles']) {
      if (Array.isArray(json[key])) next[key] = json[key].map(toItem);
    }
    onSave(next);
    onCopyToast?.('Vault imported');
  };

  return (
    <div className="tab-content">
      <div className="tab-head asset-head">
        <div>
          <h2>Assets</h2>
          <p>Store raw subdomains, URLs &amp; JS links. Auto-routes, dedupes, and feeds your other tabs.</p>
        </div>
        <div className="asset-head-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setSmartOpen((o) => !o)}>✦ Smart import</button>
          <VaultMenu data={data} onImport={importVault} onCopyToast={onCopyToast} />
        </div>
      </div>

      {smartOpen && <SmartImport onImport={smartImport} onClose={() => setSmartOpen(false)} />}

      <div className="asset-tabs">
        {SECTIONS.map((s) => (
          <button key={s.key} className={`asset-tab${active === s.key ? ' active' : ''}`} onClick={() => setActive(s.key)}>
            <span>{s.icon} {s.label}</span>
            <span className="asset-tab-count">{bucketItems(data, s.key).length.toLocaleString()}</span>
          </button>
        ))}
        <button className={`asset-tab${active === 'ips' ? ' active' : ''}`} onClick={() => setActive('ips')}>
          <span>🖥 IPs</span>
          <span className="asset-tab-count">{ipCount.toLocaleString()}</span>
        </button>
      </div>

      {active === 'ips' ? (
        <IpsView subRecords={subRecords || []} onCopyToast={onCopyToast} />
      ) : (
        <AssetBucket
          key={active}
          section={SECTIONS.find((s) => s.key === active)}
          items={bucketItems(data, active)}
          seenAt={data.seen?.[active] || 0}
          onSave={(items) => saveBucket(active, items)}
          onMarkSeen={() => onSave({ ...data, seen: { ...(data.seen || {}), [active]: Date.now() } })}
          appendTo={appendTo}
          onCopyToast={onCopyToast}
          subRecords={subRecords || []}
          onSendToSubdomains={onSendToSubdomains}
          scopeStatus={scopeStatus}
          hasScope={hasScope}
        />
      )}
    </div>
  );
}

function SmartImport({ onImport, onClose }) {
  const ref = useRef(null);
  const [src, setSrc] = useState('');
  const run = () => { onImport(ref.current?.value || '', src); if (ref.current) ref.current.value = ''; };
  return (
    <section className="import-panel smart-import">
      <div className="smart-import-head">Paste a mixed dump — lines are auto-sorted into Subdomains / URLs / JS Files.</div>
      <textarea ref={ref} className="import-panel-textarea mono" placeholder="Paste anything — katana, gau, mixed lists…" spellCheck={false}
        onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); const r = new FileReader(); r.onload = (ev) => { ref.current.value = ev.target.result; }; r.readAsText(f); } }} />
      <div className="import-panel-bar">
        <input className="asset-src-input" placeholder="source tag (optional, e.g. katana)" value={src} onChange={(e) => setSrc(e.target.value)} />
        <div className="import-panel-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-grad" onClick={run}>Auto-route &amp; add</button>
      </div>
    </section>
  );
}

function AssetBucket({ section, items, seenAt, onSave, onMarkSeen, appendTo, onCopyToast, subRecords, onSendToSubdomains, scopeStatus, hasScope }) {
  const taRef = useRef(null);
  const [src, setSrc] = useState('');
  const [query, setQuery] = useState('');
  const [hideOos, setHideOos] = useState(false);
  const [hideDead, setHideDead] = useState(true);
  const [newOnly, setNewOnly] = useState(false);
  const [checked, setChecked] = useState(() => new Set());

  const isUrlish = section.key === 'urls' || section.key === 'jsfiles';

  const add = () => {
    const n = appendTo(section.key, splitLines(taRef.current?.value || ''), src);
    if (taRef.current) taRef.current.value = '';
    onCopyToast?.(`${n} added`);
  };

  // ---- subdomain status index for dead detection / scope ----
  const subHostStatus = useMemo(() => {
    const m = new Map();
    for (const r of subRecords) m.set(r.host, r.status);
    return m;
  }, [subRecords]);

  const deadHosts = useMemo(() => {
    const s = new Set();
    for (const [host, status] of subHostStatus) {
      if (status === 404 || (typeof status === 'number' && status >= 500)) s.add(host);
    }
    return s;
  }, [subHostStatus]);

  // ---- derived rows ----
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !it.v.toLowerCase().includes(q)) return false;
      if (newOnly && !(it.addedAt > seenAt)) return false;
      if (hideDead && it.dead) return false;
      if (hasScope && hideOos && scopeStatus(extractHost(it.v)) === 'out') return false;
      return true;
    });
  }, [items, query, newOnly, seenAt, hideDead, hideOos, hasScope, scopeStatus]);

  const newCount = useMemo(() => items.filter((i) => i.addedAt > seenAt).length, [items, seenAt]);
  const deadCount = useMemo(() => items.filter((i) => i.dead).length, [items]);

  // ---- actions ----
  const values = (arr) => arr.map((i) => i.v);
  const copyList = () => navigator.clipboard?.writeText(values(filtered).join('\n')).then(() => onCopyToast?.(`Copied ${filtered.length}`));
  const exportTxt = () => downloadTxt(values(filtered).join('\n'), section.key);
  const clearAll = () => { if (confirm(`Clear all ${items.length} ${section.label.toLowerCase()}?`)) onSave([]); };
  const removeVals = (set) => onSave(items.filter((i) => !set.has(i.v)));

  const normalize = (opts) => {
    const seen = new Set();
    let out = [];
    for (const it of items) {
      const v = normalizeValue(it.v, opts);
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...it, v });
    }
    if (opts.sort) out = out.sort((a, b) => a.v.localeCompare(b.v));
    onSave(out);
    onCopyToast?.('Normalized & deduped');
  };

  const detectDead = () => {
    let n = 0;
    const out = items.map((it) => {
      const dead = deadHosts.has(extractHost(it.v));
      if (dead && !it.dead) n++;
      return { ...it, dead };
    });
    onSave(out);
    onCopyToast?.(deadHosts.size === 0 ? 'No dead hosts in Subdomains tab yet (need 404/5xx statuses)' : `${n} URL(s) marked dead from ${deadHosts.size} dead host(s)`);
  };

  const extractHostsToSubs = () => {
    const hosts = [...new Set(items.map((i) => extractHost(i.v)).filter(Boolean))];
    const n = appendTo('subdomains', hosts);
    onCopyToast?.(`${n} host(s) added to Subdomains bucket`);
  };

  const sendToSubTab = () => {
    if (!onSendToSubdomains) return;
    onSendToSubdomains(values(items).map((v) => extractHost(v)).filter(Boolean));
  };

  const pullFromSubTab = () => {
    const n = appendTo('subdomains', subRecords.map((r) => r.host));
    onCopyToast?.(`Pulled ${n} new host(s) from Subdomains tab`);
  };

  const dedupeAgainstSubTab = () => {
    const known = new Set(subRecords.map((r) => r.host));
    const out = items.filter((i) => !known.has(extractHost(i.v)));
    const removed = items.length - out.length;
    onSave(out);
    onCopyToast?.(`Removed ${removed} already in Subdomains tab`);
  };

  // ---- selection ----
  const toggleCheck = (v) => setChecked((p) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const moveChecked = (toKey) => {
    const sel = items.filter((i) => checked.has(i.v));
    appendTo(toKey, values(sel));
    removeVals(checked);
    setChecked(new Set());
  };

  return (
    <>
      <section className="import-panel">
        <textarea ref={taRef} className="import-panel-textarea mono" placeholder={section.ph} spellCheck={false}
          onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); const r = new FileReader(); r.onload = (ev) => { taRef.current.value = ev.target.result; }; r.readAsText(f); } }} />
        <div className="import-panel-bar">
          <input className="asset-src-input" placeholder="source tag (optional)" value={src} onChange={(e) => setSrc(e.target.value)} />
          <span className="import-hint mono">One per line · exact duplicates skipped · drag-drop a .txt</span>
          <div className="import-panel-spacer" />
          <button className="btn btn-primary btn-grad" onClick={add}>＋ Add to {section.label}</button>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-icon">{section.icon}</div>
          <div className="empty-title">No {section.label.toLowerCase()} stored yet</div>
          <div className="empty-sub">Paste above, or use ✦ Smart import to auto-sort a mixed list.</div>
        </div>
      ) : (
        <>
          <div className="glass-card filter-card asset-toolbar">
            <div className="search-wrap">
              <span className="search-ic">⌕</span>
              <input placeholder={`Search ${section.label.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
            </div>
            <span className="asset-count mono">{filtered.length.toLocaleString()}{query || newOnly || hideDead || hideOos ? ` / ${items.length.toLocaleString()}` : ''}</span>

            {newCount > 0 && <button className={`fpill${newOnly ? ' active' : ''}`} onClick={() => setNewOnly((v) => !v)}>new <b>{newCount}</b></button>}
            {isUrlish && deadCount > 0 && <label className="check"><input type="checkbox" checked={hideDead} onChange={(e) => setHideDead(e.target.checked)} /><span>hide dead ({deadCount})</span></label>}
            {hasScope && <label className="check"><input type="checkbox" checked={hideOos} onChange={(e) => setHideOos(e.target.checked)} /><span>hide out-of-scope</span></label>}

            <div className="filter-spacer" />

            <NormalizeMenu onNormalize={normalize} />
            <ActionsMenu
              sectionKey={section.key}
              isUrlish={isUrlish}
              onDetectDead={detectDead}
              onExtractHosts={extractHostsToSubs}
              onSendToSubTab={onSendToSubdomains ? sendToSubTab : null}
              onPullFromSubTab={pullFromSubTab}
              onDedupeSubTab={dedupeAgainstSubTab}
              onMarkSeen={onMarkSeen}
              onCopy={copyList}
              onExport={exportTxt}
              onClear={clearAll}
            />
          </div>

          <div className="glass-card asset-list">
            {filtered.slice(0, RENDER_CAP).map((it) => {
              const scope = hasScope ? scopeStatus(extractHost(it.v)) : null;
              return (
                <div key={it.v} className={`asset-row${it.dead ? ' is-dead' : ''}${it.addedAt > seenAt ? ' is-new' : ''}`}>
                  <input type="checkbox" className="row-cb" checked={checked.has(it.v)} onChange={() => toggleCheck(it.v)} />
                  <span className="asset-val mono">{it.v}</span>
                  {it.dead && <span className="asset-dead-tag">dead</span>}
                  {it.addedAt > seenAt && <span className="asset-new-tag">new</span>}
                  {it.src && <span className="asset-src-tag">{it.src}</span>}
                  {scope && <span className={`scope-badge sm ${scope}`}>{scope}</span>}
                  <span className="filter-spacer" />
                  <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard?.writeText(it.v).then(() => onCopyToast?.('Copied'))}>⧉</button>
                  <button className="icon-btn" title="Remove" onClick={() => removeVals(new Set([it.v]))}>✕</button>
                </div>
              );
            })}
            {filtered.length > RENDER_CAP && (
              <div className="asset-more mono">+{(filtered.length - RENDER_CAP).toLocaleString()} more — refine your search</div>
            )}
          </div>
        </>
      )}

      {checked.size > 0 && (
        <div className="bulk-bar">
          <span>{checked.size} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText([...checked].join('\n')).then(() => onCopyToast?.('Copied'))}>Copy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadTxt([...checked].join('\n'), 'selection')}>Export</button>
          {SECTIONS.filter((s) => s.key !== section.key).map((s) => (
            <button key={s.key} className="btn btn-ghost btn-sm" onClick={() => moveChecked(s.key)}>→ {s.label}</button>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-5xx)' }} onClick={() => { removeVals(checked); setChecked(new Set()); }}>Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setChecked(new Set())}>Clear ✕</button>
        </div>
      )}
    </>
  );
}

// Derived view: unique IPs from the Subdomains tab, grouped by the HTTP status
// of the subdomain(s) pointing at them (200 IPs, 301 IPs, …). Read-only — the
// source of truth is the Subdomains tab. An IP with hosts of different statuses
// shows under each of those status groups.
function IpsView({ subRecords, onCopyToast }) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const byStatus = new Map(); // status -> Map(ip -> Set(host))
    for (const r of subRecords) {
      if (!r.ip) continue;
      const status = r.status == null ? 'unknown' : r.status;
      let ipMap = byStatus.get(status);
      if (!ipMap) byStatus.set(status, (ipMap = new Map()));
      let hosts = ipMap.get(r.ip);
      if (!hosts) ipMap.set(r.ip, (hosts = new Set()));
      hosts.add(r.host);
    }
    return [...byStatus.entries()]
      .map(([status, ipMap]) => ({
        status,
        ips: [...ipMap.entries()].map(([ip, hosts]) => ({ ip, hosts: [...hosts] })).sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })),
      }))
      .sort((a, b) => (Number(a.status) || 9999) - (Number(b.status) || 9999));
  }, [subRecords]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? groups.map((g) => ({ ...g, ips: g.ips.filter((x) => x.ip.includes(q) || x.hosts.some((h) => h.toLowerCase().includes(q))) })).filter((g) => g.ips.length)
    : groups;

  if (subRecords.length === 0 || groups.length === 0) {
    return (
      <div className="glass-card empty-state">
        <div className="empty-icon">🖥</div>
        <div className="empty-title">No IPs yet</div>
        <div className="empty-sub">Import subdomains with an IP column in the Subdomains tab — they’ll group here by status code.</div>
      </div>
    );
  }

  const copyGroup = (g) => navigator.clipboard?.writeText(g.ips.map((x) => x.ip).join('\n')).then(() => onCopyToast?.(`Copied ${g.ips.length} IPs`));
  const exportGroup = (g) => downloadTxt(g.ips.map((x) => x.ip).join('\n'), `ips-${g.status}`);

  return (
    <>
      <div className="glass-card filter-card asset-toolbar">
        <div className="search-wrap">
          <span className="search-ic">⌕</span>
          <input placeholder="Search IP or host…" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </div>
        <span className="asset-count mono">{shown.reduce((n, g) => n + g.ips.length, 0).toLocaleString()} IP·status pairs</span>
      </div>

      {shown.map((g) => (
        <section key={g.status} className="glass-card asset-list" style={{ marginBottom: 'var(--sp-3, 12px)' }}>
          <div className="asset-row" style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', fontWeight: 600 }}>
            <StatusBadge status={typeof g.status === 'number' ? g.status : 0} />
            <span className="asset-val">{g.ips.length} IP{g.ips.length === 1 ? '' : 's'}{g.status === 'unknown' ? ' · no status' : ''}</span>
            <span className="filter-spacer" />
            <button className="icon-btn" title="Copy IPs" onClick={() => copyGroup(g)}>⧉</button>
            <button className="icon-btn" title="Export .txt" onClick={() => exportGroup(g)}>↓</button>
          </div>
          {g.ips.map((x) => (
            <div key={x.ip} className="asset-row">
              <span className="asset-val mono">{x.ip}</span>
              <span className="asset-src-tag" title={x.hosts.join('\n')}>{x.hosts.length === 1 ? x.hosts[0] : `${x.hosts.length} hosts`}</span>
              <span className="filter-spacer" />
              <button className="icon-btn" title="Copy IP" onClick={() => navigator.clipboard?.writeText(x.ip).then(() => onCopyToast?.('Copied'))}>⧉</button>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function NormalizeMenu({ onNormalize }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const opt = (label, opts) => <button className="menu-item" onClick={() => { onNormalize(opts); close(); }}>{label}</button>;
  return (
    <div className="menu">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>Normalize ▾</button>
      {open && (
        <div className="menu-list" onMouseLeave={close}>
          {opt('Lowercase', { lowercase: true })}
          {opt('Strip scheme (http://)', { stripScheme: true })}
          {opt('Strip www.', { stripWww: true })}
          {opt('Drop port', { dropPort: true })}
          {opt('Sort A–Z', { sort: true })}
          <div className="menu-sep" />
          {opt('Clean all (scheme+www+lower+sort)', { stripScheme: true, stripWww: true, lowercase: true, sort: true })}
        </div>
      )}
    </div>
  );
}

function ActionsMenu({ sectionKey, isUrlish, onDetectDead, onExtractHosts, onSendToSubTab, onPullFromSubTab, onDedupeSubTab, onMarkSeen, onCopy, onExport, onClear }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const item = (label, fn, style) => <button className="menu-item" style={style} onClick={() => { fn(); close(); }}>{label}</button>;
  return (
    <div className="menu">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>Actions ▾</button>
      {open && (
        <div className="menu-list" onMouseLeave={close}>
          {isUrlish && item('🩺 Detect dead endpoints', onDetectDead)}
          {isUrlish && item('Extract hosts → Subdomains bucket', onExtractHosts)}
          {sectionKey === 'subdomains' && onSendToSubTab && item('Send to Subdomains tab (scan)', onSendToSubTab)}
          {sectionKey === 'subdomains' && item('Pull from Subdomains tab', onPullFromSubTab)}
          {sectionKey === 'subdomains' && item('Remove already in Subdomains tab', onDedupeSubTab)}
          <div className="menu-sep" />
          {item('Mark all as seen', onMarkSeen)}
          {item('Copy (filtered)', onCopy)}
          {item('Export .txt (filtered)', onExport)}
          <div className="menu-sep" />
          {item('Clear all', onClear, { color: 'var(--status-5xx)' })}
        </div>
      )}
    </div>
  );
}

function VaultMenu({ data, onImport, onCopyToast }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  const close = () => setOpen(false);
  const exportVault = () => {
    const clean = { subdomains: data.subdomains || [], urls: data.urls || [], jsfiles: data.jsfiles || [] };
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `assets-vault-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url); close();
  };
  const loadVault = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { onImport(JSON.parse(ev.target.result)); } catch { onCopyToast?.('Invalid vault JSON'); } };
    r.readAsText(f); e.target.value = null; close();
  };
  return (
    <div className="menu">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>Vault ▾</button>
      {open && (
        <div className="menu-list" onMouseLeave={close}>
          <button className="menu-item" onClick={exportVault}>Export vault (.json)</button>
          <button className="menu-item" onClick={() => fileRef.current?.click()}>Import vault (.json)</button>
          <input type="file" ref={fileRef} accept=".json" style={{ display: 'none' }} onChange={loadVault} />
        </div>
      )}
    </div>
  );
}

function downloadTxt(text, base) {
  const blob = new Blob([text + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${base}-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  URL.revokeObjectURL(url);
}
