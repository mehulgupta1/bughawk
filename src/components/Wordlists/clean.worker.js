// Cleans a (potentially huge) pasted/imported wordlist off the main thread.
import { cleanLines } from '../../lib/wordlists.js';

self.onmessage = (e) => {
  const { text, opts } = e.data;
  const content = cleanLines(text, opts);
  const lines = content ? content.split('\n').length : 0; // cleaned -> no blank lines
  const preview = content.split('\n').slice(0, 6).join('\n');
  self.postMessage({ content, lines, preview });
};
