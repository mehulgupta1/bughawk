import { useReveal } from '../../hooks/useReveal.js';
import StatusBadge from '../SubdomainTab/StatusBadge.jsx';

// Starred/tagged hosts, most recent first, capped. "View all" jumps to the
// Subdomains tab pre-filtered to flagged hosts.
export default function FlaggedHostsPanel({ flagged, onViewAll }) {
  const [ref, inView] = useReveal();

  return (
    <section ref={ref} className={`panel reveal${inView ? ' in-view' : ''}`}>
      <header className="panel-head">
        <h3>Flagged Hosts</h3>
        {flagged.length > 0 && (
          <button className="panel-link" onClick={onViewAll}>
            View all →
          </button>
        )}
      </header>
      <div className="panel-body">
        {flagged.length === 0 ? (
          <div className="panel-empty">
            No flagged hosts yet. Star interesting hosts on the Subdomains tab.
          </div>
        ) : (
          <ul className="flagged">
            {flagged.map((r) => (
              <li key={r.id} className="flagged-item">
                <span className="flagged-star">★</span>
                <span className="flagged-host mono" title={r.host}>
                  {r.host}
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
