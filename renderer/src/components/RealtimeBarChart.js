import React, { useState, useMemo, useRef, useEffect } from 'react';

/**
 * RealtimeBarChart — grouped bar chart, drop-in replacement for RealtimeLineChart
 *
 * Props:
 *   data    — [{ label, [key]: number, ... }]
 *   series  — [{ key, label, color }]
 *   height  — number (px)
 *   yMax    — optional explicit y max
 */
function RealtimeBarChart({ data = [], series = [], height = 220, yMax }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, items[], label }
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const svgRef = useRef(null);
  const PAD = { top: 18, right: 12, bottom: 32, left: 44 };

  const safeData = data.slice(-40); // cap at 40 bars so they never get crushed
  const n = safeData.length;
  const seriesCount = series.length;

  const dataMax = useMemo(() => {
    return Math.max(
      ...safeData.flatMap(d => series.map(s => Number(d[s.key] || 0))),
      1
    );
  }, [safeData, series]);

  const effectiveMax = yMax || dataMax;

  // y-axis tick values — 4 ticks
  const yTicks = useMemo(() => {
    const step = effectiveMax / 4;
    return [0, 1, 2, 3, 4].map(i => Math.round(step * i));
  }, [effectiveMax]);

  const formatY = (v) => {
    if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
    if (v >= 1000)    return `${(v/1000).toFixed(0)}K`;
    return String(v);
  };

  // Animation: bars grow from 0
  const [animPct, setAnimPct] = useState(0);
  const animRef = useRef(null);
  const prevDataLen = useRef(0);

  useEffect(() => {
    if (n !== prevDataLen.current) {
      prevDataLen.current = n;
      setAnimPct(0);
      let start = null;
      const dur = 420;
      const tick = (ts) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        // ease-out cubic
        setAnimPct(1 - Math.pow(1 - p, 3));
        if (p < 1) animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animRef.current);
    }
  }, [n]);

  if (!n || !seriesCount) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        No data for this period
      </div>
    );
  }

  // SVG dimensions are 100% width — use viewBox to scale
  const VW = 600;
  const VH = height;
  const plotW = VW - PAD.left - PAD.right;
  const plotH = VH - PAD.top - PAD.bottom;

  const groupW = plotW / n;
  const barGap = Math.max(1, groupW * 0.08);
  const totalBarW = groupW - barGap * 2;
  const barW = Math.max(2, totalBarW / seriesCount - 1);
  const barRadius = Math.min(3, barW / 2);

  const xOf = (i, si) => PAD.left + i * groupW + barGap + si * (barW + 1);
  const yOf = (v) => PAD.top + plotH - (Math.min(v, effectiveMax) / effectiveMax) * plotH;

  const handleMouseMove = (e, i) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = VW / rect.width;
    const scaleY = VH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    setHoveredIdx(i);
    setTooltip({
      x: Math.min(mx, VW - 140),
      y: Math.max(my - 10, PAD.top),
      label: safeData[i]?.label || '',
      items: series.map(s => ({ label: s.label, color: s.color, value: Number(safeData[i]?.[s.key] || 0) }))
    });
  };

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        {series.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            {s.label}
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height={height}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => { setTooltip(null); setHoveredIdx(null); }}
      >
        {/* Y grid lines + labels */}
        {yTicks.map((tick, i) => {
          const y = yOf(tick);
          return (
            <g key={`ytick-${i}`}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth="0.8" strokeDasharray={tick === 0 ? 'none' : '3 4'} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                fontSize={9} fill="var(--text-muted)" fontFamily="Inter,sans-serif">
                {formatY(tick)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {safeData.map((row, i) => (
          <g key={`group-${i}`}>
            {/* Hover hit zone */}
            <rect
              x={PAD.left + i * groupW} y={PAD.top}
              width={groupW} height={plotH}
              fill={hoveredIdx === i ? 'rgba(255,255,255,0.03)' : 'transparent'}
              onMouseMove={(e) => handleMouseMove(e, i)}
              style={{ cursor: 'crosshair' }}
            />
            {series.map((s, si) => {
              const val = Number(row[s.key] || 0);
              const fullH = (val / effectiveMax) * plotH;
              const barH = Math.max(2, fullH * animPct);
              const x = xOf(i, si);
              const y = PAD.top + plotH - barH;
              return (
                <rect
                  key={s.key}
                  x={x} y={y}
                  width={barW} height={barH}
                  rx={barRadius} ry={barRadius}
                  fill={s.color}
                  opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1}
                  style={{ transition: 'opacity 0.15s' }}
                />
              );
            })}
          </g>
        ))}

        {/* X axis labels — every Nth */}
        {safeData.map((row, i) => {
          const step = Math.max(1, Math.ceil(n / 10));
          if (i % step !== 0) return null;
          const cx = PAD.left + i * groupW + groupW / 2;
          return (
            <text key={`xlabel-${i}`}
              x={cx} y={VH - PAD.bottom + 14}
              textAnchor="middle" fontSize={9}
              fill="var(--text-muted)" fontFamily="Inter,sans-serif">
              {row.label}
            </text>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect x={tooltip.x} y={tooltip.y}
              width={130} height={14 + tooltip.items.length * 18}
              rx={6} ry={6}
              fill="var(--bg-secondary)" stroke="var(--border-strong)" strokeWidth={1} />
            <text x={tooltip.x + 8} y={tooltip.y + 12}
              fontSize={10} fontWeight="600" fill="var(--text-secondary)" fontFamily="Inter,sans-serif">
              {tooltip.label}
            </text>
            {tooltip.items.map((item, ii) => (
              <g key={ii}>
                <rect x={tooltip.x + 8} y={tooltip.y + 19 + ii * 18}
                  width={8} height={8} rx={2} fill={item.color} />
                <text x={tooltip.x + 20} y={tooltip.y + 27 + ii * 18}
                  fontSize={10} fill="var(--text-primary)" fontFamily="Inter,sans-serif">
                  {item.label}: <tspan fontWeight="700">{item.value.toLocaleString()}</tspan>
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

export default RealtimeBarChart;
