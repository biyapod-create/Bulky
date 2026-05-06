import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Calendar, Mail, Eye, MousePointerClick, AlertCircle } from 'lucide-react';

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = { sent: '#5bb4d4', opened: '#f59e0b', clicked: '#6366f1', bounced: '#ef4444', failed: '#f97316' };

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';
const today = () => new Date().toISOString().split('T')[0];

// ─── DonutChart ───────────────────────────────────────────────────────────────
function DonutChart({ slices = [], total = 0, label = 'Total', size = 180 }) {
  const [hov, setHov] = useState(null);
  const r = size * 0.36, cx = size / 2, cy = size / 2, sw = size * 0.11;
  const arcs = useMemo(() => {
    const sum = slices.reduce((s, d) => s + (d.value || 0), 0);
    if (!sum) return [];
    let cum = 0;
    return slices.map((d) => {
      const p = d.value / sum;
      const sa = cum * 2 * Math.PI - Math.PI / 2;
      cum += p;
      const ea = cum * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
      return { ...d, p, path: `M ${x1} ${y1} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x2} ${y2}` };
    });
  }, [slices, cx, cy, r]);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={sw} />
      {arcs.map((a, i) => (
        <path key={i} d={a.path} fill="none" stroke={a.color}
          strokeWidth={hov === i ? sw + 4 : sw} strokeLinecap="round"
          style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />
      ))}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={Math.round(size * 0.16)} fontWeight="700"
        fill="var(--text-primary)" fontFamily="Inter,sans-serif">
        {hov !== null ? fmt(arcs[hov]?.value || 0) : fmt(total)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={Math.round(size * 0.083)}
        fill="var(--text-muted)" fontFamily="Inter,sans-serif">
        {hov !== null ? (arcs[hov]?.label || '') : label}
      </text>
    </svg>
  );
}

