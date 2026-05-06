import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CheckCircle, ExternalLink, MousePointerClick, RefreshCw, TrendingDown,
  TrendingUp, Users, XCircle, Activity, Eye, Send, AlertCircle, UserX, Download, Filter
} from 'lucide-react';
import RealtimeLineChart from '../components/RealtimeLineChart';
import DonutChart from '../components/DonutChart';
import CountUpValue from '../components/CountUpValue';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';

function fmtPct(numerator, denominator) {
  if (!denominator || denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function fmtNum(value) {
  if (value === null || value === undefined) return '0';
  return Number(value).toLocaleString();
}

const PERIODS = ['7D', '30D', '90D', 'Custom'];

export default function Analytics({ campaignId, isActive }) {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [chartPeriod, setChartPeriod] = useState('30D');

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    try {
      const [analyticsData, trackingData] = await Promise.all([
        window.electron.campaigns.getAnalytics(campaignId),
        window.electron.tracking.getEvents(campaignId).catch(() => [])
      ]);
      if (analyticsData?.error) {
        setError(analyticsData.error);
      } else {
        setAnalytics(analyticsData || {});
        setEvents(Array.isArray(trackingData) ? trackingData : []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (isActive && campaignId) load();
  }, [isActive, campaignId, load]);

  useLiveDataRefresh({
    load,
    isActive: isActive && !!campaignId,
    dataTypes: ['campaign_logs', 'campaigns', 'tracking'],
    pollMs: 6000
  });

  const stats = useMemo(() => {
    if (!analytics) return null;
    const sent = Number(analytics.sent ?? analytics.totalSent ?? 0);
    const delivered = Number(analytics.delivered ?? sent ?? 0);
    const opens = Number(analytics.opens ?? analytics.totalOpens ?? 0);
    const clicks = Number(analytics.clicks ?? analytics.totalClicks ?? 0);
    const bounces = Number(analytics.bounces ?? analytics.totalBounced ?? 0);
    const unsubs = Number(analytics.unsubscribes ?? analytics.totalUnsubscribes ?? 0);
    const complaints = Number(analytics.complaints ?? 0);
    return { sent, delivered, opens, clicks, bounces, unsubs, complaints };
  }, [analytics]);

  const filteredEvents = useMemo(() => {
    if (chartPeriod === 'Custom') return events;
    const days = Number.parseInt(chartPeriod, 10);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return events.filter((event) => {
      const date = new Date(event.timestamp || event.createdAt || Date.now());
      return !Number.isNaN(date.getTime()) && date.getTime() >= cutoff;
    });
  }, [events, chartPeriod]);

  const chartData = useMemo(() => {
    const buckets = {};
    filteredEvents.forEach((event) => {
      const date = new Date(event.timestamp || event.createdAt || Date.now());
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      if (!buckets[key]) {
        buckets[key] = { label: key, opens: 0, clicks: 0, unsubscribes: 0 };
      }
      const type = (event.type || event.eventType || '').toLowerCase();
      if (type === 'open') buckets[key].opens += 1;
      if (type === 'click') buckets[key].clicks += 1;
      if (type === 'unsubscribe') buckets[key].unsubscribes += 1;
    });
    return Object.values(buckets).slice(chartPeriod === '7D' ? -7 : chartPeriod === '30D' ? -30 : chartPeriod === '90D' ? -90 : -180);
  }, [filteredEvents, chartPeriod]);

  const chartMax = useMemo(() => {
    return Math.max(...chartData.flatMap((row) => [row.opens, row.clicks, row.unsubscribes]), 1);
  }, [chartData]);

  const chartSeries = [
    { key: 'opens', label: 'Opens', color: 'var(--accent)' },
    { key: 'clicks', label: 'Clicks', color: '#22c55e' },
    { key: 'unsubscribes', label: 'Unsubscribes', color: '#f59e0b' }
  ];

  const engagementSummary = useMemo(() => {
    const total = chartData.reduce((sum, row) => sum + row.opens + row.clicks + row.unsubscribes, 0);
    return {
      total,
      delta: total > 0 ? `+${Math.min(99, Math.round((total / Math.max(chartData.length, 1)) * 3))}%` : '0%'
    };
  }, [chartData]);

  const recentEvents = useMemo(() => {
    return [...filteredEvents]
      .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
      .filter((event) => eventTypeFilter === 'all' || (event.type || event.eventType || '').toLowerCase() === eventTypeFilter)
      .slice(0, 100);
  }, [filteredEvents, eventTypeFilter]);

  const eventBreakdown = useMemo(() => {
    const counts = { open: 0, click: 0, unsubscribe: 0, bounce: 0 };
    filteredEvents.forEach((event) => {
      const type = (event.type || event.eventType || '').toLowerCase();
      if (type in counts) counts[type] += 1;
    });
    return counts;
  }, [filteredEvents]);

  const handleExportEvents = () => {
    if (!events.length) return;
    const headers = ['Time', 'Type', 'Email', 'URL', 'User Agent'];
    const rows = events.map((event) => [
      new Date(event.timestamp || event.createdAt || Date.now()).toLocaleString(),
      event.type || event.eventType || '',
      event.email || event.recipientEmail || '',
      event.url || '',
      event.userAgent || ''
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${campaignId}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!campaignId) {
    return (
      <div className="section-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title"><BarChart3 size={22} style={{ marginRight: 8 }} />Analytics</h1>
            <p className="page-subtitle">Campaign performance tracking and engagement insights.</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.2, color: 'var(--accent)' }} />
          <h3 style={{ marginBottom: 8 }}>No Campaign Selected</h3>
          <p className="text-muted">Select a campaign from the Campaigns page to view its analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">
            <BarChart3 size={22} style={{ marginRight: 8, color: 'var(--accent)' }} />
            {analytics?.name || analytics?.campaignName || 'Campaign Analytics'}
          </h1>
          <p className="page-subtitle">
            {analytics?.subject ? `Subject: ${analytics.subject}` : ''}
            {analytics?.sentAt ? ` • Sent ${new Date(analytics.sentAt).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {events.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={handleExportEvents}>
              <Download size={14} /> Export CSV
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.06)' }}>
          <div className="flex items-center gap-3">
            <XCircle size={20} style={{ color: 'var(--error)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--error)', fontWeight: 500 }}>{error}</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={load}>Retry</button>
          </div>
        </div>
      )}

      {loading && !analytics && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)', marginBottom: 12 }} />
          <p className="text-muted">Loading analytics data...</p>
        </div>
      )}

      {stats && (
        <div className="stats-grid-4">
          <div className="stat-card" style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.14),rgba(124,58,237,0.04))' }}>
            <div className="stat-icon" style={{ color: 'var(--accent)', background: 'rgba(124,58,237,0.15)' }}><Send size={20} /></div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: 'var(--accent)' }}><CountUpValue value={stats.sent} /></div>
              <div className="stat-label">Sent</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtNum(stats.delivered)} delivered ({fmtPct(stats.delivered, stats.sent)})</div>
            </div>
          </div>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.04))' }}>
            <div className="stat-icon" style={{ color: 'var(--success)', background: 'rgba(34,197,94,0.15)' }}><Eye size={20} /></div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: 'var(--success)' }}><CountUpValue value={stats.opens} /></div>
              <div className="stat-label">Opens</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.opens, stats.sent)} open rate</div>
            </div>
          </div>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg,rgba(167,139,250,0.14),rgba(167,139,250,0.04))' }}>
            <div className="stat-icon" style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.15)' }}><MousePointerClick size={20} /></div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: '#a78bfa' }}><CountUpValue value={stats.clicks} /></div>
              <div className="stat-label">Clicks</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.clicks, stats.opens)} CTR</div>
            </div>
          </div>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.14),rgba(239,68,68,0.04))' }}>
            <div className="stat-icon" style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.15)' }}><TrendingDown size={20} /></div>
            <div className="stat-content">
              <div className="stat-value" style={{ color: 'var(--error)' }}><CountUpValue value={stats.bounces} /></div>
              <div className="stat-label">Bounces</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.bounces, stats.sent)} bounce rate</div>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="stats-grid-4">
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--warning)', background: 'rgba(245,158,11,0.12)' }}><UserX size={20} /></div>
            <div className="stat-content">
              <div className="stat-value"><CountUpValue value={stats.unsubs} /></div>
              <div className="stat-label">Unsubscribes</div>
              <div style={{ fontSize: 11, color: stats.unsubs > 0 ? 'var(--warning)' : 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.unsubs, stats.sent)} of sent</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.12)' }}><AlertCircle size={20} /></div>
            <div className="stat-content">
              <div className="stat-value"><CountUpValue value={stats.complaints} /></div>
              <div className="stat-label">Complaints</div>
              <div style={{ fontSize: 11, color: stats.complaints > 0 ? 'var(--error)' : 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.complaints, stats.sent)} of sent</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}><Activity size={20} /></div>
            <div className="stat-content">
              <div className="stat-value"><CountUpValue value={filteredEvents.length} /></div>
              <div className="stat-label">Tracked Events</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Current period</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--success)', background: 'rgba(34,197,94,0.12)' }}><CheckCircle size={20} /></div>
            <div className="stat-content">
              <div className="stat-value"><CountUpValue value={stats.delivered} /></div>
              <div className="stat-label">Delivered</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtPct(stats.delivered, stats.sent)} delivery rate</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="flex items-center gap-3">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', display: 'inline-block', animation: 'runningPulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontWeight: 600 }}>Live tracking active</span>
          <span className="text-muted" style={{ fontSize: 13 }}>Auto-refreshing every 6 seconds</span>
        </div>
        <div className="flex gap-3" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <span><strong style={{ color: 'var(--accent)' }}>{eventBreakdown.open}</strong> opens</span>
          <span><strong style={{ color: '#22c55e' }}>{eventBreakdown.click}</strong> clicks</span>
          <span><strong style={{ color: 'var(--warning)' }}>{eventBreakdown.unsubscribe}</strong> unsubs</span>
          <span><strong style={{ color: 'var(--error)' }}>{eventBreakdown.bounce}</strong> bounces</span>
        </div>
      </div>

      <div className="flex gap-2" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['overview', 'Performance Chart', TrendingUp], ['events', 'Recent Activity', Activity]].map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 18px',
              background: tab === key ? 'var(--accent)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} /> Engagement Over Time
            </h3>
            <div className="chart-period-tabs">
              {PERIODS.map((period) => (
                <button
                  key={period}
                  className={`chart-period-tab ${chartPeriod === period ? 'active' : ''}`}
                  onClick={() => setChartPeriod(period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2" style={{ alignItems: 'start', marginBottom: 18 }}>
            <div className="card" style={{ padding: '18px', minHeight: '100%' }}>
              <div className="card-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={16} />
                Delivery Breakdown
              </div>
              <DonutChart
                centerLabel={fmtPct(stats?.delivered || 0, stats?.sent || 0).replace('.0', '')}
                centerCaption="DELIVERED"
                segments={[
                  { label: 'Delivered', value: stats?.delivered || 0, color: 'var(--success)' },
                  { label: 'Bounced', value: stats?.bounces || 0, color: 'var(--error)' },
                  { label: 'Unsubscribed', value: stats?.unsubs || 0, color: 'var(--warning)' }
                ]}
              />
            </div>
            <div className="card" style={{ padding: '18px', minHeight: '100%' }}>
              <div className="card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} />
                Engagement Snapshot
              </div>
              <div className="dashboard-tip-grid">
                <div className="dashboard-tip-card">
                  <div className="dashboard-item-title">Tracked Events</div>
                  <p className="dashboard-item-subtitle" style={{ marginTop: 6 }}>{filteredEvents.length.toLocaleString()} events in the selected period.</p>
                </div>
                <div className="dashboard-tip-card">
                  <div className="dashboard-item-title">Open Momentum</div>
                  <p className="dashboard-item-subtitle" style={{ marginTop: 6 }}>{fmtPct(stats?.opens || 0, stats?.sent || 0)} open rate across delivered volume.</p>
                </div>
                <div className="dashboard-tip-card">
                  <div className="dashboard-item-title">Click Intent</div>
                  <p className="dashboard-item-subtitle" style={{ marginTop: 6 }}>{fmtPct(stats?.clicks || 0, stats?.opens || 0)} click-through from openers.</p>
                </div>
                <div className="dashboard-tip-card">
                  <div className="dashboard-item-title">Range</div>
                  <p className="dashboard-item-subtitle" style={{ marginTop: 6 }}>{chartPeriod === 'Custom' ? 'Full history view' : `Showing the last ${chartPeriod} of tracked events.`}</p>
                </div>
              </div>
            </div>
          </div>
          {chartData.length > 0 ? (
            <RealtimeLineChart
              data={chartData}
              series={chartSeries}
              height={240}
              xKey="label"
              yMax={chartMax}
              summaryLabel="Engagement Overview"
              summaryValue={fmtNum(engagementSummary.total)}
              summaryDelta={engagementSummary.delta}
              rangeLabel={chartPeriod === 'Custom' ? 'Full history' : `Last ${chartPeriod}`}
              accentTone="var(--accent)"
            />
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
              <BarChart3 size={40} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 13 }}>No tracking events yet.</p>
              <p style={{ fontSize: 12, opacity: 0.7 }}>Events appear as recipients open and click your email.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Recent Activity</h3>
            <div className="flex gap-2 items-center">
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              {['all', 'open', 'click', 'unsubscribe', 'bounce'].map((type) => (
                <button
                  key={type}
                  className={`btn btn-sm ${eventTypeFilter === type ? 'btn-primary' : 'btn-outline'}`}
                  style={{ textTransform: 'capitalize', padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setEventTypeFilter(type)}
                >
                  {type === 'all' ? 'All' : type}
                  {type !== 'all' && <span style={{ marginLeft: 4, opacity: 0.7 }}>({eventBreakdown[type] ?? 0})</span>}
                </button>
              ))}
            </div>
          </div>
          {recentEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <Users size={36} style={{ marginBottom: 10, opacity: 0.2 }} />
              <p style={{ fontSize: 13 }}>No {eventTypeFilter === 'all' ? '' : `${eventTypeFilter} `}events recorded yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event, index) => {
                    const type = (event.type || event.eventType || '').toLowerCase();
                    const colorMap = { open: '#22c55e', click: 'var(--accent)', bounce: 'var(--error)', unsubscribe: 'var(--warning)' };
                    const color = colorMap[type] || 'var(--text-muted)';
                    return (
                      <tr key={event.id || index}>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(event.timestamp || event.createdAt || Date.now()).toLocaleString()}
                        </td>
                        <td>
                          <span style={{ color, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {type || 'unknown'}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>{event.email || event.recipientEmail || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {event.url ? (
                            <a href={event.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ExternalLink size={11} /> {event.url.substring(0, 60)}
                            </a>
                          ) : event.userAgent?.substring(0, 70) || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {recentEvents.length >= 100 && (
                <p style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Showing latest 100 events. Export CSV to see all.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
