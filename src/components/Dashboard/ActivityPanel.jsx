import { useReveal } from '../../hooks/useReveal.js';
import { relativeTime, absoluteTime } from '../../utils/time.js';

// Recent import events for the active project (newest first).
export default function ActivityPanel({ activity }) {
  const [ref, inView] = useReveal();

  return (
    <section ref={ref} className={`panel reveal${inView ? ' in-view' : ''}`}>
      <header className="panel-head">
        <h3>Recent Activity</h3>
      </header>
      <div className="panel-body">
        {activity.length === 0 ? (
          <div className="panel-empty">
            No imports yet. Use Import on the Subdomains tab to ingest scan results.
          </div>
        ) : (
          <ul className="feed">
            {activity.map((a) => (
              <li key={a.id} className="feed-item">
                <span className="feed-dot" />
                <div className="feed-body">
                  <div className="feed-line">
                    Imported <strong className="mono">{a.total.toLocaleString()}</strong> —{' '}
                    <span style={{ color: 'var(--status-2xx)' }}>{a.added.toLocaleString()} added</span>,{' '}
                    {a.updated.toLocaleString()} updated, {a.skipped.toLocaleString()} skipped
                  </div>
                  <time className="feed-time mono" title={absoluteTime(a.at)}>
                    {relativeTime(a.at)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
