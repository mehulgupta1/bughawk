import { useMemo } from 'react';

// Flagged vs untouched proportion for the active project.
export default function TagDistribution({ records }) {
  const { flagged, untouched, total } = useMemo(() => {
    let f = 0;
    for (const r of records) if (r.tag) f++;
    return { flagged: f, untouched: records.length - f, total: records.length };
  }, [records]);

  if (total === 0) return <div className="panel-empty">No hosts yet.</div>;

  const pct = (n) => (total ? (n / total) * 100 : 0);

  return (
    <div className="tagdist">
      <div className="tagdist-bar">
        <span style={{ width: `${pct(flagged)}%`, background: 'var(--status-4xx)' }} />
        <span style={{ width: `${pct(untouched)}%`, background: 'var(--surface-hover)' }} />
      </div>
      <div className="tagdist-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--status-4xx)' }} />
          <span className="legend-label">Flagged</span>
          <span className="legend-val mono">{flagged.toLocaleString()}</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--text3)' }} />
          <span className="legend-label">Untouched</span>
          <span className="legend-val mono">{untouched.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
