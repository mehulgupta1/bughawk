import { formatScalar } from '../../lib/columns.js';

// Small chip list with "+N more" truncation for array-valued columns.
function ArrayChips({ values, max = 3 }) {
  const arr = Array.isArray(values) ? values : [];
  if (arr.length === 0) return <span className="dash">—</span>;
  const shown = arr.slice(0, max);
  const extra = arr.length - shown.length;
  return (
    <span className="chip-list">
      {shown.map((v, i) => (
        <span className="data-chip" key={i}>{String(v)}</span>
      ))}
      {extra > 0 && <span className="data-chip more">+{extra}</span>}
    </span>
  );
}

// Renders the inner content of a dynamic data cell (no wrapper element).
export function cellContent(col, rec) {
  const v = col.get(rec);
  if (col.type === 'array') return <ArrayChips values={v} />;
  if (col.type === 'number') {
    return v == null || v === '' ? <span className="dash">—</span> : v.toLocaleString();
  }
  const s = formatScalar(v);
  return <span className="cell-trunc" title={s === '—' ? undefined : s}>{s}</span>;
}

export function cellClass(col) {
  return col.type === 'number' ? 'num-data' : '';
}
