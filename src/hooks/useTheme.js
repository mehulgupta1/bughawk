import { useCallback, useEffect, useState } from 'react';
import * as storage from '../lib/storage.js';

const { KEYS } = storage;

// Applies `data-theme` to <html>, persisted in IndexedDB under bbd:theme.
// Defaults to dark.
export function useTheme() {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.get(KEYS.theme, 'dark');
      if (cancelled) return;
      const t = saved === 'light' ? 'light' : 'dark';
      setThemeState(t);
      document.documentElement.setAttribute('data-theme', t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure attribute stays in sync.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      storage.set(KEYS.theme, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
