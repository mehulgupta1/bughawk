import { useMemo, useState, useCallback, memo, useTransition } from 'react';
import DataRow, { TableHeader, tableMinWidth } from './DataRow.jsx';

const GROUP_PAGE_SIZE = 10;
const GROUPS_PER_PAGE = 10; // Only render 10 groups at a time

// Build groups. For 'tech', a host appears under each of its tech values.
// Returns a pre-sorted array of { key, count } and a Map of key -> records[].
// We separate the summary from the actual rows to avoid materializing row arrays
// for groups we'll never render on the current page.
function buildGroupIndex(records, groupBy) {
  const map = new Map();
  for (const r of records) {
    if (groupBy === 'tech') {
      const techs = r.tech && r.tech.length ? r.tech : ['(no tech)'];
      for (const t of techs) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push(r);
      }
    } else {
      const k = r.ip || '(no ip)';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
  }
  // Build sorted summary (sorted by count descending)
  const summary = [];
  for (const [key, rows] of map) {
    summary.push({ key, count: rows.length });
  }
  summary.sort((a, b) => b.count - a.count);
  return { summary, map };
}

// Paginated grouped view: paginates GROUPS themselves (50 groups per page)
// AND paginates rows within each group (500 rows per page).
export default function GroupedTable({ records, groupBy, visibleCols, rowProps }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [groupPages, setGroupPages] = useState(() => new Map()); // groupKey -> row page
  const [groupsPage, setGroupsPage] = useState(0); // which page of groups we're on
  const [isPending, startTransition] = useTransition();

  const { summary, map } = useMemo(
    () => buildGroupIndex(records, groupBy),
    [records, groupBy]
  );

  // Reset pagination when data changes
  useMemo(() => {
    setGroupPages(new Map());
    setGroupsPage(0);
  }, [records, groupBy]);

  const toggle = useCallback((key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const setGroupPage = useCallback((groupKey, page) => {
    setGroupPages((prev) => {
      const next = new Map(prev);
      next.set(groupKey, page);
      return next;
    });
  }, []);

  const minWidth = tableMinWidth(visibleCols);
  const headerEl = <TableHeader visibleCols={visibleCols} sort={rowProps.sort} onSort={rowProps.onSort} />;

  // Paginate the groups themselves
  const totalGroups = summary.length;
  const groupPageCount = Math.max(1, Math.ceil(totalGroups / GROUPS_PER_PAGE));
  const safeGroupsPage = Math.min(groupsPage, groupPageCount - 1);
  const gpStart = safeGroupsPage * GROUPS_PER_PAGE;
  const gpEnd = Math.min(totalGroups, gpStart + GROUPS_PER_PAGE);
  const visibleGroups = summary.slice(gpStart, gpEnd);

  const handleGroupsPageChange = useCallback((newPage) => {
    startTransition(() => {
      setGroupsPage(newPage);
    });
  }, []);

  return (
    <div className="vtable">
      {/* Groups pagination header */}
      {groupPageCount > 1 && (
        <div className="groups-pagination-bar">
          <span className="mono groups-info">
            Showing groups {gpStart + 1}–{gpEnd} of {totalGroups.toLocaleString()}
            {isPending && ' (loading…)'}
          </span>
          <div className="page-controls">
            <button className="page-btn" disabled={safeGroupsPage === 0}
              onClick={() => handleGroupsPageChange(0)} title="First">⟨⟨</button>
            <button className="page-btn" disabled={safeGroupsPage === 0}
              onClick={() => handleGroupsPageChange(safeGroupsPage - 1)}>Previous</button>
            <span className="mono">{safeGroupsPage + 1} / {groupPageCount}</span>
            <button className="page-btn" disabled={safeGroupsPage >= groupPageCount - 1}
              onClick={() => handleGroupsPageChange(safeGroupsPage + 1)}>Next</button>
            <button className="page-btn" disabled={safeGroupsPage >= groupPageCount - 1}
              onClick={() => handleGroupsPageChange(groupPageCount - 1)} title="Last">⟩⟩</button>
          </div>
        </div>
      )}

      <div className="vtable-scroll">
        <div className="vtable-inner" style={{ minWidth }}>
          <div className="vtable-head-sticky">{headerEl}</div>
          {totalGroups === 0 ? (
            <div className="vtable-empty">No hosts.</div>
          ) : (
            visibleGroups.map((g) => {
              const isOpen = !collapsed.has(g.key);
              const rows = map.get(g.key);
              const curPage = groupPages.get(g.key) || 0;
              const pageCount = Math.ceil(g.count / GROUP_PAGE_SIZE);
              const safePage = Math.min(curPage, pageCount - 1);
              const pageStart = safePage * GROUP_PAGE_SIZE;
              const pageEnd = Math.min(g.count, pageStart + GROUP_PAGE_SIZE);

              return (
                <GroupSection
                  key={g.key}
                  groupKey={g.key}
                  rows={rows}
                  isOpen={isOpen}
                  onToggle={toggle}
                  safePage={safePage}
                  pageCount={pageCount}
                  pageStart={pageStart}
                  pageEnd={pageEnd}
                  totalRows={g.count}
                  onSetPage={setGroupPage}
                  visibleCols={visibleCols}
                  rowProps={rowProps}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Bottom groups pagination */}
      {groupPageCount > 1 && (
        <div className="groups-pagination-bar">
          <span className="mono groups-info">
            Groups {gpStart + 1}–{gpEnd} of {totalGroups.toLocaleString()}
          </span>
          <div className="page-controls">
            <button className="page-btn" disabled={safeGroupsPage === 0}
              onClick={() => handleGroupsPageChange(0)}>⟨⟨</button>
            <button className="page-btn" disabled={safeGroupsPage === 0}
              onClick={() => handleGroupsPageChange(safeGroupsPage - 1)}>Previous</button>
            <span className="mono">{safeGroupsPage + 1} / {groupPageCount}</span>
            <button className="page-btn" disabled={safeGroupsPage >= groupPageCount - 1}
              onClick={() => handleGroupsPageChange(safeGroupsPage + 1)}>Next</button>
            <button className="page-btn" disabled={safeGroupsPage >= groupPageCount - 1}
              onClick={() => handleGroupsPageChange(groupPageCount - 1)}>⟩⟩</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Separate component for each group section — isolates re-renders per group
const GroupSection = memo(function GroupSection({
  groupKey, rows, isOpen, onToggle,
  safePage, pageCount, pageStart, pageEnd, totalRows,
  onSetPage, visibleCols, rowProps,
}) {
  const pageRows = useMemo(
    () => rows.slice(pageStart, pageEnd),
    [rows, pageStart, pageEnd]
  );

  return (
    <div className="group-section">
      <div className="group-row-v" onClick={() => onToggle(groupKey)}>
        <span className={`group-chev${isOpen ? ' open' : ''}`}>▸</span>
        <span className="group-name mono">{groupKey}</span>
        <span className="group-count">{totalRows.toLocaleString()} hosts</span>
      </div>
      {isOpen && (
        <>
          {pageRows.map((r, i) => (
            <DataRow
              key={r.id}
              rec={r}
              index={pageStart + i + 1}
              visibleCols={visibleCols}
              keyword={rowProps.keywordOf(r)}
              isNew={rowProps.isNew(r)}
              checked={rowProps.checked.has(r.id)}
              {...rowProps.handlers}
            />
          ))}
          {pageCount > 1 && (
            <div className="group-pagination">
              <button
                className="page-btn"
                disabled={safePage === 0}
                onClick={(e) => { e.stopPropagation(); onSetPage(groupKey, safePage - 1); }}
              >
                ◀ Prev
              </button>
              <span className="mono group-page-info">
                {pageStart + 1}–{pageEnd} of {totalRows.toLocaleString()}
                {' · '}Page {safePage + 1}/{pageCount}
              </span>
              <button
                className="page-btn"
                disabled={safePage >= pageCount - 1}
                onClick={(e) => { e.stopPropagation(); onSetPage(groupKey, safePage + 1); }}
              >
                Next ▶
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});
