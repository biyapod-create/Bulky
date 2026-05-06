import React, { useState } from 'react';

function describeArc(cx, cy, radius, start, sweep) {
  const toRad = (deg) => (deg - 90) * (Math.PI / 180);
  const safeSweep = sweep >= 360 ? 359.99 : sweep;
  const startX = cx + radius * Math.cos(toRad(start));
  const startY = cy + radius * Math.sin(toRad(start));
  const endX   = cx + radius * Math.cos(toRad(start + safeSweep));
  const endY   = cy + radius * Math.sin(toRad(start + safeSweep));
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${safeSweep > 180 ? 1 : 0} 1 ${endX} ${endY}`;
}

function DonutChart({
  segments = [],
  centerLabel = '0',
  centerCaption = 'Total Emails',
  size = 200,
  strokeWidth = 26
}) {
  const [hovered, setHovered] = useState(null);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2 - 4;
  const total = segments.reduce((s, seg) => s + (Number(seg.value) || 0), 0) || 1;

  let startAngle = 0;
  const arcs = segments.map((seg, i) => {
    const value = Number(seg.value) || 0;
    const sweep = (value / total) * 360;
    const arc = {
      ...seg,
      index: i,
      sweep,
      startAngle,
      percent: ((value / total) * 100).toFixed(1)
    };
    startAngle += sweep;
    return arc;
  });

  const displayLabel = hovered !== null ? segments[hovered]?.value?.toLocaleString() ?? centerLabel : centerLabel;
  const displayCaption = hovered !== null ? segments[hovered]?.label ?? centerCaption : centerCaption;

  return (
    <div className="donut-chart-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ flexShrink: 0, overflow: 'visible' }}
      >
        {/* Track ring */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="var(--bg-tertiary)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {arcs.map((arc) => {
          if (arc.sweep <= 0) return null;
          const isHov = hovered === arc.index;
          const sw = isHov ? strokeWidth + 5 : strokeWidth;
          return (
            <path
              key={arc.label}
              d={describeArc(cx, cy, radius, arc.startAngle, arc.sweep)}
              fill="none"
              stroke={arc.color}
              strokeWidth={sw}
              strokeLinecap="butt"
              style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease' }}
              onMouseEnter={() => setHovered(arc.index)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {/* Center text */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          fontSize={Math.round(size * 0.115)}
          fontWeight="800"
          fill="var(--text-primary)"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.03em"
        >
          {displayLabel}
        </text>
        <text
          x={cx} y={cy + 10}
          textAnchor="middle"
          fontSize={Math.round(size * 0.062)}
          fill="var(--text-muted)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {displayCaption}
        </text>
      </svg>

      {/* Legend — vertical, right-aligned */}
      <div className="donut-legend">
        {segments.map((seg) => (
          <div key={seg.label} className="donut-legend-item">
            <span className="donut-legend-swatch" style={{ background: seg.color }} />
            <span className="donut-legend-label">{seg.label}</span>
            <div className="donut-legend-right">
              <span className="donut-legend-pct">
                {total > 0 ? ((Number(seg.value) || 0) / total * 100).toFixed(1) : '0.0'}%
              </span>
              <span className="donut-legend-value">({(Number(seg.value) || 0).toLocaleString()})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DonutChart;
