import { enrich, nextCommands } from '../../lib/portintel.js';
import { parseCert, weakProtocols } from '../../lib/tls.js';

// Slide-over detail for one port record: dangerous flags, CVEs/KEV, exploits,
// TLS cert intel, Nuclei suggestions, recon checklist, and command generators.
export default function PortDetail({ rec, onClose, onCopy, onSendToSubdomains }) {
  if (!rec) return null;
  const e = enrich(rec);
  const cmds = nextCommands(rec);
  const cert = parseCert(rec);
  const weak = weakProtocols(rec);
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => onCopy?.(`Copied: ${text}`),
      () => onCopy?.('Copy failed')
    );
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(ev) => ev.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <div className="drawer-title mono">
              {rec.host}:{rec.port}/{rec.proto}
            </div>
            <div className="drawer-sub">
              <span className={`sev-pill sev-${e.severity}`}>{e.severity}</span>{' '}
              {[rec.service, rec.product, rec.version].filter(Boolean).join(' ') || 'unknown service'}
              {rec.ip && rec.ip !== rec.host ? ` · ${rec.ip}` : ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </header>

        <div className="drawer-body">
          {e.dangerousFlags.length > 0 && (
            <Section title="⚠ Dangerous configuration">
              {e.dangerousFlags.map((f) => (
                <div key={f} className="danger-flag">{f}</div>
              ))}
            </Section>
          )}

          {e.anomalies.length > 0 && (
            <Section title="Anomalies">
              {e.anomalies.map((a) => <div key={a} className="detail-line">{a}</div>)}
            </Section>
          )}

          <Section title="Known exploits">
            {e.exploits.length === 0 ? (
              <div className="detail-empty">No fingerprinted public exploits for this service.</div>
            ) : (
              e.exploits.map((x) => (
                <div key={x.label} className="detail-line">
                  {x.label} — <a href={x.url} target="_blank" rel="noreferrer">search ↗</a>
                </div>
              ))
            )}
          </Section>

          <Section title={`CVEs ${rec.kev ? '· 🔥 KEV (actively exploited)' : ''}`}>
            {rec.cveFetchedAt == null ? (
              <div className="detail-empty">Not looked up yet — run “Lookup CVEs” from the toolbar.</div>
            ) : !rec.cves || rec.cves.length === 0 ? (
              <div className="detail-empty">No CVEs found for {rec.product || 'this service'}.</div>
            ) : (
              rec.cves.map((c) => (
                <div key={c.id} className={`cve-row${c.kev ? ' cve-kev' : ''}`}>
                  <a href={`https://nvd.nist.gov/vuln/detail/${c.id}`} target="_blank" rel="noreferrer" className="mono">{c.id}</a>
                  {c.cvss != null && <span className="cve-cvss">CVSS {c.cvss}</span>}
                  {c.epss != null && <span className="cve-epss">EPSS {(c.epss * 100).toFixed(1)}%</span>}
                  {c.kev && <span className="cve-kevtag">KEV</span>}
                  {c.summary && <div className="cve-sum">{c.summary}</div>}
                </div>
              ))
            )}
          </Section>

          {(cert || weak.length > 0) && (
            <Section title="TLS certificate">
              {cert && (
                <>
                  <div className="detail-line">CN: <span className="mono">{cert.cn || '—'}</span></div>
                  {cert.issuer && <div className="detail-line">Issuer: {cert.issuer}</div>}
                  {cert.notAfter && (
                    <div className="detail-line">
                      Expires: {cert.notAfter}
                      {cert.expired && <span className="tls-flag bad"> EXPIRED</span>}
                      {!cert.expired && cert.expiringSoon && <span className="tls-flag warn"> {cert.daysLeft}d left</span>}
                    </div>
                  )}
                  {cert.selfSigned && <div className="tls-flag bad">⚠ Self-signed certificate</div>}
                  {cert.wildcard && <div className="tls-flag warn">Wildcard certificate</div>}
                </>
              )}
              {weak.length > 0 && (
                <div className="tls-flag bad">⚠ Weak TLS: {weak.join(', ')}</div>
              )}
              {cert && cert.sans.length > 0 && (
                <div className="san-block">
                  <div className="san-head">
                    Hostnames in cert (SAN) — {cert.sans.length}
                    {onSendToSubdomains && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onSendToSubdomains(cert.sans)}>
                        ＋ Send all to Subdomains
                      </button>
                    )}
                  </div>
                  {cert.sans.map((s) => (
                    <div key={s} className="san-row">
                      <span className="mono">{s}</span>
                      {onSendToSubdomains && (
                        <button className="icon-btn" title="Send to Subdomains" onClick={() => onSendToSubdomains([s])}>＋</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {e.nuclei.length > 0 && (
            <Section title="Suggested Nuclei templates">
              <code className="nuclei-tags">{e.nuclei.join(', ')}</code>
            </Section>
          )}

          {e.recon.length > 0 && (
            <Section title="Recon checklist">
              <ol className="recon-list">
                {e.recon.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </Section>
          )}

          <Section title="Run next">
            {cmds.map((c) => (
              <div key={c.label} className="cmd-row">
                <code className="cmd-code mono">{c.cmd}</code>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(c.cmd)}>Copy</button>
              </div>
            ))}
          </Section>

          {Object.keys(rec.scripts || {}).length > 0 && (
            <Section title="Script output">
              {Object.entries(rec.scripts).map(([k, v]) => (
                <div key={k} className="script-block">
                  <div className="script-id mono">{k}</div>
                  <pre className="script-out mono">{v}</pre>
                </div>
              ))}
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">{title}</div>
      {children}
    </div>
  );
}
