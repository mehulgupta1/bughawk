import { useMemo, useState } from 'react';
import { diffRecords, diffIsEmpty, groupDiffByHost } from '../../lib/portdiff.js';

// "What changed" — diff the current live data against a chosen baseline (a saved
// session snapshot). Highlights ports opened / closed / service-changed per host.
export default function PortDiffModal({ ports, onClose }) {
  const { records, sessions } = ports;
  const [baselineId, setBaselineId] = useState(sessions[0]?.id || '');

  const baseline = sessions.find((s) => s.id === baselineId);
  const diff = useMemo(
    () => (baseline ? diffRecords(baseline.records, records) : null),
    [baseline, records]
  );
  const groups = useMemo(() => (diff ? groupDiffByHost(diff) : []), [diff]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>What changed</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {sessions.length === 0 ? (
          <div className="detail-empty" style={{ padding: '16px 0' }}>
            No saved session to compare against. Save a session now (💾 Sessions), then
            re-import a later scan and come back here to see the difference.
          </div>
        ) : (
          <>
            <div className="diff-baseline-row">
              <span className="diff-baseline-label">Compare current data against baseline:</span>
              <select className="mini-select" value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.count} ports · {new Date(s.savedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {diff && (
              <div className="diff-summary">
                <span className="diff-stat opened">🟢 {diff.opened.length} opened</span>
                <span className="diff-stat closed">🔴 {diff.closed.length} closed</span>
                <span className="diff-stat changed">⚪ {diff.changed.length} changed</span>
              </div>
            )}

            <div className="diff-body">
              {diffIsEmpty(diff) ? (
                <div className="detail-empty" style={{ padding: '16px 0' }}>
                  No differences — current data matches “{baseline?.name}”.
                </div>
              ) : (
                groups.map(([host, g]) => (
                  <div key={host} className="diff-host">
                    <div className="diff-host-name mono">{host}</div>
                    {g.opened.map((r) => (
                      <div key={`o${r.key}`} className="diff-line opened">
                        <span className="diff-tag opened">OPENED</span>
                        <span className="mono">{r.port}/{r.proto}</span>
                        <span className="diff-svc">{label(r)}</span>
                      </div>
                    ))}
                    {g.changed.map((c) => (
                      <div key={`c${c.rec.key}`} className="diff-line changed">
                        <span className="diff-tag changed">CHANGED</span>
                        <span className="mono">{c.rec.port}/{c.rec.proto}</span>
                        <span className="diff-svc">{c.from.label} → <b>{c.to.label}</b></span>
                      </div>
                    ))}
                    {g.closed.map((r) => (
                      <div key={`x${r.key}`} className="diff-line closed">
                        <span className="diff-tag closed">CLOSED</span>
                        <span className="mono">{r.port}/{r.proto}</span>
                        <span className="diff-svc">{label(r)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function label(r) {
  return [r.service, r.product, r.version].filter(Boolean).join(' ') || '—';
}
