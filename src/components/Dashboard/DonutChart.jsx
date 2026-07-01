import { useEffect, useRef } from 'react';
import { STATUS_GROUPS } from '../../lib/status.js';

// Status colors resolved from CSS vars so it follows the theme.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const VAR_FOR = {
  '2xx': '--status-2xx',
  '3xx': '--status-3xx',
  '4xx': '--status-4xx',
  '5xx': '--status-5xx',
  other: '--status-other',
};

export default function DonutChart({ counts, total, theme }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;
    const r = 120;
    const lw = 34;
    ctx.clearRect(0, 0, size, size);

    // track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = cssVar('--surface-hover') || 'rgba(255,255,255,0.07)';
    ctx.stroke();

    if (!total) return;
    let start = -Math.PI / 2;
    for (const g of STATUS_GROUPS) {
      const v = counts[g] || 0;
      if (!v) continue;
      const angle = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = cssVar(VAR_FOR[g]) || '#888';
      ctx.stroke();
      start += angle;
    }
  }, [counts, total, theme]);

  return (
    <div className="donut-wrap">
      <div className="donut-container">
        <canvas ref={ref} width="320" height="320" className="donut-canvas" />
        <div className="donut-center">
          <span className="donut-total grad-text mono">{total.toLocaleString()}</span>
          <span className="donut-sub">total</span>
        </div>
      </div>
      <div className="legend">
        {STATUS_GROUPS.map((g) => (
          <div className="legend-item" key={g}>
            <span className="legend-dot" style={{ background: `var(${VAR_FOR[g]})` }} />
            <span className="legend-label">{g}</span>
            <span className="legend-val mono">{(counts[g] || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
