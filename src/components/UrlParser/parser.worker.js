// Web Worker wrapper around the URL Parser engine. Runs the heavy scan off the
// main thread so the UI stays responsive even with 50k+ URLs.
import { runEngine } from './engine.js';

self.onmessage = (e) => {
  const { lines, opts } = e.data;
  try {
    const { results, stats } = runEngine(lines, opts, (percent, text) => {
      self.postMessage({ type: 'progress', percent, text });
    });
    self.postMessage({ type: 'done', results, stats });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
