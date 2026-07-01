import { useMemo } from 'react';

// Inline SVG line chart of total subdomain count across import events.
export default function TrendChart({ activity }) {
  // activity is newest-first; reverse to chronological.
  const points = useMemo(
    () =>
      [...activity]
        .reverse()
        .map((a) => ({ at: a.at, total: a.totalCount ?? 0 })),
    [activity]
  );

  if (points.length < 2) {
    return <div className="panel-empty">Import a couple more times to see your trend.</div>;
  }

  const W = 520;
  const H = 160;
  const pad = { l: 36, r: 12, t: 12, b: 22 };
  const maxY = Math.max(...points.map((p) => p.total), 1);
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - pad.b).toFixed(1)} L${x(0).toFixed(1)},${(H - pad.b).toFixed(1)} Z`;

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--border)" />
      <text x={pad.l - 6} y={y(maxY) + 4} textAnchor="end" className="trend-axis">{maxY.toLocaleString()}</text>
      <text x={pad.l - 6} y={H - pad.b} textAnchor="end" className="trend-axis">0</text>
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.total)} r="3" fill="var(--accent-primary)">
          <title>{`${new Date(p.at).toLocaleDateString()} — ${p.total.toLocaleString()} total`}</title>
        </circle>
      ))}
    </svg>
  );
}
