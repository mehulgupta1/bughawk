import { useCallback, useEffect, useRef, useState } from 'react';
import * as storage from '../lib/storage.js';

// Generic per-project value backed by IndexedDB, with debounced writes.
// `keyFn` maps projectId -> storage key. Reloads on project switch.
export function useProjectValue(projectId, keyFn, fallback, { debounce = 400 } = {}) {
  const [value, setValue] = useState(fallback);
  const loadedFor = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setValue(fallback);
      loadedFor.current = null;
      return;
    }
    loadedFor.current = null;
    (async () => {
      const v = await storage.get(keyFn(projectId), fallback);
      if (cancelled) return;
      setValue(v == null ? fallback : v);
      loadedFor.current = projectId;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Debounced persist after the initial load for this project.
  useEffect(() => {
    if (!projectId || loadedFor.current !== projectId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      storage.set(keyFn(projectId), value);
    }, debounce);
    return () => timer.current && clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, projectId]);

  const update = useCallback((v) => setValue(v), []);
  return [value, update, loadedFor.current === projectId];
}
