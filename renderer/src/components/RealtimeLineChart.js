import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';

// Catmull-Rom to cubic bezier — produces the same smooth curves Google Analytics uses.
// Each point becomes a cubic bezier control point based on its neighbors.
function catmullRomToBezier(points) {
  if (points.length < 2) return points.length === 1 ? `M ${points[0].x} ${points[0].y}` : '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildAreaPath(smoothPath, firstPoint, lastPoint, bottomY) {
  if (!smoothPath) return '';
  return `${smoothPath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`;
}

function RealtimeLineChart({
  data = [],
  series = [],
  height = 260,
  compact = false,
  xKey = 'label',
  yMax: externalMax = null,
  summaryLabel = '',
  summaryValue = '',
  summaryDelta = '',
  rangeLabel = '',
  accentTone = 'var(--accent)'
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Observe container width for true responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { top: 24, right: 20, bottom: 40, left: 44 };
  const plotW = containerWidth - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const viewBox = `0 0 ${containerWidth} ${height}`;

  const maxValue = useMemo(() => {
    if (externalMax && externalMax > 0) return externalMax;
    const vals = data.flatMap(e => series.map(s => Number(e[s.key]) || 0));
    return Math.max(...vals, 1);
  }, [data, externalMax, series]);

  // Y-axis grid: 5 nice rounded ticks
  const gridLines = useMemo(() => {
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    return ticks.map(r => ({
      y: PAD.top + plotH - r * plotH,
      label: r === 0 ? '0' : maxValue * r >= 1000
        ? `${(maxValue * r / 1000).toFixed(1)}k`
        : String(Math.round(maxValue * r))
    }));
  }, [maxValue, PAD.top, plotH]);

  const chartSeries = useMemo(() => {
    if (data.length === 0) return [];
    return series.map(item => {
      const points = data.map((entry, i) => {
        const x = PAD.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
        const raw = Number(entry[item.key]) || 0;
        const y = PAD.top + plotH - (raw / maxValue) * plotH;
        return { x, y, value: raw, label: entry[xKey] };
      });
      const smoothPath = catmullRomToBezier(points);
      const areaPath = buildAreaPath(
        smoothPath,
        points[0],
        points[points.length - 1],
        PAD.top + plotH
      );
      return { ...item, points, smoothPath, areaPath };
    });
  }, [data, maxValue, PAD.left, PAD.top, plotW, plotH, series, xKey]);

  // X-axis labels: show at most 8 evenly spaced labels
  const xLabels = useMemo(() => {
    if (data.length === 0) return [];
    const maxLabels = Math.min(8, data.length);
    const step = Math.max(1, Math.floor(data.length / maxLabels));
    return data
      .map((entry, i) => ({ label: entry[xKey], sourceIndex: i }))
      .filter((entry) => entry.sourceIndex % step === 0 || entry.sourceIndex === data.length - 1);
  }, [data, xKey]);

  const livePoint = useMemo(() => {
    const primarySeries = chartSeries[0];
    if (!primarySeries || primarySeries.points.length === 0) return null;
    return primarySeries.points[primarySeries.points.length - 1];
  }, [chartSeries]);

  const handleMouseMove = useCallback((e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (containerWidth / rect.width);
    if (data.length === 0) return;
    let closest = 0;
    let minDist = Infinity;
    data.forEach((_, i) => {
      const px = PAD.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const dist = Math.abs(svgX - px);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setHoverIndex(closest);
    const px = PAD.left + (data.length <= 1 ? plotW / 2 : (closest / (data.length - 1)) * plotW);
    const tooltipX = Math.min(px, containerWidth - 200);
    setTooltipPos({ x: tooltipX, y: PAD.top });
  }, [data, PAD.left, PAD.top, plotW, containerWidth]);

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  if (data.length === 0) {
    return (
      <div className="line-chart-shell" style={{ height }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
          color: 'var(--text-muted)', flexDirection: 'column', gap: '8px' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span style={{ fontSize: '13px' }}>No data to display</span>
        </div>
      </div>
    );
  }

  return (
    <div className="line-chart-shell" ref={containerRef} style={{ position: 'relative' }}>
      {(summaryLabel || rangeLabel || summaryValue) && (
        <div className="line-chart-meta">
          <div className="line-chart-meta-copy">
            {summaryLabel && <div className="line-chart-meta-label">{summaryLabel}</div>}
            {summaryValue && (
              <div className="line-chart-meta-value">
                <span>{summaryValue}</span>
                {summaryDelta && (
                  <span
                    className={`line-chart-meta-delta ${String(summaryDelta).trim().startsWith('-') ? 'negative' : ''}`}
                    style={{ '--line-chart-delta-accent': accentTone }}
                  >
                    {summaryDelta}
                  </span>
                )}
              </div>
            )}
          </div>
          {rangeLabel && <div className="line-chart-range-pill">{rangeLabel}</div>}
        </div>
      )}

      {/* Legend */}
      <div className="line-chart-legend">
        {series.map(item => (
          <div key={item.key} className="line-chart-legend-item">
            <span className="line-chart-legend-swatch" style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* SVG chart */}
      <div className="line-chart-scroller" style={{ overflow: 'visible' }}>
        <svg
          viewBox={viewBox}
          className="line-chart-svg"
          style={{ height: `${height}px`, width: '100%', display: 'block', overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {chartSeries.map((item, idx) => (
              <linearGradient key={item.key} id={`ga-grad-${item.key}-${idx}`} x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%"   stopColor={item.color} stopOpacity="0.25" />
                <stop offset="75%"  stopColor={item.color} stopOpacity="0.05" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <linearGradient id="ga-chart-backdrop" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(91,180,212,0.08)" />
              <stop offset="100%" stopColor="rgba(91,180,212,0)" />
            </linearGradient>
          </defs>

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            rx="22"
            fill="url(#ga-chart-backdrop)"
          />

          {/* Horizontal grid lines */}
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={gl.y} x2={containerWidth - PAD.right} y2={gl.y}
                stroke="var(--border)" strokeOpacity="0.5" strokeDasharray={i === 0 ? 'none' : '4 5'} />
              <text x={PAD.left - 6} y={gl.y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)"
                fontFamily="Inter, system-ui, sans-serif">
                {gl.label}
              </text>
            </g>
          ))}

          {/* X-axis line */}
          <line x1={PAD.left} y1={PAD.top + plotH} x2={containerWidth - PAD.right} y2={PAD.top + plotH}
            stroke="var(--border)" strokeOpacity="0.5" />

          {/* Series: area fill + smooth line */}
          {chartSeries.map((item, idx) => (
            <g key={item.key}>
              <path d={item.areaPath} fill={`url(#ga-grad-${item.key}-${idx})`} />
              <path
                d={item.smoothPath}
                fill="none"
                stroke={item.color}
                strokeOpacity="0.18"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d={item.smoothPath} fill="none" stroke={item.color}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}

          {/* Hover crosshair */}
          {hoverIndex !== null && chartSeries.length > 0 && (() => {
            const hx = chartSeries[0].points[hoverIndex]?.x;
            return (
              <line x1={hx} y1={PAD.top} x2={hx} y2={PAD.top + plotH}
                stroke="var(--accent)" strokeOpacity="0.4" strokeDasharray="4 4" />
            );
          })()}

          {/* Hover dots */}
          {hoverIndex !== null && chartSeries.map(item => {
            const pt = item.points[hoverIndex];
            if (!pt) return null;
            return (
              <g key={item.key}>
                <circle cx={pt.x} cy={pt.y} r="5" fill={item.color} stroke="var(--bg-secondary)" strokeWidth="2.5" />
              </g>
            );
          })}

          {hoverIndex === null && livePoint && (
            <g>
              <circle cx={livePoint.x} cy={livePoint.y} r="13" fill="rgba(91,180,212,0.12)" className="line-chart-live-pulse" />
              <circle cx={livePoint.x} cy={livePoint.y} r="5.5" fill="var(--accent)" stroke="var(--bg-secondary)" strokeWidth="2.5" />
            </g>
          )}

          {/* X-axis labels */}
          {xLabels.map(({ label, sourceIndex }) => {
            const x = PAD.left + (data.length <= 1 ? plotW / 2 : (sourceIndex / (data.length - 1)) * plotW);
            return (
              <text key={`${label}-${sourceIndex}`} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--text-muted)"
                fontFamily="Inter, system-ui, sans-serif">
                {label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Absolute-positioned tooltip — doesn't push layout */}
      {hoverIndex !== null && (
        <div className="line-chart-tooltip" style={{
          position: 'absolute',
          top: `${tooltipPos.y + 8}px`,
          left: `${tooltipPos.x + 8}px`,
          pointerEvents: 'none',
          zIndex: 10
        }}>
          <div className="line-chart-tooltip-title">
            {data[hoverIndex]?.[xKey]}
          </div>
          {chartSeries.map(item => (
            <div key={item.key} className="line-chart-tooltip-row">
              <span className="line-chart-legend-swatch" style={{ background: item.color }} />
              <span>{item.label}</span>
              <strong>{(item.points[hoverIndex]?.value || 0).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RealtimeLineChart;