// ─── Bar chart (engagement bar chart, stacked-style) ─────────────────────────
function BarChart({ data = [], keys = [], colors = {}, height = 200 }) {
  const max = useMemo(() => Math.max(...data.map(d => keys.reduce((s, k) => s + (d[k] || 0), 0)), 1), [data, keys]);
  const BAR_W = Math.max(6, Math.min(28, Math.floor(560 / (data.length || 1)) - 2));
  const svgW = data.length * (BAR_W + 4) + 40;

  if (!data.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      No data for this period
    </div>
  );

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <svg width={Math.max(svgW, '100%')} height={height + 24} style={{ minWidth: '100%' }}>
        {data.map((d, i) => {
          let yOff = height;
          return keys.map((k) => {
            const val = d[k] || 0;
            const barH = max > 0 ? (val / max) * height : 0;
            yOff -= barH;
            return (
              <rect key={k} x={i * (BAR_W + 4) + 40} y={yOff} width={BAR_W} height={Math.max(barH, 0)}
                fill={colors[k] || '#888'} rx={2} style={{ cursor: 'pointer' }}>
                <title>{d.day}: {k} = {val}</title>
              </rect>
            );
          });
        })}
        {/* X-axis labels — every Nth label so they don't crowd */}
        {data.map((d, i) => {
          const step = Math.max(1, Math.ceil(data.length / 12));
          if (i % step !== 0) return null;
          const label = (d.day || '').replace(/^\d{4}-/, '').replace('-', '/');
          return (
            <text key={i} x={i * (BAR_W + 4) + 40 + BAR_W / 2} y={height + 18}
              textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="Inter,sans-serif">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Trend line chart (engagement trend over time) ────────────────────────────
function TrendLine({ data = [], seriesKey = 'sent', color = C.sent, height = 140 }) {
  const vals = data.map(d => Number(d[seriesKey] || 0));
  const max = Math.max(...vals, 1);
  const W = 100, H = height;
  if (vals.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      Not enough data
    </div>
  );
  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * W,
    y: H - (v / max) * H * 0.85 - H * 0.05
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  const fillD = d + ` L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#grad-${seriesKey})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Summary row (like the moz.com engagement table) ─────────────────────────
function SummaryTable({ rows = [] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Engagement type', 'Value', 'Change', 'Growth'].map(h => (
            <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Engagement type' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isPos = (row.change || 0) >= 0;
          const cc = row.change > 0 ? 'var(--success)' : row.change < 0 ? 'var(--error)' : 'var(--text-muted)';
          const gc = (row.growth || 0) >= 0 ? 'var(--success)' : 'var(--error)';
          return (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '9px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: row.color || '#888', flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{row.label}</span>
                </div>
              </td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(row.value)}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: cc, fontWeight: 600 }}>{row.change != null ? (isPos ? '+' : '') + fmt(row.change) : '--'}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: gc, fontWeight: 600 }}>{row.growth != null ? (row.growth >= 0 ? '+' : '') + row.growth.toFixed(1) + '%' : '--'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Preset date ranges ───────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time',     days: 0  },
];

function presetRange(days, installDate) {
  const to = today();
  if (!days) return { from: installDate || to, to };
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  return { from: installDate && from < installDate ? installDate : from, to };
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <BarChart3 size={52} style={{ opacity: 0.18, marginBottom: 18 }} />
      <h3 style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-secondary)', marginBottom: 8 }}>No data yet</h3>
      <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
        Charts will populate as your campaigns run and recipients open, click, and engage with your emails.
        Start by creating and sending your first campaign.
      </p>
    </div>
  );
}

// ─── Main EngagementDashboard page ───────────────────────────────────────────
export default function EngagementDashboard({ isActive }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [installDate, setInstall] = useState('');
  const [preset, setPreset]       = useState(1); // default: Last 30 days
  const [customFrom, setFrom]     = useState('');
  const [customTo, setTo]         = useState(today());
  const [useCustom, setCustom]    = useState(false);

  // Determine effective date range
  const range = useMemo(() => {
    if (useCustom) return { from: customFrom || installDate, to: customTo || today() };
    return presetRange(PRESETS[preset]?.days, installDate);
  }, [useCustom, customFrom, customTo, preset, installDate]);

  const load = useCallback(async () => {
    if (!window.electron) return;
    setLoading(true); setError('');
    try {
      // Fetch install date first if we don't have it
      let iDate = installDate;
      if (!iDate) {
        try { iDate = await window.electron.stats.getInstallDate(); setInstall(iDate); } catch {}
      }
      const result = await window.electron.stats.getEngagementAnalytics({ dateFrom: range.from, dateTo: range.to });
      if (result && result.error) { setError(result.error); }
      else { setData(result || null); }
    } catch (e) { setError(e.message || 'Failed to load engagement data'); }
    finally { setLoading(false); }
  }, [range, installDate]);

  useEffect(() => { if (isActive) load(); }, [isActive, load]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const { totals = {}, donut = [], summary = [], daily = [], openRate = 0, clickRate = 0, bounceRate = 0, hasData = false } = data || {};
  const totalEngagement = (totals.opened || 0) + (totals.clicked || 0);
  const barColors = { sent: C.sent, opened: C.opened, clicked: C.clicked, bounced: C.bounced };

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={22} style={{ color: 'var(--accent)' }} />
            Engagement Dashboard
          </h1>
          <p className="subtitle">Track email performance across all campaigns over time</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading} style={{ alignSelf: 'flex-start' }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
        </button>
      </div>

      {/* ── Date range controls ── */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Calendar size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        {PRESETS.map((p, i) => (
          <button key={p.label}
            className={`btn btn-sm ${!useCustom && preset === i ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => { setPreset(i); setCustom(false); }}>
            {p.label}
          </button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <input type="date" value={customFrom || range.from} min={installDate}
            max={customTo || today()}
            onChange={e => { setFrom(e.target.value); setCustom(true); }}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
          <input type="date" value={customTo} min={customFrom || installDate} max={today()}
            onChange={e => { setTo(e.target.value); setCustom(true); }}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }} />
        </div>
        {installDate && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Tracking since {installDate}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.06)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} style={{ color: 'var(--error)', flexShrink: 0 }} />
          <span style={{ color: 'var(--error)', fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* ── Top stat cards ── */}
      {!loading && (
        <div className="stats-grid stats-grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: `${C.sent}18`, color: C.sent }}><Mail size={20} /></div>
            <div className="stat-content">
              <div className="stat-label">Total Sent</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.sent)}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: `${C.opened}18`, color: C.opened }}><Eye size={20} /></div>
            <div className="stat-content">
              <div className="stat-label">Opens</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.opened)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pct(totals.opened, totals.sent)} open rate</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: `${C.clicked}18`, color: C.clicked }}><MousePointerClick size={20} /></div>
            <div className="stat-content">
              <div className="stat-label">Clicks</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.clicked)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pct(totals.clicked, totals.sent)} click rate</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: `${C.bounced}18`, color: C.bounced }}><AlertCircle size={20} /></div>
            <div className="stat-content">
              <div className="stat-label">Bounces</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.bounced)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pct(totals.bounced, totals.sent)} bounce rate</div>
            </div>
          </div>
        </div>
      )}

      {/* ── No data guard ── */}
      {!loading && !hasData && <EmptyState />}

      {/* ── Engagement summary (donut + table) ── */}
      {!loading && hasData && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Engagement summary</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{range.from} → {range.to}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <DonutChart slices={donut} total={totalEngagement} label="Total engagement" size={170} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <SummaryTable rows={summary} />
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              {Object.entries(barColors).map(([k, col]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: col, display: 'inline-block' }} />
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </span>
              ))}
            </div>
            <BarChart data={daily} keys={['sent', 'opened', 'clicked', 'bounced']} colors={barColors} height={160} />
          </div>
        </div>
      )}

      {/* ── Trend lines (engagement over time, like the competitor comparison chart) ── */}
      {!loading && hasData && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} /> Engagement trend
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {[
              { key: 'sent',    label: 'Sent',    color: C.sent    },
              { key: 'opened',  label: 'Opens',   color: C.opened  },
              { key: 'clicked', label: 'Clicks',  color: C.clicked },
              { key: 'bounced', label: 'Bounces', color: C.bounced },
            ].map(({ key, label, color }) => (
              <div key={key} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <TrendLine data={daily} seriesKey={key} color={color} height={80} />
              </div>
            ))}
          </div>
          {/* X-axis date range labels */}
          {daily.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingLeft: 12, paddingRight: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(daily[0]?.day || '').replace(/^\d{4}-/, '').replace('-', '/')}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(daily[daily.length - 1]?.day || '').replace(/^\d{4}-/, '').replace('-', '/')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Rate summary pills ── */}
      {!loading && hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 4 }}>
          {[
            { label: 'Open Rate',   value: openRate + '%',   color: C.opened,  icon: <TrendingUp size={15} /> },
            { label: 'Click Rate',  value: clickRate + '%',  color: C.clicked, icon: <MousePointerClick size={15} /> },
            { label: 'Bounce Rate', value: bounceRate + '%', color: C.bounced, icon: <TrendingDown size={15} /> },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color }}>{icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
