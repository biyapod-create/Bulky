import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Send, CheckCircle, TrendingUp, Mail, Eye, Shield, UserX,
  BarChart3, Upload, MousePointerClick, Activity, Server, AlertCircle,
  ArrowUpRight, ArrowDownRight, Minus, Zap, FileSearch, BadgeCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalContacts: 0,
    verifiedContacts: 0,
    totalCampaigns: 0,
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    successRate: 0,
    openRate: 0,
    clickRate: 0,
    deliverabilityScore: 0,
    blacklistCount: 0,
    unsubscribeCount: 0,
    recentCampaigns: [],
    sendHistory: [],
    recentActivity: [],
    smtpAccounts: []
  });
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState('all');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.stats.getDashboard();
        setStats(prev => ({ ...prev, ...data }));
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

  const getTrendIcon = useCallback((value) => {
    if (value > 0) return <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />;
    if (value < 0) return <ArrowDownRight size={14} style={{ color: 'var(--error)' }} />;
    return <Minus size={14} style={{ color: 'var(--text-muted)' }} />;
  }, []);

  const getActivityIcon = (type) => {
    switch (type) {
      case 'send': return <Send size={14} style={{ color: 'var(--accent)' }} />;
      case 'open': return <Eye size={14} style={{ color: 'var(--success)' }} />;
      case 'click': return <MousePointerClick size={14} style={{ color: '#6366f1' }} />;
      case 'bounce': return <AlertCircle size={14} style={{ color: 'var(--error)' }} />;
      case 'unsubscribe': return <UserX size={14} style={{ color: 'var(--warning)' }} />;
      default: return <Activity size={14} />;
    }
  };

  const getSmtpHealthColor = (health) => {
    if (health >= 80) return 'var(--success)';
    if (health >= 50) return 'var(--warning)';
    return 'var(--error)';
  };

  // Calculate max bar height for the sends chart
  const sendHistory = stats.sendHistory || [];
  const maxSends = Math.max(...sendHistory.map(d => d.count || 0), 1);

  const filteredActivity = (stats.recentActivity || []).filter(a =>
    activityFilter === 'all' || a.type === activityFilter
  );

  if (loading) {
    return (
      <div className="text-center text-muted" style={{ padding: '60px' }}>
        <Activity size={32} style={{ opacity: 0.4, marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your email marketing performance.</p>
      </div>

      {/* Primary Stats Row */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div
          className="stat-card"
          onClick={() => navigate('/contacts')}
          style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(91,180,212,0.15), rgba(91,180,212,0.05))' }}
        >
          <div className="stat-icon" style={{ color: 'var(--accent)' }}><Users /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.totalContacts.toLocaleString()}</div>
            <div className="stat-label">Total Contacts</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {getTrendIcon(stats.contactsTrend || 0)}
              <span>{Math.abs(stats.contactsTrend || 0)} this week</span>
            </div>
          </div>
        </div>

        <div
          className="stat-card"
          style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' }}
        >
          <div className="stat-icon" style={{ color: '#10b981' }}><BadgeCheck /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#10b981' }}>{stats.verifiedContacts.toLocaleString()}</div>
            <div className="stat-label">Verified Contacts</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {stats.totalContacts > 0
                ? `${((stats.verifiedContacts / stats.totalContacts) * 100).toFixed(0)}% of list`
                : 'No contacts yet'}
            </div>
          </div>
        </div>

        <div
          className="stat-card"
          onClick={() => navigate('/campaigns')}
          style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))' }}
        >
          <div className="stat-icon" style={{ color: '#6366f1' }}><Mail /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#6366f1' }}>{stats.totalCampaigns.toLocaleString()}</div>
            <div className="stat-label">Campaigns</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {getTrendIcon(stats.campaignsTrend || 0)}
              <span>{Math.abs(stats.campaignsTrend || 0)} this week</span>
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' }}>
          <div className="stat-icon" style={{ color: '#10b981' }}><Send /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#10b981' }}>{stats.totalSent.toLocaleString()}</div>
            <div className="stat-label">Emails Sent</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {getTrendIcon(stats.sentTrend || 0)}
              <span>{Math.abs(stats.sentTrend || 0)} this week</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className="stats-grid mt-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.02))' }}>
          <div className="stat-icon" style={{ color: 'var(--success)' }}><CheckCircle /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.successRate}%</div>
            <div className="stat-label">Delivery Rate</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(91,180,212,0.1), rgba(91,180,212,0.02))' }}>
          <div className="stat-icon" style={{ color: 'var(--accent)' }}><Eye /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.openRate}%</div>
            <div className="stat-label">Avg Open Rate</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.02))' }}>
          <div className="stat-icon" style={{ color: '#6366f1' }}><MousePointerClick /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: '#6366f1' }}>{stats.clickRate || 0}%</div>
            <div className="stat-label">Avg Click Rate</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.02))' }}>
          <div className="stat-icon" style={{ color: 'var(--error)' }}><Shield /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--error)' }}>{stats.blacklistCount}</div>
            <div className="stat-label">Blacklisted</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.02))' }}>
          <div className="stat-icon" style={{ color: 'var(--warning)' }}><UserX /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.unsubscribeCount}</div>
            <div className="stat-label">Unsubscribes</div>
          </div>
        </div>
      </div>

      {/* Deliverability Score + Sends Chart Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', marginTop: '20px' }}>
        {/* Deliverability Score */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 className="card-title mb-4" style={{ alignSelf: 'flex-start' }}>Deliverability Score</h3>
          <div style={{
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            border: `8px solid ${stats.deliverabilityScore >= 80 ? 'var(--success)' : stats.deliverabilityScore >= 50 ? 'var(--warning)' : 'var(--error)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${stats.deliverabilityScore >= 80 ? 'rgba(34,197,94,0.08)' : stats.deliverabilityScore >= 50 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'}`
          }}>
            <span style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: stats.deliverabilityScore >= 80 ? 'var(--success)' : stats.deliverabilityScore >= 50 ? 'var(--warning)' : 'var(--error)'
            }}>
              {stats.deliverabilityScore || 0}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>out of 100</span>
          </div>
          <p style={{ fontSize: '13px', marginTop: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            {stats.deliverabilityScore >= 80 ? 'Excellent - your emails are landing well'
              : stats.deliverabilityScore >= 50 ? 'Fair - consider improving your sender reputation'
              : 'Poor - review your sending practices'}
          </p>
        </div>

        {/* Sends Over Time Chart */}
        <div className="card">
          <h3 className="card-title mb-4"><BarChart3 size={18} /> Sends Over Time (Last 14 Days)</h3>
          {sendHistory.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '160px', padding: '0 8px' }}>
              {sendHistory.map((day, i) => {
                const height = day.count > 0 ? Math.max((day.count / maxSends) * 140, 6) : 4;
                const barColor = day.count > 0 ? 'var(--accent)' : 'var(--border)';
                return (
                  <div
                    key={i}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                    title={`${day.date}: ${day.count} sent`}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', minHeight: '14px' }}>
                      {day.count > 0 ? day.count : ''}
                    </span>
                    <div style={{
                      width: '100%',
                      maxWidth: '40px',
                      height: `${height}px`,
                      background: barColor,
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                      opacity: day.count > 0 ? 1 : 0.3,
                      minHeight: '4px'
                    }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {day.label || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted" style={{ padding: '40px' }}>
              <BarChart3 size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No send data yet. Start a campaign to see your send history.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mt-4">
        <h3 className="card-title mb-4"><Zap size={18} /> Quick Actions</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            className="btn btn-primary"
            onClick={() => navigate('/campaigns')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Mail size={16} /> New Campaign
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/contacts')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Upload size={16} /> Import Contacts
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/spam-checker')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FileSearch size={16} /> Check Spam
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/verify')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <BadgeCheck size={16} /> Verify Emails
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/composer')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Send size={16} /> Compose Email
          </button>
        </div>
      </div>

      {/* Recent Activity + SMTP Health Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', marginTop: '20px' }}>
        {/* Recent Activity Feed */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title" style={{ margin: 0 }}><Activity size={18} /> Recent Activity</h3>
            <div className="flex gap-2">
              {['all', 'send', 'open', 'bounce'].map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${activityFilter === f ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActivityFilter(f)}
                  style={{ textTransform: 'capitalize', fontSize: '11px', padding: '4px 10px' }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredActivity.length > 0 ? (
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {filteredActivity.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 0',
                    borderBottom: i < filteredActivity.length - 1 ? '1px solid var(--border)' : 'none'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getActivityIcon(item.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.message}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email || ''}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {item.time || ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted" style={{ padding: '30px' }}>
              <Activity size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No recent activity to show.</p>
            </div>
          )}
        </div>

        {/* SMTP Account Health */}
        <div className="card">
          <h3 className="card-title mb-4"><Server size={18} /> SMTP Health</h3>
          {(stats.smtpAccounts || []).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.smtpAccounts.map((account, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${getSmtpHealthColor(account.health || 0)}`
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontWeight: 500, fontSize: '13px' }}>{account.name || account.host}</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: getSmtpHealthColor(account.health || 0)
                    }}>
                      {account.health || 0}%
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: '6px' }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${account.health || 0}%`,
                        background: getSmtpHealthColor(account.health || 0)
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{account.sentToday || 0} sent today</span>
                    <span>{account.dailyLimit ? `${account.dailyLimit} limit` : 'No limit set'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted" style={{ padding: '30px' }}>
              <Server size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ fontSize: '13px' }}>No SMTP accounts configured.</p>
              <button className="btn btn-outline btn-sm mt-2" onClick={() => navigate('/settings')}>
                Configure SMTP
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="card mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="card-title" style={{ margin: 0 }}>Recent Campaigns</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/campaigns')}>
            <BarChart3 size={14} /> View All
          </button>
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
        <h3 className="card-title mb-3" style={{ color: 'var(--accent)' }}>
          <TrendingUp size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Tips for Better Deliverability
        </h3>
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
