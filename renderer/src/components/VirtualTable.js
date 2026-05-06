import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Lightweight virtual scroll table -- only renders visible rows.
 * Props:
 *  - items: array of data
 *  - rowHeight: pixel height per row (default 44)
 *  - maxHeight: container max height (default 500)
 *  - renderHeader: () => <tr>...</tr>
 *  - renderRow: (item, index) => <tr>...</tr>
 *  - overscan: extra rows above/below viewport (default 5)
 */
function VirtualTable({ items, rowHeight = 44, maxHeight = 500, renderHeader, renderRow, overscan = 5, className = '' }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount = Math.ceil(maxHeight / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Reset scroll when items change significantly
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [items.length]);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  return (
    <div
      ref={containerRef}
      className={`table-container ${className}`}
      style={{ maxHeight: `${maxHeight}px`, overflow: 'auto' }}
      onScroll={handleScroll}
    >
      <table className="table">
        <thead>{renderHeader()}</thead>
        <tbody>
          {/* Spacer for rows above */}
          {offsetY > 0 && <tr style={{ height: `${offsetY}px` }}><td colSpan="100" style={{ padding: 0, border: 'none' }} /></tr>}
          {visibleItems.map((item, i) => renderRow(item, startIndex + i))}
          {/* Spacer for rows below */}
          {endIndex < items.length && (
            <tr style={{ height: `${(items.length - endIndex) * rowHeight}px` }}>
              <td colSpan="100" style={{ padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default VirtualTable;
