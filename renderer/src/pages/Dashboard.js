import React, { useState, useEffect } from 'react';
import { Users, Send, CheckCircle, TrendingUp, Mail, Eye, Shield, UserX, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalCampaigns: 0,
    totalSent: 0,
    totalOpened: 0,
    successRate: 0,
    openRate: 0,
    blacklistCount: 0,
    unsubscribeCount: 0,
    recentCampaigns: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.stats.getDashboard();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'badge-default',
      scheduled: 'badge-info',
      sending: 'badge-warning',
      completed: 'badge-success',
      paused: 'badge-warning',
      failed: 'badge-error'
    };
    return badges[status] || 'badge-default';
  };

  if (loading) {
    return <div className="text-center text-muted" style={{ padding: '60px' }}>Loading dashboard...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your email marketing performance.</p>
      </div>

      {/* Main Stats */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/contacts')} style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(91,180,212,0.15), rgba(91,180,212,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--accent)' }}><Users /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.totalContacts.toLocaleString()}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
        </div>
        <div className="stat-card" onClick={() => navigate('/campaigns')} style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))' }}>
          <div className="stat-icon" style={{ color: '#6366f1' }}><Mail /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#6366f1' }}>{stats.totalCampaigns.toLocaleString()}</div>
            <div className="stat-label">Campaigns</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' }}>
          <div className="stat-icon" style={{ color: '#10b981' }}><Send /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#10b981' }}>{stats.totalSent.toLocaleString()}</div>
            <div className="stat-label">Emails Sent</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--success)' }}><CheckCircle /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.successRate}%</div>
            <div className="stat-label">Delivery Rate</div>
          </div>
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className="stats-grid mt-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--success)' }}><Eye /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.totalOpened.toLocaleString()}</div>
            <div className="stat-label">Emails Opened</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(91,180,212,0.1), rgba(91,180,212,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--accent)' }}><TrendingUp /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.openRate}%</div>
            <div className="stat-label">Open Rate</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--error)' }}><Shield /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--error)' }}>{stats.blacklistCount}</div>
            <div className="stat-label">Blacklisted</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))' }}>
          <div className="stat-icon" style={{ color: 'var(--warning)' }}><UserX /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.unsubscribeCount}</div>
            <div className="stat-label">Unsubscribes</div>
          </div>
        </div>
      </div>


      {/* Quick Actions */}
      <div className="card mt-4">
        <h3 className="card-title mb-4">Quick Actions</h3>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-primary" onClick={() => navigate('/campaigns')}><Mail size={16} /> New Campaign</button>
          <button className="btn btn-outline" onClick={() => navigate('/contacts')}><Users size={16} /> Add Contacts</button>
          <button className="btn btn-outline" onClick={() => navigate('/verify')}><CheckCircle size={16} /> Verify Emails</button>
          <button className="btn btn-outline" onClick={() => navigate('/spam-checker')}><Shield size={16} /> Check Spam Score</button>
          <button className="btn btn-outline" onClick={() => navigate('/composer')}><Send size={16} /> Compose Email</button>
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="card mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="card-title">Recent Campaigns</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/campaigns')}><BarChart3 size={14} /> View All</button>
        </div>
        
        {stats.recentCampaigns.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            <Mail size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <p>No campaigns yet. Create your first campaign!</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate('/campaigns')}>Create Campaign</button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Opened</th>
                  <th>Rate</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCampaigns.map(campaign => (
                  <tr key={campaign.id}>
                    <td><strong>{campaign.name}</strong></td>
                    <td>{campaign.listName || <span className="text-muted">-</span>}</td>
                    <td><span className={`badge ${getStatusBadge(campaign.status)}`}>{campaign.status}</span></td>
                    <td>{campaign.sentEmails || 0} / {campaign.totalEmails || 0}</td>
                    <td>{campaign.openedEmails || 0}</td>
                    <td>
                      {campaign.sentEmails > 0 ? (
                        <span style={{ color: 'var(--success)' }}>
                          {((campaign.openedEmails || 0) / campaign.sentEmails * 100).toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-muted text-sm">{new Date(campaign.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance Tips */}
      <div className="card mt-4" style={{ background: 'linear-gradient(135deg, rgba(91,180,212,0.1), rgba(91,180,212,0.02))' }}>
        <h3 className="card-title mb-3" style={{ color: 'var(--accent)' }}>💡 Tips for Better Deliverability</h3>
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div className="text-sm">
            <strong>Verify your list</strong>
            <p className="text-muted">Remove invalid emails before sending to reduce bounces.</p>
          </div>
          <div className="text-sm">
            <strong>Check spam score</strong>
            <p className="text-muted">Use the spam checker to optimize your content.</p>
          </div>
          <div className="text-sm">
            <strong>Warm up new accounts</strong>
            <p className="text-muted">Start with small batches and gradually increase volume.</p>
          </div>
          <div className="text-sm">
            <strong>Monitor engagement</strong>
            <p className="text-muted">Track opens and clicks to improve future campaigns.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
