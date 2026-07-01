import { useEffect } from 'react';
import { statusLabel, statusGroup } from '../../lib/status.js';
import { absoluteTime, relativeTime } from '../../utils/time.js';

// Slide-in side panel showing a host's status history as a timeline.
export default function HistoryPanel({ record, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const history = Array.isArray(record.history) ? record.history : [];

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title mono">{record.host}</div>
            <div className="drawer-sub">Status history</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {history.length <= 1 ? (
            <div className="timeline-single">
              First seen {relativeTime(record.addedAt)} with status{' '}
              <span className={`badge badge-${statusGroup(record.status)}`}>
                {statusLabel(record.status)}
              </span>
              .
              {history.length === 1 && (
                <div className="muted-row mono" style={{ marginTop: 8 }}>
                  {absoluteTime(history[0].observedAt)}
                </div>
              )}
            </div>
          ) : (
            <ul className="timeline">
              {history.map((h, i) => (
                <li className="timeline-item" key={i}>
                  <span className={`timeline-dot status-dot-${statusGroup(h.status)}`} />
                  <div className="timeline-body">
                    <span className={`badge badge-${statusGroup(h.status)}`}>
                      {statusLabel(h.status)}
                    </span>
                    <span className="timeline-when mono" title={absoluteTime(h.observedAt)}>
                      {relativeTime(h.observedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
