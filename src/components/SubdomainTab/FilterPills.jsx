export const CURATED_CODES = ['200', '301', '302', '403', '404', '500'];

const META = {
  all: { label: 'All' },
  200: { label: '200', cls: 's200' },
  301: { label: '301', cls: 's301' },
  302: { label: '302', cls: 's302' },
  403: { label: '403 🔥', cls: 's403' },
  404: { label: '404', cls: 's404' },
  500: { label: '500', cls: 's500' },
  other: { label: 'Other' },
  new: { label: '🆕 New' },
};

const ORDER = ['all', ...CURATED_CODES, 'other', 'new'];

export default function FilterPills({ counts, selection, onSelect }) {
  return (
    <div className="filter-pills">
      {ORDER.map((key) => {
        const m = META[key];
        const active = String(selection) === String(key) || (key === 'all' && selection == null);
        return (
          <button
            key={key}
            className={`pill${active ? ' active' : ''}`}
            onClick={() => onSelect(key === 'all' ? null : key)}
          >
            {m.label}
            <span className="pill-count mono">{(counts[key] || 0).toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
