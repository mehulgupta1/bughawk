import { STATUS_GROUPS, STATUS_COLORS } from '../../lib/status.js';

// Signature element: thin proportional bar of the filtered status distribution.
export default function StatusSpectrum({ counts, total }) {
  if (!total) return <div className="spectrum spectrum-empty" aria-hidden />;

  return (
    <div
      className="spectrum"
      role="img"
      aria-label="Status code distribution"
    >
      {STATUS_GROUPS.map((g) => {
        const c = counts[g] || 0;
        if (!c) return null;
        const pct = (c / total) * 100;
        return (
          <div
            key={g}
            className="spectrum-seg"
            style={{ width: `${pct}%`, background: STATUS_COLORS[g] }}
            title={`${g}: ${c.toLocaleString()} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}
