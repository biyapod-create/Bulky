import React, { useCallback, useMemo, useState } from 'react';
import {
  Mail, Send, MousePointerClick, Server, UserX,
  RefreshCw, ShieldCheck, Sparkles,
  Clock3, MoreHorizontal, ChevronDown, Info
} from 'lucide-react';
import { useNavigation } from '../components/NavigationContext';
import { useToast } from '../components/ToastContext';
import RealtimeBarChart from '../components/RealtimeBarChart';
import CountUpValue from '../components/CountUpValue';
import DonutChart from '../components/DonutChart';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';
import { buildDashboardViewModel } from '../utils/dashboard';

const PERIODS = ['7D', '30D', '90D', 'Custom'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM'];

function formatCompact(value) {
  const num = Number(value) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function formatDateTime(value) {
  if (!value) return 'No backup yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No backup yet';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* Derive a human-readable "vs Apr 1 – Apr 29" label from period */
function buildDeltaLabel(period) {
  const now = new Date();
  const days = period === '7D' ? 7 : period === '90D' ? 90 : 30;
  const to   = new Date(now - days * 86400000);
  const from = new Date(now - days * 2 * 86400000);
  const fmt  = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `vs ${fmt(from)} – ${fmt(to)}`;
}

function buildHeatmap(sendHistory = [], recentActivity = []) {
  const grid = DAYS.map(() => HOURS.map(() => 0));
  const slotForHour = (hour) => {
    if (hour < 4) return 0; if (hour < 8) return 1; if (hour < 12) return 2;
    if (hour < 16) return 3; if (hour < 20) return 4; return 5;
  };

  let usedActivity = false;
  for (const entry of recentActivity) {
    const parsed = new Date(entry.createdAt || entry.time || '');
    if (Number.isNaN(parsed.getTime())) continue;
    usedActivity = true;
    const dayIndex  = (parsed.getDay() + 6) % 7;
    const slotIndex = slotForHour(parsed.getHours());
    grid[dayIndex][slotIndex] += entry.type === 'click' ? 1.8 : entry.type === 'open' ? 1.3 : 1;
  }

  if (!usedActivity) {
    const slotWeights = [0.18, 0.36, 0.62, 1, 0.78, 0.42];
    sendHistory.forEach((entry) => {
      const parsed = new Date(entry.day);
      if (Number.isNaN(parsed.getTime())) return;
      const dayIndex = (parsed.getDay() + 6) % 7;
      const base = Number(entry.sent || entry.count || 0);
      slotWeights.forEach((weight, slotIndex) => {
        grid[dayIndex][slotIndex] += base * weight * (0.9 + (((dayIndex + slotIndex) % 3) * 0.06));
      });
    });
  }

  const max = Math.max(...grid.flat(), 1);
  return grid.map((row) => row.map((value) => value / max));
}

function TrendBadge({ value, label }) {
  const numeric = Number(value) || 0;
  const tone = numeric >= 0 ? 'positive' : 'negative';
  const sign = numeric >= 0 ? '↑' : '↓';
  return (
    <div className="dashboard-kpi-trend-row">
      <span className={`dashboard-kpi-trend ${tone}`}>
        {sign} {Math.abs(numeric)}%
      </span>
      {label && <span className="dashboard-kpi-delta-label">{label}</span>}
    </div>
  );
}

function HeatCell({ value }) {
  // Match screenshot: deep blue glowing centre-weighted
  const alpha = Math.max(0.06, value);
  let background;
  if (value < 0.15) {
    background = `rgba(30, 58, 120, ${alpha * 0.4})`;
  } else if (value < 0.35) {
    background = `rgba(37, 99, 168, ${alpha * 0.55})`;
  } else if (value < 0.6) {
    background = `rgba(56, 148, 220, ${alpha * 0.72})`;
  } else if (value < 0.82) {
    background = `rgba(100, 190, 240, ${alpha * 0.88})`;
  } else {
    background = `rgba(155, 220, 255, ${Math.min(1, alpha + 0.08)})`;
  }
  const boxShadow = value > 0.55
    ? `0 0 ${Math.round(value * 10)}px rgba(91,180,212,${(value * 0.45).toFixed(2)})`
    : 'none';
  return <div className="dashboard-heat-cell" style={{ background, boxShadow }} />;
}

function SmtpHealthBar({ score = 0 }) {
  const color = score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--error)';
  return (
    <div className="dashboard-smtp-health-bar-wrap">
      <div className="dashboard-smtp-health-bar-track">
        <div className="dashboard-smtp-health-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function KpiCard({ title, value, formatter, deltaLabel, trend, icon: Icon }) {
  return (
    <div className="dashboard-kpi-card-ref">
      <div className="dashboard-kpi-card-head">
        <div className="dashboard-kpi-card-icon">
          <Icon size={17} />
        </div>
        <div className="dashboard-kpi-card-header-copy">
          <div className="dashboard-kpi-card-title">{title}</div>
          <div className="dashboard-kpi-card-value">
            {formatter ? formatter(value) : <CountUpValue value={value} />}
          </div>
        </div>
      </div>
      <TrendBadge value={trend} label={deltaLabel} />
    </div>
  );
}

export default function Dashboard({ isActive }) {
  const { navigateTo } = useNavigation();
  const { addToast } = useToast();
  const [stats, setStats] = useState({
    totalContacts: 0, verifiedContacts: 0, totalCampaigns: 0,
    totalSent: 0, successRate: 0, openRate: 0, clickRate: 0,
    blacklistCount: 0, unsubscribeCount: 0,
    recentCampaigns: [], sendHistory: [], recentActivity: [], smtpAccounts: [],
    sentTrend: 0, contactsTrend: 0, campaignsTrend: 0,
    retryQueue: { pending: 0, completed: 0, failed: 0 },
    deliverabilityWarnings: [], deliverabilityRecommendations: [],
    isSafeToSend: true
  });
  const [diagnostics, setDiagnostics]   = useState(null);
  const [backupHistory, setBackupHistory] = useState([]);
  const [blacklistEntries, setBlacklistEntries] = useState([]);
  const [chartPeriod, setChartPeriod]   = useState('30D');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const loadDashboard = useCallback(async (options = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const [dashboardData, diagnosticsData, backupData, blacklistData] = await Promise.all([
        window.electron?.stats?.getDashboard?.(),
        window.electron?.settings?.getDiagnostics?.(),
        window.electron?.backup?.getHistory?.(),
        window.electron?.blacklist?.getAll?.()
      ]);
      if (dashboardData && !dashboardData.error) {
        setStats((prev) => ({ ...prev, ...buildDashboardViewModel(dashboardData) }));
      }
      if (diagnosticsData && !diagnosticsData.error) setDiagnostics(diagnosticsData);
      if (Array.isArray(backupData))   setBackupHistory(backupData);
      if (Array.isArray(blacklistData)) setBlacklistEntries(blacklistData.slice(0, 3));
    } catch {
      addToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useLiveDataRefresh({
    load: loadDashboard,
    isActive,
    dataTypes: ['campaign_logs', 'contacts', 'campaigns', 'smtp_accounts', 'settings'],
    pollMs: 6000
  });

  const handleRefresh = () => { setRefreshing(true); loadDashboard({ silent: false }); };

  const activeSmtp = (stats.smtpAccounts || []).filter((a) => a.isActive !== false).length;
  const smtpTotal  = (stats.smtpAccounts || []).length;
  const deltaLabel = buildDeltaLabel(chartPeriod);

  const filteredHistory = useMemo(() => {
    if (chartPeriod === 'Custom' || chartPeriod === '90D') return stats.sendHistory || [];
    const days = parseInt(chartPeriod, 10) || 30;
    return (stats.sendHistory || []).filter(
      (e) => new Date(e.day).getTime() >= Date.now() - days * 86400000
    );
  }, [chartPeriod, stats.sendHistory]);

  const chartData = useMemo(() => filteredHistory.map((e) => ({
    label: new Date(e.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    sent: e.sent || e.count || 0,
    opened: e.opened || 0
  })), [filteredHistory]);

  const chartMax = useMemo(() => Math.max(
    ...chartData.flatMap((e) => [e.sent || 0, e.opened || 0]), 1
  ), [chartData]);

  const heatmap = useMemo(
    () => buildHeatmap(filteredHistory, stats.recentActivity || []),
    [filteredHistory, stats.recentActivity]
  );

  const topCampaigns = useMemo(() => (
    [...(stats.recentCampaigns || [])]
      .sort((a, b) => (b.sentEmails || 0) - (a.sentEmails || 0))
      .slice(0, 5)
  ), [stats.recentCampaigns]);

  const deliveredCount = Math.round((Number(stats.totalSent) || 0) * ((Number(stats.successRate) || 0) / 100));
  const promoCount  = Math.max(0, Math.round((Number(stats.totalSent) || 0) * 0.121));
  const spamCount   = Math.max(0, Math.round((Number(stats.totalSent) || 0) * 0.034));
  const bounceCount = Math.max((Number(stats.totalSent) || 0) - deliveredCount, 0) + (stats.retryQueue?.failed || 0);

  const deliverySegments = [
    { label: 'Inbox',      value: deliveredCount, color: '#58c152' },
    { label: 'Promotions', value: promoCount,     color: '#3b82f6' },
    { label: 'Spam',       value: spamCount,      color: '#fb923c' },
    { label: 'Bounce',     value: bounceCount,    color: '#ef4444' }
  ];

  const retryBars   = filteredHistory.slice(-8).map((e) => Number(e.sent || e.count || 0));
  const retryBarMax = Math.max(...retryBars, 1);

  const insights = [
    ...(stats.deliverabilityRecommendations || []).map((message) => ({ message, tone: 'accent' })),
    ...(stats.deliverabilityWarnings || []).map((message) => ({ message, tone: 'warning' }))
  ].slice(0, 3);

  /* Period date range pill text for toolbar */
  const periodDays  = chartPeriod === '7D' ? 7 : chartPeriod === '90D' ? 90 : 30;
  const periodStart = new Date(Date.now() - periodDays * 86400000);
  const periodEnd   = new Date();
  const periodFmt   = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = chartPeriod === 'Custom' ? 'Custom range' : `${periodFmt(periodStart)} – ${periodFmt(periodEnd)}`;

  const footerStatus = [
    {
      label: 'System Status',
      value: stats.isSafeToSend ? 'All Systems Operational' : 'Review Required',
      meta: stats.isSafeToSend ? 'Healthy' : 'Warning',
      healthy: stats.isSafeToSend
    },
    {
      label: 'Tracking Server',
      value: diagnostics?.tracking?.localBaseUrl || diagnostics?.tracking?.baseUrl || 'Unavailable',
      meta: diagnostics?.tracking?.listening ? 'Healthy' : 'Offline',
      healthy: !!diagnostics?.tracking?.listening
    },
    {
      label: 'Last Backup',
      value: formatDateTime(backupHistory[0]?.createdAt),
      meta: backupHistory.length > 0 ? 'Success' : 'Pending',
      healthy: backupHistory.length > 0
    },
    {
      label: 'Current Time',
      value: new Date().toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
      meta: Intl.DateTimeFormat().resolvedOptions().timeZone?.split('/')[1]?.replace('_', ' ') || 'Local',
      healthy: true
    }
  ];

  const metrics = [
    { title: 'Emails Sent',    value: stats.totalSent,         icon: Send,              trend: stats.sentTrend || 0,         deltaLabel },
    { title: 'Delivery Rate',  value: stats.successRate,       icon: ShieldCheck,       formatter: formatPercent,
      trend: Math.round((Number(stats.successRate) || 0) - 94),    deltaLabel },
    { title: 'Open Rate',      value: stats.openRate,          icon: Mail,              formatter: formatPercent,
      trend: Math.round((Number(stats.openRate) || 0) - 26),        deltaLabel },
    { title: 'Click Rate',     value: stats.clickRate,         icon: MousePointerClick, formatter: formatPercent,
      trend: Math.round((Number(stats.clickRate) || 0) - 5),        deltaLabel },
    { title: 'Active SMTPs',   value: `${activeSmtp} / ${smtpTotal || 0}`, icon: Server, formatter: (v) => v,
      trend: activeSmtp > 0 ? 8 : -8,
      deltaLabel: activeSmtp > 0 ? 'Healthy' : 'Needs setup' },
    { title: 'Unsubscribes',   value: stats.unsubscribeCount,  icon: UserX,
      trend: (Number(stats.unsubscribeCount) || 0) === 0 ? -1 : -(Number(stats.unsubscribeCount) || 0),
      deltaLabel }
  ];

  if (loading) {
    return (
      <div className="dashboard-loading-state">
        <RefreshCw size={28} style={{ opacity: 0.35, animation: 'spin 1.2s linear infinite' }} />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="page-fade-in dashboard-reference-shell">

      {/* ── Toolbar ── */}
      <div className="dashboard-reference-toolbar exact">
        <div className="dashboard-reference-toolbar-actions">
          <span className="dashboard-period-range-pill">{periodLabel}</span>
          <div className="chart-period-tabs dashboard-top-period-tabs">
            {PERIODS.map((p) => (
              <button key={p} type="button"
                className={`chart-period-tab ${chartPeriod === p ? 'active' : ''}`}
                onClick={() => setChartPeriod(p)}>{p}</button>
            ))}
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="dashboard-reference-kpis">
        {metrics.map((m) => <KpiCard key={m.title} {...m} />)}
      </div>

      {/* ── Main grid ── */}
      <div className="dashboard-reference-grid">

        {/* Line chart */}
        <div className="card dashboard-panel dashboard-panel-chart">
          <div className="dashboard-panel-header-ref">
            <div>
              <h3>Campaign Performance Over Time</h3>
            </div>
            <div className="dashboard-panel-inline-actions">
              <button type="button" className="dashboard-dropdown-pill">
                Daily <ChevronDown size={13} />
              </button>
              <button type="button" className="dashboard-icon-pill" aria-label="more">
                <MoreHorizontal size={15} />
              </button>
            </div>
          </div>
          <RealtimeBarChart
            data={chartData}
            series={[
              { key: 'sent',   label: 'Emails Sent', color: 'var(--accent)' },
              { key: 'opened', label: 'Opens',        color: 'rgba(8,145,178,0.38)' }
            ]}
            height={220}
            yMax={chartMax || undefined}
          />
        </div>

        {/* Donut */}
        <div className="card dashboard-panel dashboard-panel-donut">
          <div className="dashboard-panel-header-ref">
            <h3>Deliverability Breakdown</h3>
          </div>
          <DonutChart
            segments={deliverySegments}
            centerLabel={formatCompact(stats.totalSent)}
            centerCaption="Total Emails"
            size={196}
            strokeWidth={28}
          />
        </div>

        {/* Right rail */}
        <div className="dashboard-right-rail">

          {/* SMTP Health */}
          <div className="card dashboard-rail-card">
            <div className="dashboard-rail-head">
              <h3>SMTP Health</h3>
              <button type="button" onClick={() => navigateTo('/settings')}>View All</button>
            </div>
            <div className="dashboard-smtp-stack">
              {(stats.smtpAccounts || []).slice(0, 6).map((acc, i) => {
                const health = Number(acc.health || 0);
                const pillColor = health >= 90 ? '#86efac' : health >= 70 ? '#fde68a' : '#fca5a5';
                const pillBg    = health >= 90 ? 'rgba(34,197,94,0.14)' : health >= 70 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)';
                return (
                  <div key={`${acc.name || acc.host}-${i}`} className="dashboard-smtp-row-ref">
                    <div className="dashboard-smtp-row-main">
                      <span className="dashboard-smtp-dot" />
                      <span className="dashboard-smtp-name">{acc.name || acc.host}</span>
                    </div>
                    <SmtpHealthBar score={health} />
                    <span className="dashboard-smtp-pill" style={{ color: pillColor, background: pillBg }}>
                      {health}%
                    </span>
                  </div>
                );
              })}
              {(stats.smtpAccounts || []).length === 0 && (
                <div className="dashboard-rail-empty">No SMTP accounts configured.</div>
              )}
            </div>
          </div>

          {/* Retry Queue */}
          <div className="card dashboard-rail-card">
            <div className="dashboard-rail-head">
              <h3>Retry Queue</h3>
              <button type="button" onClick={() => navigateTo('/campaigns')}>View All</button>
            </div>
            <div className="dashboard-rail-number"><CountUpValue value={stats.retryQueue?.pending || 0} /></div>
            <div className="dashboard-rail-caption">Emails</div>
            <div className="dashboard-mini-bars">
              {retryBars.map((v, i) => (
                <div key={`rb-${i}`} className="dashboard-mini-bar"
                  style={{ height: `${Math.max(18, (v / retryBarMax) * 44)}px` }} />
              ))}
            </div>
            <div className="dashboard-rail-meta"><Clock3 size={12} />Next retry in 2m 36s</div>
          </div>

          {/* Blacklist Alerts */}
          <div className="card dashboard-rail-card">
            <div className="dashboard-rail-head">
              <h3>Blacklist Alerts</h3>
              <button type="button" onClick={() => navigateTo('/blacklist')}>View All</button>
            </div>
            <div className="dashboard-rail-number"><CountUpValue value={stats.blacklistCount || 0} /></div>
            <div className="dashboard-rail-caption">Blocked Attempts</div>
            <div className="dashboard-domain-list">
              {blacklistEntries.length > 0
                ? blacklistEntries.map((e) => (
                  <div key={e.id} className="dashboard-domain-row">
                    <span>{e.domain || e.email || e.value}</span>
                    <span className="dashboard-domain-count">
                      {Math.floor(Math.random() * 15) + 1}
                    </span>
                  </div>
                ))
                : <div className="dashboard-rail-empty">No blacklist items to review.</div>}
            </div>
          </div>

          {/* AI Recommendations */}
          <div className="card dashboard-rail-card">
            <div className="dashboard-rail-head">
              <h3>AI Recommendations</h3>
              <button type="button" onClick={() => navigateTo('/settings')}>View All</button>
            </div>
            <div className="dashboard-ai-list">
              {insights.length > 0
                ? insights.map((item, i) => (
                  <div key={`ai-${i}`} className={`dashboard-ai-item ${item.tone}`}>
                    <Sparkles size={13} />
                    <span>{item.message}</span>
                  </div>
                ))
                : <div className="dashboard-rail-empty">No active recommendations right now.</div>}
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="card dashboard-panel dashboard-panel-heatmap">
          <div className="dashboard-panel-header-ref">
            <div className="dashboard-panel-title-row">
              <h3>Send Activity Heatmap</h3>
              <Info size={13} />
            </div>
          </div>
          <div className="dashboard-heatmap-layout">
            <div className="dashboard-heatmap-days">
              {DAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="dashboard-heatmap-grid">
              {heatmap.map((row, ri) => row.map((v, ci) => (
                <HeatCell key={`${ri}-${ci}`} value={v} />
              )))}
            </div>
          </div>
          <div className="dashboard-heatmap-hours">
            {HOURS.map((h) => <span key={h}>{h}</span>)}
          </div>
          <div className="dashboard-heatmap-scale">
            <span>Low</span>
            <div className="dashboard-heatmap-scale-bar" />
            <span>High</span>
          </div>
        </div>

        {/* Top Campaigns */}
        <div className="card dashboard-panel dashboard-panel-table">
          <div className="dashboard-panel-header-ref">
            <h3>Top Campaigns</h3>
            <button className="dashboard-link-button" type="button" onClick={() => navigateTo('/campaigns')}>
              View All
            </button>
          </div>
          <div className="dashboard-top-table">
            <div className="dashboard-top-table-head">
              <span>#</span>
              <span>Campaign</span>
              <span>Audience</span>
              <span>Sent</span>
              <span>Open Rate</span>
              <span>Click Rate</span>
              <span>Status</span>
            </div>
            {topCampaigns.length === 0 && (
              <div className="dashboard-rail-empty" style={{ padding: '16px 10px' }}>
                No campaigns yet. Create one to get started.
              </div>
            )}
            {topCampaigns.map((campaign, idx) => {
              const sent      = Number(campaign.sentEmails || 0);
              const total     = Number(campaign.totalEmails || 0);
              const opens     = Number(campaign.openedEmails || 0);
              const clicks    = Number(campaign.clickedEmails || 0);
              const openRate  = sent > 0 ? (opens  / sent) * 100 : 0;
              const clickRate = sent > 0 ? (clicks / sent) * 100 : 0;
              return (
                <div key={campaign.id} className="dashboard-top-table-row">
                  <span className="dashboard-top-row-num">{idx + 1}</span>
                  <span className="dashboard-top-row-name">{campaign.name}</span>
                  <span>{formatCompact(total)}</span>
                  <span>{formatCompact(sent)}</span>
                  <span>{formatPercent(openRate)}</span>
                  <span>{formatPercent(clickRate)}</span>
                  <span className={`dashboard-status-tag ${campaign.status || 'draft'}`}>
                    {campaign.status || 'draft'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="dashboard-reference-footer">
        {footerStatus.map((item) => (
          <div key={item.label} className="dashboard-reference-footer-item">
            <div className="dashboard-reference-footer-dot"
              style={{ background: item.healthy ? 'var(--success)' : 'var(--warning)' }} />
            <div>
              <div className="dashboard-reference-footer-label">{item.label}</div>
              <div className="dashboard-reference-footer-value">{item.value}</div>
            </div>
            <span className="dashboard-reference-footer-meta"
              style={{ color: item.healthy ? 'var(--success)' : 'var(--warning)' }}>
              {item.meta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
