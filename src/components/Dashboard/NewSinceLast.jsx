import { relativeTime } from '../../utils/time.js';

// Callout for new subdomains found in the most recent import, vs the prior one.
// Hidden entirely if there's no prior import to compare against.
export default function NewSinceLast({ activity, onView }) {
  if (!activity || activity.length < 2) return null; // need a prior import
  const latest = activity[0];
  if (!latest.newCount) return null;

  return (
    <div className="new-since glass-card">
      <div className="new-since-main">
        <span className="new-since-num grad-text mono">{latest.newCount.toLocaleString()}</span>
        <div>
          <div className="new-since-title">new subdomains since your last import</div>
          <div className="new-since-sub">{relativeTime(latest.at)}</div>
        </div>
      </div>
      {latest.newHostIds && latest.newHostIds.length > 0 && (
        <button className="btn btn-primary btn-sm" onClick={() => onView(latest.newHostIds)}>
          View them →
        </button>
      )}
    </div>
  );
}
