import { memo } from 'react';
import { AUDIT_OPTIONS } from '../../lib/tags.js';

// Inline audit status dropdown with colored state.
function AuditSelect({ value, onChange }) {
  const v = value || 'untested';
  return (
    <select
      className={`audit-select audit-${v}`}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    >
      {AUDIT_OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default memo(AuditSelect);
