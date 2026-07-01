import { STATUS_GROUPS, STATUS_COLORS } from '../../lib/status.js';

export default function StatsBar({ counts, total }) {
  return (
    <div className="statsbar">
      <div className="stat">
        <span className="stat-value">{total.toLocaleString()}</span>
        <span className="stat-label">hosts</span>
      </div>
      {STATUS_GROUPS.map((g) => (
        <div className="stat" key={g}>
          <span
            className="stat-dot"
            style={{ background: STATUS_COLORS[g] }}
          />
          <span className="stat-value">{(counts[g] || 0).toLocaleString()}</span>
          <span className="stat-label">{g}</span>
        </div>
      ))}
    </div>
  );
}
