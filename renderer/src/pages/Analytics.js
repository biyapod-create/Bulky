import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Eye, MousePointer, Send, XCircle, Clock, ChevronLeft, AlertTriangle, Ban, RefreshCw } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';

function Analytics() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (campaignId) {
      loadAnalytics();
      loadLogs();
    }
  }, [campaignId]);

  const loadAnalytics = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.campaigns.getAnalytics(campaignId);
        setAnalytics(data);
      }
    } catch (error) {
      addToast('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.campaigns.getLogs(campaignId);
        setLogs(data || []);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  if (loading) {
    return <div className="text-center text-muted" style={{ padding: '60px' }}>Loading analytics...</div>;
  }

  if (!analytics || !analytics.campaign) {
    return (
      <div className="text-center text-muted" style={{ padding: '60px' }}>
        <p>Campaign not found</p>
        <button className="btn btn-primary mt-4" onClick={() => navigate('/campaigns')}>Back to Campaigns</button>
      </div>
    );
  }

  const { campaign, opensByHour, clicksByLink } = analytics;
  
  // Calculate real metrics
  const total = campaign.totalEmails || 0;
  const sent = campaign.sentEmails || 0;
  const failed = campaign.failedEmails || 0;
  const bounced = campaign.bouncedEmails || 0;
  const softBounced = campaign.softBouncedEmails || 0;
  const hardBounced = bounced - softBounced;
  const opened = campaign.openedEmails || 0;
  const clicked = campaign.clickedEmails || 0;
  
  // Real delivery = Sent - Bounced (emails that actually made it)
  const delivered = Math.max(0, sent - bounced);
  
  // Calculate percentages based on REAL metrics
  const sentPct = total > 0 ? (sent / total * 100).toFixed(1) : '0.0';
  const deliveredPct = sent > 0 ? (delivered / sent * 100).toFixed(1) : '0.0';
  const failedPct = total > 0 ? (failed / total * 100).toFixed(1) : '0.0';
  const bouncePct = sent > 0 ? (bounced / sent * 100).toFixed(1) : '0.0';
  const openedPct = delivered > 0 ? (opened / delivered * 100).toFixed(1) : '0.0';
  const clickedPct = opened > 0 ? (clicked / opened * 100).toFixed(1) : '0.0';

  // Analyze bounce reasons from logs
  const bouncedLogs = logs.filter(l => l.failureType === 'hard_bounce' || l.failureType === 'soft_bounce');
  const bounceReasons = {};
  bouncedLogs.forEach(log => {
    const reason = log.failureReason || 'Unknown';
    bounceReasons[reason] = (bounceReasons[reason] || 0) + 1;
  });

  // Get failed emails for display
  const failedLogs = logs.filter(l => l.status === 'failed' || l.status === 'bounced');

  // Donut chart component
  const DonutChart = ({ value, total, color, label, subtitle }) => {
    const percentage = total > 0 ? (value / total * 100) : 0;
    const circumference = 2 * Math.PI * 40;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    return (
      <div style={{ textAlign: 'center' }}>
        <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="40" stroke="var(--bg-tertiary)" strokeWidth="8" fill="none" />
          <circle 
            cx="50" cy="50" r="40" 
            stroke={color} 
            strokeWidth="8" 
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{ marginTop: '-70px', marginBottom: '35px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{percentage.toFixed(1)}%</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
          {subtitle && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
      </div>
    );
  };

  // Progress bar component
  const ProgressBar = ({ label, value, total, color, showPct = true }) => {
    const pct = total > 0 ? (value / total * 100) : 0;
    return (
      <div style={{ marginBottom: '12px' }}>
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span style={{ color, fontWeight: 600 }}>
            {value.toLocaleString()} {showPct && `(${pct.toFixed(1)}%)`}
          </span>
        </div>
        <div style={{ height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
        </div>
      </div>
    );
  };

  // Prepare hourly data
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    const found = opensByHour?.find(h => h.hour === hour);
    return { label: `${hour}:00`, value: found?.count || 0 };
  }).filter(h => h.value > 0);

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-outline btn-sm mb-3" onClick={() => navigate('/campaigns')}>
          <ChevronLeft size={16} /> Back to Campaigns
        </button>
        <h1 className="page-title">
          <BarChart3 size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> 
          Campaign Analytics
        </h1>
        <p className="page-subtitle">{campaign.name}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        {['overview', 'bounces', 'engagement'].map(tab => (
          <button
            key={tab}
            className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Stats - 6 Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#6366f1' }}><Send size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{total.toLocaleString()}</div>
            <div className="stat-label">Recipients</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#22c55e' }}><TrendingUp size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#22c55e' }}>{delivered.toLocaleString()}</div>
            <div className="stat-label">Delivered ({deliveredPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#f59e0b' }}><AlertTriangle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#f59e0b' }}>{bounced.toLocaleString()}</div>
            <div className="stat-label">Bounced ({bouncePct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#3b82f6' }}><Eye size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#3b82f6' }}>{opened.toLocaleString()}</div>
            <div className="stat-label">Opened ({openedPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#a855f7' }}><MousePointer size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#a855f7' }}>{clicked.toLocaleString()}</div>
            <div className="stat-label">Clicked ({clickedPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#ef4444' }}><XCircle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#ef4444' }}>{failed.toLocaleString()}</div>
            <div className="stat-label">Failed ({failedPct}%)</div>
          </div>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            {/* Engagement Donut Charts */}
            <div className="card">
              <h3 className="card-title mb-4">Engagement Funnel</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '20px 0' }}>
                <DonutChart value={delivered} total={sent} color="#22c55e" label="Delivery Rate" subtitle={`${delivered} of ${sent}`} />
                <DonutChart value={opened} total={delivered} color="#3b82f6" label="Open Rate" subtitle={`${opened} of ${delivered}`} />
                <DonutChart value={clicked} total={opened} color="#a855f7" label="Click Rate" subtitle={`${clicked} of ${opened}`} />
              </div>
            </div>

            {/* Delivery Breakdown */}
            <div className="card">
              <h3 className="card-title mb-4">Delivery Breakdown</h3>
              <div style={{ padding: '20px 0' }}>
                <ProgressBar label="Sent" value={sent} total={total} color="#6366f1" />
                <ProgressBar label="Delivered" value={delivered} total={sent} color="#22c55e" />
                <ProgressBar label="Bounced" value={bounced} total={sent} color="#f59e0b" />
                <ProgressBar label="Failed" value={failed} total={total} color="#ef4444" />
              </div>
            </div>
          </div>

          {/* Opens by Hour */}
          {hourlyData.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title mb-4">
                <Clock size={18} style={{ marginRight: '8px' }} /> Opens by Hour
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px', padding: '10px 0' }}>
                {hourlyData.map((item, idx) => {
                  const maxVal = Math.max(...hourlyData.map(d => d.value), 1);
                  const height = (item.value / maxVal) * 100;
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: '10px', marginBottom: '4px' }}>{item.value}</div>
                      <div style={{ width: '100%', height: `${height}%`, background: '#3b82f6', borderRadius: '4px 4px 0 0', minHeight: '2px' }} />
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.label.split(':')[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* BOUNCES TAB */}
      {activeTab === 'bounces' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            {/* Bounce Type Breakdown */}
            <div className="card">
              <h3 className="card-title mb-4">
                <AlertTriangle size={18} style={{ marginRight: '8px' }} /> Bounce Breakdown
              </h3>
              <div style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '20px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{hardBounced}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hard Bounces</div>
                    <div style={{ fontSize: '10px', color: '#ef4444' }}>Invalid/Non-existent</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{softBounced}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Soft Bounces</div>
                    <div style={{ fontSize: '10px', color: '#f59e0b' }}>Temporary Issues</div>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                  <div className="flex justify-between mb-2">
                    <span><Ban size={14} style={{ marginRight: '4px' }} /> Hard Bounce Rate:</span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{sent > 0 ? (hardBounced / sent * 100).toFixed(2) : 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span><RefreshCw size={14} style={{ marginRight: '4px' }} /> Soft Bounce Rate:</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{sent > 0 ? (softBounced / sent * 100).toFixed(2) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bounce Reasons */}
            <div className="card">
              <h3 className="card-title mb-4">Bounce Reasons</h3>
              {Object.keys(bounceReasons).length > 0 ? (
                <div style={{ padding: '10px 0' }}>
                  {Object.entries(bounceReasons)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([reason, count], idx) => (
                      <ProgressBar key={idx} label={reason} value={count} total={bounced} color="#f59e0b" />
                    ))}
                </div>
              ) : (
                <div className="text-center text-muted py-4">No bounce data available</div>
              )}
            </div>
          </div>

          {/* Bounced Emails List */}
          {failedLogs.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title mb-4">Bounced & Failed Emails ({failedLogs.length})</h3>
              <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Type</th>
                      <th>SMTP Code</th>
                      <th>Reason</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedLogs.slice(0, 100).map((log, idx) => (
                      <tr key={idx}>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.email}</td>
                        <td>
                          <span className={`badge badge-${log.failureType === 'hard_bounce' ? 'danger' : log.failureType === 'soft_bounce' ? 'warning' : 'default'}`}>
                            {log.failureType || log.status}
                          </span>
                        </td>
                        <td>{log.smtpCode || '-'}</td>
                        <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }}>
                          {log.failureReason || log.error || '-'}
                        </td>
                        <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ENGAGEMENT TAB */}
      {activeTab === 'engagement' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            {/* Engagement Rates */}
            <div className="card">
              <h3 className="card-title mb-4">Engagement Performance</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '20px 0' }}>
                <DonutChart value={opened} total={delivered} color="#3b82f6" label="Open Rate" subtitle={`${opened} opens`} />
                <DonutChart value={clicked} total={opened} color="#a855f7" label="Click-to-Open" subtitle={`${clicked} clicks`} />
              </div>
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', fontSize: '12px', marginTop: '10px' }}>
                <div className="flex justify-between mb-2">
                  <span>Unique Opens:</span>
                  <span style={{ fontWeight: 600 }}>{opened.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Unique Clicks:</span>
                  <span style={{ fontWeight: 600 }}>{clicked.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Click-Through Rate (CTR):</span>
                  <span style={{ fontWeight: 600, color: '#a855f7' }}>{delivered > 0 ? (clicked / delivered * 100).toFixed(2) : 0}%</span>
                </div>
              </div>
            </div>

            {/* Top Clicked Links */}
            <div className="card">
              <h3 className="card-title mb-4">
                <MousePointer size={18} style={{ marginRight: '8px' }} /> Top Clicked Links
              </h3>
              {clicksByLink && clicksByLink.length > 0 ? (
                <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Link URL</th>
                        <th style={{ width: '80px', textAlign: 'right' }}>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clicksByLink.slice(0, 10).map((link, idx) => (
                        <tr key={idx}>
                          <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <a href={link.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                              {link.link}
                            </a>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{link.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-muted py-4">No click data available yet</div>
              )}
            </div>
          </div>

          {/* Opens by Hour */}
          {hourlyData.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title mb-4">
                <Clock size={18} style={{ marginRight: '8px' }} /> Opens Timeline
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px', padding: '10px 0' }}>
                {hourlyData.map((item, idx) => {
                  const maxVal = Math.max(...hourlyData.map(d => d.value), 1);
                  const height = (item.value / maxVal) * 100;
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: '10px', marginBottom: '4px' }}>{item.value}</div>
                      <div style={{ width: '100%', height: `${height}%`, background: '#3b82f6', borderRadius: '4px 4px 0 0', minHeight: '2px' }} />
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.label.split(':')[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Campaign Details - Always visible */}
      <div className="card mt-4">
        <h3 className="card-title mb-4">Campaign Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div>
            <div className="text-sm text-muted">Status</div>
            <div className={`badge badge-${campaign.status === 'completed' ? 'success' : campaign.status === 'running' ? 'info' : 'default'}`}>
              {campaign.status}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">List</div>
            <div>{campaign.listName || 'All Contacts'}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Batch Size</div>
            <div>{campaign.batchSize} emails</div>
          </div>
          <div>
            <div className="text-sm text-muted">Delay</div>
            <div>{campaign.delayMinutes} minutes</div>
          </div>
          <div>
            <div className="text-sm text-muted">Created</div>
            <div style={{ fontSize: '13px' }}>{new Date(campaign.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Started</div>
            <div style={{ fontSize: '13px' }}>{campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Completed</div>
            <div style={{ fontSize: '13px' }}>{campaign.completedAt ? new Date(campaign.completedAt).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Duration</div>
            <div style={{ fontSize: '13px' }}>
              {campaign.startedAt && campaign.completedAt 
                ? `${Math.round((new Date(campaign.completedAt) - new Date(campaign.startedAt)) / 60000)} min`
                : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div className="card mt-4" style={{ background: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h4 style={{ margin: 0, marginBottom: '4px' }}>Campaign Performance Summary</h4>
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              {delivered.toLocaleString()} emails delivered out of {sent.toLocaleString()} sent 
              ({deliveredPct}% delivery rate)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '20px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>{deliveredPct}%</div>
              <div className="text-sm text-muted">Delivery</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{openedPct}%</div>
              <div className="text-sm text-muted">Opens</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7' }}>{clickedPct}%</div>
              <div className="text-sm text-muted">Clicks</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{bouncePct}%</div>
              <div className="text-sm text-muted">Bounces</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
