import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { get, KEYS } from '../../lib/storage.js';
import { getSevColor } from '../UrlParser/engine.js';
import { featureLabel } from '../../lib/features.js';
import { useActiveValue } from '../../hooks/useActiveValue.js';

import DonutChart from './DonutChart.jsx';
import Heatmap from './Heatmap.jsx';
import TrendChart from './TrendChart.jsx';
import TagDistribution from './TagDistribution.jsx';
import NewSinceLast from './NewSinceLast.jsx';
import NotesScratchpad from './NotesScratchpad.jsx';
import ReconOverview from './ReconOverview.jsx';
import { useCountUp } from '../../hooks/useCountUp.js';
import { statusGroup } from '../../lib/status.js';
import { relativeTime } from '../../utils/time.js';

const STAT_DEFS = [
  { key: 'total', label: 'Total Subdomains', icon: '🌐', accent: 'var(--purple)' },
  { key: 'live', label: 'Live (2xx)', icon: '✓', accent: 'var(--status-2xx)' },
  { key: 'redirects', label: 'Redirects (3xx)', icon: '↪', accent: 'var(--status-3xx)' },
  { key: 'notable', label: 'Notable (4xx+5xx)', icon: '⚑', accent: 'var(--status-5xx)' },
  { key: 'vulnerable', label: 'Vulnerable', icon: '☠', accent: 'var(--status-5xx)' },
  { key: 'flagged', label: 'Flagged', icon: '★', accent: 'var(--status-4xx)' },
];

function StatCard({ def, value }) {
  const display = useCountUp(value, {});
  return (
    <div className="stat-card" style={{ '--grad-stat': def.accent }}>
      <div className="stat-icon" style={{ background: 'var(--surface-hover)', color: def.accent }}>{def.icon}</div>
      <div className="stat-value mono">{display}</div>
      <div className="stat-label">{def.label}</div>
    </div>
  );
}

