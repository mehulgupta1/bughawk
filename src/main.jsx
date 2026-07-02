import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LoginGate from './components/Auth/LoginGate.jsx';
import { migrateFromLocalStorage } from './lib/storage.js';
import { initTelemetry } from './lib/telemetry.js';

// Dev-only: stream per-tab timings / jank / errors to perf.log for triage.
if (import.meta.env.DEV) initTelemetry();

import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/dashboard.css';
import './styles/advanced.css';
import './styles/portscan.css';
import './styles/scope.css';
import './styles/assets.css';
import './styles/recon.css';

// One-time localStorage -> IndexedDB migration before first render.
migrateFromLocalStorage().finally(() => {
  // StrictMode double-invokes renders + useMemo factories in dev — far too costly
  // for a 100k-record app. It's a no-op in production, so dropping it only affects dev.
  createRoot(document.getElementById('root')).render(
    <LoginGate><App /></LoginGate>
  );
});

// PWA: register the service worker in production only (dev uses Vite HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
