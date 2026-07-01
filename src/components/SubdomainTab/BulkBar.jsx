import { TAGS } from '../../lib/tags.js';

// Floating bulk-action bar shown when rows are selected.
export default function BulkBar({ count, onTag, onAudit, onExport, onDelete, onClear }) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar show">
      <span className="bulk-count mono">{count.toLocaleString()} selected</span>

      <div className="bulk-group">
        <span className="bulk-label">Tag</span>
        {TAGS.map((t) => (
          <button key={t.key} className={`tag tag-${t.key}`} onClick={() => onTag(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bulk-group">
        <span className="bulk-label">Audit</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onAudit('tested')}>Tested</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onAudit('vulnerable')}>Vulnerable</button>
      </div>

      <button className="btn btn-ghost btn-sm" onClick={onExport}>Export</button>
      <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
      <button className="btn btn-ghost btn-sm" onClick={onClear}>✕</button>
    </div>
  );
}
