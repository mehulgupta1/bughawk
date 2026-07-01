import { useMemo, useState } from 'react';
import { parseScopeText, diffScope, mergeRules, scopeOf, IN, OUT, UNKNOWN } from '../../lib/scope.js';

// Paste an updated program scope, preview what changes (rules added/removed/
// re-classified) AND which already-discovered hosts flip in↔out↔unknown, then
// apply by merging or replacing.
export default function ScopeDiffModal({ rules, hosts, onApply, onClose, onCopyToast }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseScopeText(text) : null), [text]);

  // Rule-level diff (current vs pasted).
  const ruleDiff = useMemo(() => (parsed ? diffScope(rules, parsed) : null), [rules, parsed]);

  // Host-impact: how each discovered host's status changes under the new rules.
  const hostFlips = useMemo(() => {
    if (!parsed) return [];
    const flips = [];
    for (const h of hosts) {
      const before = scopeOf(h, rules);
      const after = scopeOf(h, parsed);
      if (before !== after) flips.push({ host: h, before, after });
    }
    // surface the most important first: things becoming in-scope, then out
    const weight = { [IN]: 0, [UNKNOWN]: 1, [OUT]: 2 };
    return flips.sort((a, b) => weight[a.after] - weight[b.after]);
  }, [parsed, rules, hosts]);

  const apply = (mode) => {
    if (!parsed) return;
    const next = mode === 'replace' ? parsed : mergeRules(rules, parsed).rules;
    onApply(next);
    onCopyToast?.(`Scope updated (${mode}) — ${next.length} rule(s)`);
    onClose();
  };

  const becameIn = hostFlips.filter((f) => f.after === IN).length;
  const becameOut = hostFlips.filter((f) => f.after === OUT).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Update scope &amp; preview changes</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <textarea
          className="import-panel-textarea mono"
          style={{ minHeight: 120 }}
          placeholder="Paste the program's NEW scope table here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />

        {parsed && (
          <>
            <div className="diff-summary">
              <span className="diff-stat opened">＋ {ruleDiff.added.length} rules added</span>
              <span className="diff-stat closed">－ {ruleDiff.removed.length} rules removed</span>
              <span className="diff-stat changed">⇄ {ruleDiff.changed.length} reclassified</span>
            </div>

            {hostFlips.length > 0 && (
              <div className="scope-flip-banner">
                Impact on your {hosts.length} discovered hosts:&nbsp;
                {becameIn > 0 && <b className="flip-in">{becameIn} now IN scope</b>}
                {becameIn > 0 && becameOut > 0 && ' · '}
                {becameOut > 0 && <b className="flip-out">{becameOut} now OUT</b>}
              </div>
            )}

            <div className="diff-body">
              <DiffGroup title="Rules added" cls="opened" items={ruleDiff.added.map((r) => `${r.scope} · ${r.pattern}`)} />
              <DiffGroup title="Rules removed" cls="closed" items={ruleDiff.removed.map((r) => `${r.scope} · ${r.pattern}`)} />
              <DiffGroup title="Reclassified" cls="changed" items={ruleDiff.changed.map((c) => `${c.from.scope} → ${c.to.scope} · ${c.to.pattern}`)} />

              {hostFlips.length > 0 && (
                <div className="diff-host">
                  <div className="diff-host-name">Discovered hosts changing status</div>
                  {hostFlips.slice(0, 100).map((f) => (
                    <div key={f.host} className="diff-line">
                      <span className={`scope-badge sm ${f.before}`}>{f.before}</span>
                      <span className="flip-arrow">→</span>
                      <span className={`scope-badge sm ${f.after}`}>{f.after}</span>
                      <span className="mono diff-svc">{f.host}</span>
                    </div>
                  ))}
                  {hostFlips.length > 100 && <div className="scope-gap-more">+{hostFlips.length - 100} more</div>}
                </div>
              )}
            </div>

            <div className="import-panel-bar">
              <div className="import-panel-spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => apply('replace')}>Replace all</button>
              <button className="btn btn-primary btn-sm" onClick={() => apply('merge')}>Merge into current</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffGroup({ title, cls, items }) {
  if (!items.length) return null;
  return (
    <div className="diff-host">
      <div className={`diff-host-name diff-${cls}`}>{title} ({items.length})</div>
      {items.map((t) => (
        <div key={t} className="diff-line"><span className={`diff-tag ${cls}`}>{title.split(' ')[1] || '•'}</span><span className="mono diff-svc">{t}</span></div>
      ))}
    </div>
  );
}
