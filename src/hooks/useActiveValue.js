import { useRef } from 'react';

// Returns `value` while `active`, otherwise the last value seen while active.
//
// Kept-mounted tabs (see App: Ports/Scope/Subdomains/…) stay in the tree when
// hidden so re-opening is instant. But that means a background data change
// (project load, import) would make every hidden tab recompute its 50k/100k
// pipeline at once — a multi-second stall. Feeding the heavy inputs through
// this hook freezes them while the tab is hidden: no recompute on data change,
// and when the tab is shown again it refreshes to the latest value (recomputing
// only if the data actually changed since it was last visible).
export function useActiveValue(value, active) {
  const ref = useRef(value);
  if (active) ref.current = value;
  return active ? value : ref.current;
}
