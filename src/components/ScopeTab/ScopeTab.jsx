import { useMemo, useState } from 'react';
import {
  parseScopeText, mergeRules, makeRule, matchScope, coverage, cidrInfo, diffScope,
  IN, OUT,
} from '../../lib/scope.js';
import ScopeDiffModal from './ScopeDiffModal.jsx';

// Scope manager: define in/out rules, paste program scope (H1/Bugcrowd/Intigriti),
// see coverage over discovered assets, and check any host against the rules.
export default function ScopeTab({ rules, onSaveRules, subRecords, portRecords, onCopyToast }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState(null);
  const [newPattern, setNewPattern] = useState('');
  const [newScope, setNewScope] = useState(IN);
  const [check, setCheck] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [cidrQuery, setCidrQuery] = useState('');

  const allHosts = useMemo(() => [
    ...new Set([
      ...(subRecords || []).map((r) => r.host),
      ...(portRecords || []).map((r) => r.host),
    ].filter(Boolean)),
  ], [subRecords, portRecords]);

  const cidrPreview = cidrInfo(cidrQuery);

  const inRules = rules.filter((r) => r.scope === IN);
  const outRules = rules.filter((r) => r.scope === OUT);

  // Coverage across every discovered host (subdomains + port hosts).
  const cov = useMemo(() => {
    const hosts = [
      ...(subRecords || []).map((r) => r.host),
      ...(portRecords || []).map((r) => r.host),
    ];
    return coverage(hosts, rules);
  }, [subRecords, portRecords, rules]);

  const addRule = () => {
    if (!newPattern.trim()) return;
    const rule = makeRule(newPattern, newScope);
    const { rules: next } = mergeRules(rules, [rule]);
    onSaveRules(next);
    setNewPattern('');
  };

  const removeRule = (id) => onSaveRules(rules.filter((r) => r.id !== id));

  const previewPaste = (text) => {
    setPasteText(text);
    setPastePreview(text.trim() ? parseScopeText(text) : null);
  };

  const applyPaste = () => {
    const parsed = parseScopeText(pasteText);
    const { rules: next, added, updated } = mergeRules(rules, parsed);
    const d = diffScope(rules, next);
    onSaveRules(next);
    onCopyToast?.(`Scope: ${added} added, ${updated} changed${d.removed.length ? `, ${d.removed.length} now missing` : ''}`);
    setPasteOpen(false);
    setPasteText('');
    setPastePreview(null);
  };

  const checkResult = check.trim() ? matchScope(check, rules) : null;

  const copyCmd = (cmd) => {
    navigator.clipboard?.writeText(cmd).then(
      () => onCopyToast?.(`Copied: ${cmd}`),
      () => onCopyToast?.('Copy failed')
    );
  };

  return (
    <div className="tab-content">
      <div className="tab-head">
        <h2>Scope</h2>
        <p>Define what's in and out of scope. Rules auto-tag &amp; filter every host across Subdomains and Ports.</p>
      </div>

      {/* coverage summary */}
      <div className="scope-cov-row">
        <CovCard label="In scope" value={cov.in} cls="in" />
        <CovCard label="Out of scope" value={cov.out} cls="out" />
        <CovCard label="Unknown (gap)" value={cov.unknown.length} cls="unknown" />
        <CovCard label="Discovered hosts" value={cov.total} cls="total" />
      </div>

      {/* quick checker */}
      <div className="glass-card scope-check-card">
        <span className="scope-check-label">Is it in scope?</span>
        <input
          className="scope-check-input mono"
          placeholder="paste any host or IP, e.g. admin.example.com"
          value={check}
          onChange={(e) => setCheck(e.target.value)}
          spellCheck={false}
        />
        {checkResult && (
          <span className={`scope-badge ${checkResult.scope}`}>
            {checkResult.scope.toUpperCase()}
            {checkResult.rule ? ` · ${checkResult.rule.pattern}` : ' · no matching rule'}
          </span>
        )}
      </div>

      {/* add / import controls */}
      <div className="glass-card scope-add-card">
        <input
          className="scope-add-input mono"
          placeholder="Add a rule: *.example.com, admin.example.com, or 203.0.113.0/24"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addRule(); }}
          spellCheck={false}
        />
        <select className="mini-select" value={newScope} onChange={(e) => setNewScope(e.target.value)}>
          <option value={IN}>In scope</option>
          <option value={OUT}>Out of scope</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={addRule}>＋ Add</button>
        <div className="filter-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setDiffOpen(true)} disabled={rules.length === 0}>
          🔀 Update &amp; diff
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setPasteOpen((o) => !o)}>
          📋 Paste program scope
        </button>
      </div>

      {/* CIDR helper */}
      <div className="glass-card scope-cidr-card">
        <span className="scope-check-label">CIDR helper</span>
        <input
          className="scope-add-input mono"
          placeholder="e.g. 203.0.113.0/24"
          value={cidrQuery}
          onChange={(e) => setCidrQuery(e.target.value)}
          spellCheck={false}
        />
        {cidrPreview ? (
          <>
            <span className="cidr-info">
              <b>{cidrPreview.count.toLocaleString()}</b> IPs · {cidrPreview.first} – {cidrPreview.last}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => copyCmd(`naabu -host ${cidrQuery.trim()} -top-ports 1000`)}>Copy naabu</button>
            <button className="btn btn-ghost btn-sm" onClick={() => copyCmd(`echo ${cidrQuery.trim()} | mapcidr | dnsx -ptr -resp-only`)}>Copy PTR sweep</button>
            <a className="btn btn-ghost btn-sm" href={`https://bgp.he.net/ip/${cidrQuery.trim().split('/')[0]}`} target="_blank" rel="noreferrer">ASN / owner ↗</a>
            <button className="btn btn-primary btn-sm" onClick={() => { const { rules: next } = mergeRules(rules, [makeRule(cidrQuery, IN)]); onSaveRules(next); }}>＋ Add as in-scope</button>
          </>
        ) : cidrQuery.trim() ? (
          <span className="cidr-info bad">Not a valid CIDR (e.g. 10.0.0.0/24)</span>
        ) : (
          <span className="cidr-info hint">Expands a range, counts hosts, and copies scan commands.</span>
        )}
      </div>

      {pasteOpen && (
        <div className="glass-card scope-paste-card">
          <textarea
            className="import-panel-textarea mono"
            style={{ minHeight: 140 }}
            placeholder={'Paste the scope table from HackerOne / Bugcrowd / Intigriti.\nSection headers like "Out of scope" and inline "Eligible/Ineligible" are understood.'}
            value={pasteText}
            onChange={(e) => previewPaste(e.target.value)}
            spellCheck={false}
          />
          {pastePreview && (
            <div className="scope-paste-preview">
              Detected <strong>{pastePreview.length}</strong> rule(s):{' '}
              {pastePreview.filter((r) => r.scope === IN).length} in,{' '}
              {pastePreview.filter((r) => r.scope === OUT).length} out
            </div>
          )}
          <div className="import-panel-bar">
            <div className="import-panel-spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => { setPasteOpen(false); setPasteText(''); setPastePreview(null); }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={applyPaste} disabled={!pastePreview || pastePreview.length === 0}>
              Import {pastePreview ? `${pastePreview.length} rule(s)` : ''}
            </button>
          </div>
        </div>
      )}

      {diffOpen && (
        <ScopeDiffModal
          rules={rules}
          hosts={allHosts}
          onApply={onSaveRules}
          onClose={() => setDiffOpen(false)}
          onCopyToast={onCopyToast}
        />
      )}

      {/* rule lists */}
      <div className="scope-lists">
        <RuleList title="In scope" cls="in" rules={inRules} onRemove={removeRule} />
        <RuleList title="Out of scope" cls="out" rules={outRules} onRemove={removeRule} />
      </div>

      {/* coverage gap */}
      {cov.unknown.length > 0 && (
        <div className="glass-card scope-gap-card">
          <div className="scope-gap-head">
            ⚠ {cov.unknown.length} discovered host(s) match no scope rule
            <span className="scope-gap-sub">— clarify with the program or add a rule</span>
          </div>
          <div className="scope-gap-list">
            {cov.unknown.slice(0, 200).map((h) => (
              <span key={h} className="scope-gap-item mono" onClick={() => setNewPattern(h)} title="Click to add as a rule">{h}</span>
            ))}
            {cov.unknown.length > 200 && <span className="scope-gap-more">+{cov.unknown.length - 200} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function CovCard({ label, value, cls }) {
  return (
    <div className={`scope-cov-card cov-${cls}`}>
      <div className="scope-cov-num">{value.toLocaleString()}</div>
      <div className="scope-cov-label">{label}</div>
    </div>
  );
}

function RuleList({ title, cls, rules, onRemove }) {
  return (
    <div className="glass-card scope-rule-list">
      <div className={`scope-rule-head ${cls}`}>{title} <span className="scope-rule-count">{rules.length}</span></div>
      {rules.length === 0 ? (
        <div className="detail-empty" style={{ padding: 12 }}>No rules yet.</div>
      ) : (
        rules.map((r) => (
          <div key={r.id} className="scope-rule-row">
            <span className={`scope-kind kind-${r.kind}`}>{r.kind}</span>
            <span className="scope-pattern mono">{r.pattern}</span>
            {r.kind === 'cidr' && cidrInfo(r.pattern) && (
              <span className="scope-note">{cidrInfo(r.pattern).count.toLocaleString()} IPs</span>
            )}
            {r.note && <span className="scope-note">{r.note}</span>}
            <span className="filter-spacer" />
            <button className="icon-btn" title="Remove" onClick={() => onRemove(r.id)}>✕</button>
          </div>
        ))
      )}
    </div>
  );
}
