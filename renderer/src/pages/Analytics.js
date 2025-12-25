import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Eye, MousePointer, Send, XCircle, Clock, ChevronLeft } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';

function Analytics() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (campaignId) {
      loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  
  // Calculate percentages for visual bars
  const total = campaign.totalEmails || 1;
  const sentPct = ((campaign.sentEmails || 0) / total * 100).toFixed(1);
  const failedPct = ((campaign.failedEmails || 0) / total * 100).toFixed(1);
  const openedPct = ((campaign.openedEmails || 0) / Math.max(campaign.sentEmails, 1) * 100).toFixed(1);
  const clickedPct = ((campaign.clickedEmails || 0) / Math.max(campaign.sentEmails, 1) * 100).toFixed(1);


  // Simple bar chart component
  const BarChart = ({ data, color }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '50px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
              {item.label}
            </div>
            <div style={{ flex: 1, height: '20px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${(item.value / max) * 100}%`, 
                height: '100%', 
                background: color,
                borderRadius: '4px',
                transition: 'width 0.5s ease',
                minWidth: item.value > 0 ? '2px' : '0'
              }} />
            </div>
            <div style={{ width: '40px', fontSize: '12px', fontWeight: '600' }}>{item.value}</div>
          </div>
        ))}
      </div>
    );
  };

  // Donut chart component
  const DonutChart = ({ value, total, color, label }) => {
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

      {/* Overview Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#6366f1' }}><Send size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{campaign.totalEmails || 0}</div>
            <div className="stat-label">Total Recipients</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#22c55e' }}><TrendingUp size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#22c55e' }}>{campaign.sentEmails || 0}</div>
            <div className="stat-label">Delivered ({sentPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#3b82f6' }}><Eye size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#3b82f6' }}>{campaign.openedEmails || 0}</div>
            <div className="stat-label">Opened ({openedPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#a855f7' }}><MousePointer size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#a855f7' }}>{campaign.clickedEmails || 0}</div>
            <div className="stat-label">Clicked ({clickedPct}%)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#ef4444' }}><XCircle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#ef4444' }}>{campaign.failedEmails || 0}</div>
            <div className="stat-label">Failed ({failedPct}%)</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {/* Engagement Donut Charts */}
        <div className="card">
          <h3 className="card-title mb-4">Engagement Rates</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', padding: '20px 0' }}>
            <DonutChart value={campaign.openedEmails || 0} total={campaign.sentEmails || 0} color="#3b82f6" label="Open Rate" />
            <DonutChart value={campaign.clickedEmails || 0} total={campaign.sentEmails || 0} color="#a855f7" label="Click Rate" />
            <DonutChart value={campaign.sentEmails || 0} total={campaign.totalEmails || 0} color="#22c55e" label="Delivery" />
          </div>
        </div>

        {/* Delivery Breakdown */}
        <div className="card">
          <h3 className="card-title mb-4">Delivery Breakdown</h3>
          <div style={{ padding: '20px 0' }}>
            {[
              { label: 'Delivered', value: campaign.sentEmails || 0, pct: sentPct, color: '#22c55e' },
              { label: 'Opened', value: campaign.openedEmails || 0, pct: openedPct, color: '#3b82f6' },
              { label: 'Clicked', value: campaign.clickedEmails || 0, pct: clickedPct, color: '#a855f7' },
              { label: 'Failed', value: campaign.failedEmails || 0, pct: failedPct, color: '#ef4444' }
            ].map((item, idx) => (
              <div key={idx} style={{ marginBottom: '12px' }}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{item.label}</span>
                  <span style={{ color: item.color, fontWeight: 600 }}>{item.value}</span>
                </div>
                <div style={{ height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* Opens by Hour */}
      {hourlyData.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title mb-4">
            <Clock size={18} style={{ marginRight: '8px' }} /> Opens by Hour
          </h3>
          <BarChart data={hourlyData} color="#3b82f6" />
        </div>
      )}

      {/* Top Clicked Links */}
      {clicksByLink && clicksByLink.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title mb-4">
            <MousePointer size={18} style={{ marginRight: '8px' }} /> Top Clicked Links
          </h3>
          <div className="table-container">
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
                    <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        </div>
      )}

      {/* Campaign Details */}
      <div className="card mt-4">
        <h3 className="card-title mb-4">Campaign Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
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
            <div className="text-sm text-muted">Throttle</div>
            <div>{campaign.batchSize} / {campaign.delayMinutes} min</div>
          </div>
          <div>
            <div className="text-sm text-muted">Created</div>
            <div>{new Date(campaign.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Started</div>
            <div>{campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Completed</div>
            <div>{campaign.completedAt ? new Date(campaign.completedAt).toLocaleString() : '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
