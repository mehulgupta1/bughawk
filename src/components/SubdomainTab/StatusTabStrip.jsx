import { statusGroup } from '../../lib/status.js';

// Curated, single-select status tabs to match the operator console layout.
// `selection` is one of: null (All) | '200' | '301' | '403' | '404' | '500'
//   | 'other' | 'new'. Counts are passed in already computed.
export const CURATED_CODES = ['200', '301', '403', '404', '500'];

const ICONS = { 403: '🔥' };

export default function StatusTabStrip({ counts, selection, onSelect }) {
  const tab = (key, label, opts = {}) => {
    const active = String(selection) === String(key) || (key === 'all' && selection == null);
    const group = opts.group || 'other';
    return (
      <button
        key={key}
        className={`status-tab status-tab-${group}${active ? ' active' : ''}`}
        onClick={() => onSelect(key === 'all' ? null : key)}
      >
        {opts.dot && <span className="status-tab-dot" />}
        <span className="status-tab-text">{label}</span>
        <span className="status-tab-badge">{(counts[key] || 0).toLocaleString()}</span>
      </button>
    );
  };

  return (
    <div className="status-strip" role="tablist">
      {tab('all', 'All')}
      {CURATED_CODES.map((code) =>
        tab(code, (
          <span className="mono">
            {code}
            {ICONS[code] ? ` ${ICONS[code]}` : ''}
          </span>
        ), { dot: true, group: statusGroup(Number(code)) })
      )}
      {tab('other', 'Other', { dot: true, group: 'other' })}
      {tab('new', <span>🆕 New</span>, { group: 'new' })}
    </div>
  );
}
