import { useCallback, useRef, useState, useEffect } from 'react';

// Generic windowed list. Renders only rows near the viewport.
//
// Props:
//   items     : full array (may be 50k+)
//   rowHeight : fixed px height per row
//   overscan  : extra rows above/below viewport (default 10)
//   renderRow : (item, index) => JSX  — must be cheap/memoized by caller
//   header    : optional JSX, rendered sticky inside the scroll container so it
//               stays aligned with rows during horizontal scroll
//   getKey    : (item) => key
//   minWidth  : optional min content width (enables horizontal scroll for wide
//               tables); header + rows share it so columns line up
export default function VirtualTable({
  items,
  rowHeight,
  overscan = 10,
  renderRow,
  header = null,
  getKey,
  empty = null,
  minWidth = null,
}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Throttle scroll events via requestAnimationFrame to prevent jank
  const onScroll = useCallback((e) => {
    const target = e.currentTarget;
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(target.scrollTop);
    });
  }, []);

  // Cleanup any pending raf on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;

  // Defensive clamp: even if the scroll container somehow reports a huge
  // clientHeight (e.g. a broken flex height chain), never window more than a
  // few screens worth of rows. This keeps the view responsive no matter what.
  const MAX_WINDOW = 200;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const fitCount = Math.ceil((viewportH || rowHeight * 20) / rowHeight) + overscan * 2;
  const visibleCount = Math.min(fitCount, MAX_WINDOW);
  const endIndex = Math.min(total, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;

  const slice = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    slice.push(
      <div key={getKey ? getKey(item) : i} style={{ height: rowHeight }}>
        {renderRow(item, i)}
      </div>
    );
  }

  const widthStyle = minWidth ? { minWidth } : undefined;

  return (
    <div className="vtable">
      <div className="vtable-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="vtable-inner" style={widthStyle}>
          {header && <div className="vtable-head-sticky">{header}</div>}
          {total === 0 ? (
            <div className="vtable-empty">{empty}</div>
          ) : (
            <div className="vtable-spacer" style={{ height: totalHeight }}>
              <div
                className="vtable-viewport"
                style={{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }}
              >
                {slice}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
