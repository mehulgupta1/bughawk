// Dev-only performance/error telemetry. The browser can't easily hand me a
// profiler trace, so instead we stream the signals that matter — per-tab render
// timings, long tasks (main-thread jank), slow interactions (INP), and
// uncaught errors — to the dev server, which appends them to `perf.log`. Every
// entry is tagged with the active tab, so "which tab is slow" is answerable by
// reading one file instead of a screenshot.
//
// No-ops entirely unless initTelemetry() ran (dev only), so it costs nothing in
// prod even though App/main import from it.

let enabled = false;
let currentTab = 'dashboard';
const buf = [];
let flushTimer = null;

function flush() {
  flushTimer = null;
  if (!buf.length) return;
  const body = buf.splice(0).map((e) => JSON.stringify(e)).join('\n') + '\n';
  try {
    if (!navigator.sendBeacon('/__perf', body)) throw new Error('beacon refused');
  } catch {
    fetch('/__perf', { method: 'POST', body, keepalive: true }).catch(() => {});
  }
}

function send(entry) {
  if (!enabled) return;
  buf.push({ t: Date.now(), tab: currentTab, ...entry });
  if (!flushTimer) flushTimer = setTimeout(flush, 500);
}

// Record what tab is active so async signals (jank/errors) attribute correctly.
export function setPerfTab(tab) { currentTab = tab; }

// Explicit timing/event, e.g. logPerf('tab', { tab, ms }).
export function logPerf(kind, data = {}) { send({ kind, ...data }); }

export function initTelemetry() {
  if (enabled) return;
  enabled = true;
  send({ kind: 'session-start', ua: navigator.userAgent, url: location.href });

  window.addEventListener('error', (e) => send({
    kind: 'error',
    msg: String(e.message),
    src: e.filename, line: e.lineno,
    stack: e.error?.stack?.split('\n').slice(0, 4).join(' | '),
  }));
  window.addEventListener('unhandledrejection', (e) => send({
    kind: 'unhandledrejection',
    msg: String(e.reason?.message || e.reason),
    stack: e.reason?.stack?.split('\n').slice(0, 4).join(' | '),
  }));

  // Long tasks = main thread blocked ≥50ms; we only care about the painful ones.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 200) send({ kind: 'longtask', ms: Math.round(entry.duration) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* Safari/FF: no longtask */ }

  // Slow interactions (the INP culprits), with the element that was clicked.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const el = entry.target;
        send({
          kind: 'slow-interaction',
          name: entry.name,
          ms: Math.round(entry.duration),
          target: el ? `${el.tagName?.toLowerCase() || ''}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` : '',
        });
      }
    }).observe({ type: 'event', durationThreshold: 200, buffered: true });
  } catch { /* no event timing */ }

  // Don't lose the tail buffer when the tab closes / reloads.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
