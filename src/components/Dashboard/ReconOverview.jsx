import { useMemo } from 'react';
import { enrich, attackSurfaceScore, scoreBand, SEVERITY_RANK } from '../../lib/portintel.js';
import { coverage } from '../../lib/scope.js';

// Cross-tab recon snapshot for the Dashboard: an animated attack-surface gauge,
// scope coverage bar, and live tiles for ports / vulns / assets. Cards navigate
// to their tab on click.
export default function ReconOverview({ subRecords, portRecords, scopeRules, assets, onNavigate }) {
  const ports = portRecords || [];
  const subs = subRecords || [];
  const rules = scopeRules || [];
  const a = assets || {};

  const p = useMemo(() => {
    const enriched = ports.map((r) => ({ r, e: enrich(r) }));
    const open = enriched.filter((x) => (x.r.state || '').startsWith('open'));
    const sev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let kev = 0, cve = 0, danger = 0;
    for (const x of open) {
      sev[x.e.severity] = (sev[x.e.severity] || 0) + 1;
      if (x.r.kev) kev++;
      if (x.r.cves && x.r.cves.length) cve++;
      if (x.e.dangerousFlags.length) danger++;
    }
    const topHosts = Object.entries(
      open.reduce((m, x) => {
        m[x.r.host] = m[x.r.host] || { host: x.r.host, score: 0, count: 0 };
        m[x.r.host].score += SEVERITY_RANK[x.e.severity] || 0;
        m[x.r.host].count++;
        return m;
      }, {})
    ).map(([, v]) => v).sort((x, y) => y.score - x.score).slice(0, 5);
    return {
      score: attackSurfaceScore(open.map((x) => x.e)),
      openCount: open.length, sev, kev, cve, danger, topHosts,
    };
  }, [ports]);

  const band = scoreBand(p.score);

  const cov = useMemo(() => {
    const hosts = [
      ...subs.map((r) => r.host),
      ...ports.map((r) => r.host),
      ...((a.subdomains || []).map((x) => (typeof x === 'string' ? x : x.v))),
    ];
    return coverage(hosts, rules);
  }, [subs, ports, a, rules]);

  const assetCount = (k) => (a[k] || []).length;
  const hasPorts = ports.length > 0;
  const hasScope = rules.length > 0;

  // gauge geometry
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C * (1 - p.score / 100);

  return (
    <div className="recon-overview">
      {/* attack surface gauge */}
      <div className={`glass-card recon-card recon-gauge-card${hasPorts ? ' clickable' : ' is-empty'}`} onClick={() => hasPorts && onNavigate?.('ports')}>
        <div className="card-title">Attack Surface</div>
        {hasPorts ? (
          <div className="gauge-wrap">
            <svg viewBox="0 0 120 120" className="gauge">
              <circle cx="60" cy="60" r={R} className="gauge-track" />
              <circle
                cx="60" cy="60" r={R} className="gauge-fill"
                style={{ stroke: `var(--sev-${band.sev})`, strokeDasharray: C, strokeDashoffset: off }}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="56" className="gauge-num">{p.score}</text>
              <text x="60" y="76" className="gauge-sub">/ 100</text>
            </svg>
            <div className="gauge-meta">
              <div className={`gauge-band sev-${band.sev}`}>{band.label}</div>
              <div className="gauge-line">{p.openCount} open ports</div>
              <div className="gauge-sevs">
                {['critical', 'high', 'medium', 'low'].map((s) => p.sev[s] > 0 && (
                  <span key={s} className={`sev-pill sev-${s}`}>{p.sev[s]} {s}</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="recon-empty">No port data yet — scan a target in the Port Scan tab.</div>
        )}
      </div>

      {/* scope coverage */}
      <div className={`glass-card recon-card${hasScope ? ' clickable' : ' is-empty'}`} onClick={() => onNavigate?.('scope')}>
        <div className="card-title">Scope Coverage</div>
        {hasScope ? (
          <>
            <div className="cov-bar">
              <span className="cov-seg cov-in" style={{ flex: cov.in || 0.0001 }} title={`${cov.in} in scope`} />
              <span className="cov-seg cov-unknown" style={{ flex: cov.unknown.length || 0.0001 }} title={`${cov.unknown.length} unknown`} />
              <span className="cov-seg cov-out" style={{ flex: cov.out || 0.0001 }} title={`${cov.out} out`} />
            </div>
            <div className="cov-legend">
              <span><i className="dot cov-in" /> {cov.in} in</span>
              <span><i className="dot cov-unknown" /> {cov.unknown.length} unknown</span>
              <span><i className="dot cov-out" /> {cov.out} out</span>
            </div>
            {cov.unknown.length > 0 && (
              <div className="cov-gap">⚠ {cov.unknown.length} host(s) match no scope rule</div>
            )}
          </>
        ) : (
          <div className="recon-empty">No scope rules — define scope to auto-classify every host.</div>
        )}
      </div>

      {/* vuln + assets tiles */}
      <div className="recon-tiles">
        <Tile label="KEV" value={p.kev} accent="var(--sev-critical)" hint="actively exploited" onClick={() => onNavigate?.('ports')} />
        <Tile label="CVE hosts" value={p.cve} accent="var(--sev-medium)" onClick={() => onNavigate?.('ports')} />
        <Tile label="Misconfig" value={p.danger} accent="var(--sev-high)" onClick={() => onNavigate?.('ports')} />
        <Tile label="Subdomains" value={assetCount('subdomains')} accent="var(--accent-primary)" onClick={() => onNavigate?.('assets')} />
        <Tile label="URLs" value={assetCount('urls')} accent="var(--status-3xx)" onClick={() => onNavigate?.('assets')} />
        <Tile label="JS files" value={assetCount('jsfiles')} accent="var(--status-2xx)" onClick={() => onNavigate?.('assets')} />
      </div>

      {/* top risky hosts */}
      {p.topHosts.length > 0 && (
        <div className="glass-card recon-card recon-top clickable" onClick={() => onNavigate?.('ports')}>
          <div className="card-title">Top Risky Hosts</div>
          {p.topHosts.map((h) => (
            <div key={h.host} className="top-host-row">
              <span className="top-host-name mono">{h.host}</span>
              <span className="top-host-ports">{h.count} open</span>
              <span className="top-host-bar"><span style={{ width: `${Math.min(100, h.score * 8)}%` }} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent, hint, onClick }) {
  return (
    <div className="recon-tile clickable" style={{ '--tile-accent': accent }} onClick={onClick}>
      <div className="recon-tile-num mono">{(value || 0).toLocaleString()}</div>
      <div className="recon-tile-label">{label}</div>
      {hint && <div className="recon-tile-hint">{hint}</div>}
    </div>
  );
}