function Dashboard({
  activeProjectId, records: rawRecords, active = true, activity, projectName, createdAt, theme,
  notes, onNotesChange, onViewNew,
  portRecords: rawPortRecords, scopeRules, assets, onNavigate,
  portActivity, assetActivity,
}) {
  // Freeze while hidden (always-mounted tab) so a background load/import doesn't
  // recompute the dashboard stats over 100k/50k records off-screen.
  const records = useActiveValue(rawRecords, active);
  const portRecords = useActiveValue(rawPortRecords, active);
  const [notebook, setNotebook] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nb = await get(KEYS.notebook, []);
      if (!cancelled) setNotebook(Array.isArray(nb) ? nb : []);
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  // Priority Worklist preview. buildGraph/buildWorklist over the whole dataset
  // is a scope-test + regex per host — synchronous, it froze the UI for seconds
  // at 100k records. Run it in a worker that reads straight from IndexedDB so
  // the main thread stays free; nothing large crosses postMessage.
  const [topWork, setTopWork] = useState([]);
  const wlWorker = useRef(null);
  const wlReq = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./worklist.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { if (e.data?.reqId === wlReq.current) setTopWork(Array.isArray(e.data.top) ? e.data.top : []); };
    wlWorker.current = w;
    return () => { w.terminate(); wlWorker.current = null; };
  }, []);
  useEffect(() => {
    if (!activeProjectId || !wlWorker.current) { setTopWork([]); return undefined; }
    // ponytail: 500ms debounce also lets the 400ms record persist land first, so
    // the worker reads fresh data (top-10 preview — eventual consistency is fine).
    const id = setTimeout(() => {
      wlReq.current += 1;
      wlWorker.current.postMessage({ projectId: activeProjectId, reqId: wlReq.current });
    }, 500);
    return () => clearTimeout(id);
  }, [activeProjectId, records, portRecords]);

  // Feature coverage across the notebook (which features exist, how many untested).
  const coverage = useMemo(() => {
    const cov = {};
    for (const n of notebook) for (const f of (n.features || [])) {
      cov[f.name] = cov[f.name] || { total: 0, untested: 0 };
      cov[f.name].total++;
      if (f.status === 'untested') cov[f.name].untested++;
    }
    return Object.entries(cov).sort((a, b) => b[1].total - a[1].total);
  }, [notebook]);

  // Unified activity feed: subdomain imports + port imports + asset additions.
  const feed = useMemo(() => {
    const items = [];
    for (const a of activity || [])
      items.push({ id: 's' + a.id, at: a.at, kind: 'subdomains', icon: '🌐', added: a.added, total: a.total, updated: a.updated, skipped: a.skipped });
    for (const a of portActivity || [])
      items.push({ id: 'p' + a.id, at: a.at, kind: 'ports', icon: '🖧', added: a.added, total: a.total, updated: a.updated, skipped: a.skipped });
    for (const a of assetActivity || [])
      items.push({ id: 'a' + a.id, at: a.at, kind: 'assets', icon: '🗂', label: a.label });
    return items.sort((x, y) => y.at - x.at).slice(0, 40);
  }, [activity, portActivity, assetActivity]);

  const { counts, stats } = useMemo(() => {
    const c = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
    let vulnerable = 0;
    let flagged = 0;
    for (const r of records) {
      c[statusGroup(r.status)]++;
      if (r.audit === 'vulnerable') vulnerable++;
      if (r.tag) flagged++;
    }
    return {
      counts: c,
      stats: { total: records.length, live: c['2xx'], redirects: c['3xx'], notable: c['4xx'] + c['5xx'], vulnerable, flagged },
    };
  }, [records]);

  return (
    <div className="tab-content">
      <div className="tab-head">
        <h2>Dashboard</h2>
        <p>Overview of {projectName || 'your project'}</p>
      </div>

      <NewSinceLast activity={activity} onView={onViewNew} />

      {topWork.length > 0 && (
        <div className="dash-worklist" onClick={() => onNavigate && onNavigate('surface')} title="Open the full Priority Worklist">
          <div className="dash-wl-head">
            <strong>🎯 Priority Worklist — top {topWork.length}</strong>
            <span className="dash-wl-more">open all →</span>
          </div>
          {topWork.map((it, i) => (
            <div key={it.id} className="dash-wl-row">
              <span className="dash-wl-rank">{i + 1}</span>
              <span className="dash-wl-score" style={{ color: getSevColor(it.severity) }}>{it.score}</span>
              <span className="dash-wl-kind">{it.kind}</span>
              <span className="dash-wl-host" title={it.url || it.host}>{it.host}</span>
              <span className="dash-wl-detail" title={it.detail}>{it.detail}</span>
            </div>
          ))}
        </div>
      )}

      {coverage.length > 0 && (
        <div className="dash-worklist" onClick={() => onNavigate && onNavigate('notebook')} title="Open the Notebook">
          <div className="dash-wl-head">
            <strong>🧭 Feature coverage</strong>
            <span className="dash-wl-more">open notebook →</span>
          </div>
          <div className="dash-cov">
            {coverage.map(([k, c]) => (
              <span key={k} className="dash-cov-chip">{featureLabel(k)} <b>{c.total}</b>{c.untested ? <i> · {c.untested} untested</i> : null}</span>
            ))}
          </div>
        </div>
      )}

      <ReconOverview
        subRecords={records}
        portRecords={portRecords}
        scopeRules={scopeRules}
        assets={assets}
        onNavigate={onNavigate}
      />

      <div className="stats-grid">
        {STAT_DEFS.map((def) => (
          <StatCard key={def.key} def={def} value={stats[def.key]} />
        ))}
      </div>

      <div className="chart-section">
        <div className="glass-card">
          <div className="card-title">Status Distribution</div>
          <DonutChart counts={counts} total={stats.total} theme={theme} />
        </div>
        <div className="glass-card">
          <div className="card-title">Subdomains Over Time</div>
          <TrendChart activity={activity} />
        </div>
      </div>

      <div className="glass-card">
        <div className="card-title">Activity — Last 12 Months</div>
        <Heatmap activity={activity} createdAt={createdAt} />
      </div>

      <div className="chart-section">
        <div className="glass-card">
          <div className="card-title">Flagged vs Untouched</div>
          <TagDistribution records={records} />
        </div>
        <div className="glass-card">
          <div className="card-title">Project Notes</div>
          <NotesScratchpad value={notes} onChange={onNotesChange} />
        </div>
      </div>

      <div className="glass-card">
        <div className="card-title">Recent Activity</div>
        <div className="activity-feed">
          {feed.length === 0 ? (
            <div className="muted-row">No activity yet — import recon data or store assets to see it here.</div>
          ) : (
            feed.map((it) => (
              <div className="activity-item" key={it.id}>
                <span className="activity-icon" title={it.kind}>{it.icon}</span>
                <span className="activity-text">
                  {it.kind === 'assets' ? (
                    it.label
                  ) : (
                    <>
                      Imported <strong className="mono">{(it.total || 0).toLocaleString()}</strong> {it.kind === 'ports' ? 'ports' : 'subdomains'} —{' '}
                      <span style={{ color: 'var(--status-2xx)' }}>{(it.added || 0).toLocaleString()} added</span>,{' '}
                      {(it.updated || 0).toLocaleString()} updated, {(it.skipped || 0).toLocaleString()} skipped
                    </>
                  )}
                </span>
                <span className="activity-time mono">{relativeTime(it.at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Memoized: Dashboard stays mounted (display toggle) so it must not re-render
// on every tab switch — that re-rendered all its charts and delayed other tabs.
export default memo(Dashboard);
