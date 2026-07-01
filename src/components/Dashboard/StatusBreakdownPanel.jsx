import { useReveal } from '../../hooks/useReveal.js';
import { STATUS_GROUPS, STATUS_COLORS } from '../../lib/status.js';

// Proportional animated bars per status group for the active project.
export default function StatusBreakdownPanel({ counts, total }) {
  const [ref, inView] = useReveal();

  return (
    <section ref={ref} className={`panel reveal${inView ? ' in-view' : ''}`}>
      <header className="panel-head">
        <h3>Status Code Breakdown</h3>
      </header>
      <div className="panel-body">
        {total === 0 ? (
          <div className="panel-empty">No data yet.</div>
        ) : (
          <ul className="breakdown">
            {STATUS_GROUPS.map((g) => {
              const c = counts[g] || 0;
              const pct = total ? (c / total) * 100 : 0;
              return (
                <li key={g} className="breakdown-row">
                  <span className="breakdown-label mono">{g}</span>
                  <div className="breakdown-track">
                    <div
                      className="breakdown-fill"
                      style={{
                        width: inView ? `${pct}%` : '0%',
                        background: STATUS_COLORS[g],
                      }}
                    />
                  </div>
                  <span className="breakdown-count mono">{c.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
