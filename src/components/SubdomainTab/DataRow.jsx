import { memo } from 'react';
import StatusBadge from './StatusBadge.jsx';
import AuditSelect from './AuditSelect.jsx';
import { cellContent } from './cells.jsx';
import { relativeTime } from '../../utils/time.js';

// Fixed widths so the (separate) header and rows line up during horizontal
// scroll. Host grows; everything else is fixed.
const W = { check: 38, num: 52, host: 260, status: 86, audit: 118, date: 116, actions: 120 };
function dataWidth(col) {
  return col.type === 'number' ? 96 : col.type === 'array' ? 210 : 190;
}

export function tableMinWidth(visibleCols) {
  let w = W.check + W.num + W.host + W.status + W.audit + W.date + W.actions;
  for (const c of visibleCols) w += dataWidth(c);
  return w;
}

// http for plain :80-ish hosts is rare in recon; default to https, fall back is the user's.
const hostUrl = (h) => (/^https?:\/\//i.test(h) ? h : `https://${h.replace(/^\/\//, '')}`);

function Cell({ w, grow, align, className = '', children, ...rest }) {
  return (
    <div
      className={`vcell ${className}`}
      style={{ width: w, flexGrow: grow ? 1 : 0, flexShrink: 0, textAlign: align }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function TableHeader({ visibleCols, sort, onSort, selectAll = null }) {
  const ind = (k) => (sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
  return (
    <div className="vrow vhead">
      <Cell w={W.check} align="center">{selectAll}</Cell>
      <Cell w={W.num} className="muted">#</Cell>
      <Cell w={W.host} grow className="sortable" onClick={() => onSort('host')}>SUBDOMAIN{ind('host')}</Cell>
      <Cell w={W.status} className="sortable" onClick={() => onSort('status')}>STATUS{ind('status')}</Cell>
      {visibleCols.map((c) => (
        <Cell key={c.key} w={dataWidth(c)} align={c.type === 'number' ? 'right' : 'left'}>
          {c.label.toUpperCase()}
        </Cell>
      ))}
      <Cell w={W.audit}>AUDIT</Cell>
      <Cell w={W.date} className="sortable" onClick={() => onSort('date')}>DATE{ind('date')}</Cell>
      <Cell w={W.actions} align="center">ACTIONS</Cell>
    </div>
  );
}

function DataRow({
  rec, index, visibleCols, keyword, isNew, checked,
  onCheck, onCopy, onToggleTag, onSetAudit, onHistory,
}) {
  const histCount = Array.isArray(rec.history) ? rec.history.length : 0;
  return (
    <div className={`vrow${rec.audit === 'vulnerable' ? ' vuln-row' : ''}`}>
      <Cell w={W.check} align="center">
        <input type="checkbox" className="row-cb" checked={checked} onChange={() => onCheck(rec.id)} />
      </Cell>
      <Cell w={W.num} className="muted mono">{index}</Cell>
      <Cell w={W.host} grow>
        <span className="host-inner" style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          {keyword && <span className="smart-dot" title={`Smart-flag: matches "${keyword}"`} style={{ flexShrink: 0 }} />}
          <a className="host-link mono" href={hostUrl(rec.host)} target="_blank" rel="noreferrer noopener" title="Open in new tab ↗" style={{ flexShrink: 0 }}>
            {rec.host}
          </a>
          {isNew && <span className="new-badge" style={{ flexShrink: 0 }}>NEW</span>}
          <button
            className={`hist-ic${histCount > 1 ? ' has' : ''}`}
            title="Status history"
            onClick={() => onHistory(rec)}
            style={{ flexShrink: 0 }}
          >
            ◷
          </button>
          {rec.fields?.location && (
            <span className="host-redirect mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8, minWidth: 0 }}>
              → {rec.fields.location}
            </span>
          )}
        </span>
      </Cell>
      <Cell w={W.status}><StatusBadge status={rec.status} /></Cell>
      {visibleCols.map((c) => (
        <Cell key={c.key} w={dataWidth(c)} align={c.type === 'number' ? 'right' : 'left'}
          className={c.type === 'number' ? 'mono' : ''}>
          {cellContent(c, rec)}
        </Cell>
      ))}
      <Cell w={W.audit}><AuditSelect value={rec.audit} onChange={(v) => onSetAudit(rec.id, v)} /></Cell>
      <Cell w={W.date} className="muted mono">{relativeTime(rec.addedAt)}</Cell>
      <Cell w={W.actions} align="center">
        <div className="actions-cell">
          <button className={`action-btn${rec.tag ? ' on' : ''}`} title="Flag" onClick={() => onToggleTag(rec.id)}>
            {rec.tag ? '★' : '☆'}
          </button>
          <button className="action-btn" title="History" onClick={() => onHistory(rec)}>◷</button>
          <button className="action-btn" title="Copy" onClick={() => onCopy(rec.host)}>⧉</button>
        </div>
      </Cell>
    </div>
  );
}

export default memo(DataRow);
