// Precision/recall harness over the labeled corpus. Run with: node --test
// Prints a per-category table and asserts minimum precision/recall so detection
// quality is measured, not vibes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine, classifyValue, computeConfidence, CONF_RANK } from './engine.js';
import { CORPUS, TARGET_CATS } from './corpus.js';

// Rebuild the classified params for a (normalized) URL so we can ask the engine
// for per-category confidence — the harness scores findings the tool would
// actually surface at the "Medium+" filter, not raw low-confidence noise.
function paramsOf(url) {
  const qi = url.indexOf('?');
  if (qi === -1) return [];
  const out = [];
  for (const [key, value] of new URLSearchParams(url.slice(qi))) out.push({ key, value, type: classifyValue(value) });
  return out;
}

const OPTS = {
  checks: {
    isURL: true, hasHost: true, noLocal: false, noBlank: true, noFrag: true,
    decodePct: true, noImg: true, uniq: false, entropy: false, noExt: true,
    normParam: true, minLen: true,
  },
  minLen: 2, entThresh: 2.0, customRegexes: [],
};

const TARGET = new Set(TARGET_CATS);

function evaluate() {
  const stat = {};
  for (const c of TARGET_CATS) stat[c] = { tp: 0, fp: 0, fn: 0 };

  for (const { url, expect } of CORPUS) {
    const { results } = runEngine([url], OPTS);
    const r = results[0];
    const params = r ? paramsOf(r.url) : [];
    // A category counts as predicted only if its own confidence is Medium+.
    const predicted = new Set(
      (r?.categories || [])
        .filter((c) => TARGET.has(c))
        .filter((c) => CONF_RANK[computeConfidence(c, params)] >= CONF_RANK.medium),
    );
    const expected = new Set(expect.filter((c) => TARGET.has(c)));
    for (const c of TARGET_CATS) {
      const p = predicted.has(c);
      const e = expected.has(c);
      if (p && e) stat[c].tp++;
      else if (p && !e) stat[c].fp++;
      else if (!p && e) stat[c].fn++;
    }
  }
  return stat;
}

function prf({ tp, fp, fn }) {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall };
}

test('detection precision/recall over labeled corpus', () => {
  const stat = evaluate();
  let TP = 0; let FP = 0; let FN = 0;

  const rows = [];
  for (const c of TARGET_CATS) {
    const s = stat[c];
    TP += s.tp; FP += s.fp; FN += s.fn;
    const { precision, recall } = prf(s);
    rows.push(`  ${c.padEnd(10)} tp=${s.tp} fp=${s.fp} fn=${s.fn}  P=${precision.toFixed(2)} R=${recall.toFixed(2)}`);
  }
  const microP = TP + FP === 0 ? 1 : TP / (TP + FP);
  const microR = TP + FN === 0 ? 1 : TP / (TP + FN);

  console.log(`\n=== Detection quality over ${CORPUS.length} labeled URLs ===`);
  console.log(rows.join('\n'));
  console.log(`  ----`);
  console.log(`  micro  P=${microP.toFixed(3)}  R=${microR.toFixed(3)}  (TP=${TP} FP=${FP} FN=${FN})\n`);

  // Thresholds — tighten as the corpus grows.
  assert.ok(microP >= 0.85, `precision ${microP.toFixed(3)} below 0.85`);
  assert.ok(microR >= 0.85, `recall ${microR.toFixed(3)} below 0.85`);
});
