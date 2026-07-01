import { useEffect, useMemo, useState } from 'react';
import { debounce } from '../../utils/debounce.js';

// Debounced hostname search. Status filtering now lives in StatusTabStrip.
export default function FilterBar({ query, onQueryChange }) {
  const [local, setLocal] = useState(query);

  const debounced = useMemo(
    () => debounce((v) => onQueryChange(v), 180),
    [onQueryChange]
  );
  useEffect(() => () => debounced.cancel(), [debounced]);

  const handle = (e) => {
    setLocal(e.target.value);
    debounced(e.target.value);
  };

  return (
    <div className="search-box">
      <span className="search-icon">⌕</span>
      <input
        className="search-input mono"
        placeholder="filter by hostname…"
        value={local}
        onChange={handle}
        spellCheck={false}
      />
      {local && (
        <button
          className="search-clear"
          onClick={() => {
            setLocal('');
            debounced('');
          }}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
