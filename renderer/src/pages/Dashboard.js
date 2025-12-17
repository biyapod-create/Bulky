import React, { useState, useEffect } from 'react';
import { Users, Send, CheckCircle, TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalCampaigns: 0,
    totalSent: 0,
    successRate: 0,
    recentCampaigns: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      if (window.electron?.stats) {
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
      completed: 'badge-success',
      running: 'badge-info',
      paused: 'badge-warning',
      draft: 'badge-default',
      stopped: 'badge-error',
    };
    return badges[status] || 'badge-default';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back! Here's your email overview.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon purple">
            <Users size={24} />
          </div>
          <div className="stat-value">{stats.totalContacts.toLocaleString()}</div>
          <div className="stat-label">Total Contacts</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon blue">
            <Send size={24} />
          </div>
          <div className="stat-value">{stats.totalCampaigns}</div>
          <div className="stat-label">Campaigns</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon green">
            <CheckCircle size={24} />
          </div>
          <div className="stat-value">{stats.totalSent.toLocaleString()}</div>
          <div className="stat-label">Emails Sent</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon orange">
            <TrendingUp size={24} />
          </div>
          <div className="stat-value">{stats.successRate}%</div>
          <div className="stat-label">Success Rate</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Campaigns</h3>
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/campaigns')}
          >
            View All <ArrowRight size={16} />
          </button>
        </div>

        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            Loading...
          </div>
        ) : stats.recentCampaigns.length === 0 ? (
          <div className="empty-state">
            <Send className="empty-state-icon" />
            <h3 className="empty-state-title">No campaigns yet</h3>
            <p className="empty-state-text">Create your first email campaign to get started.</p>
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/campaigns')}
            >
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCampaigns.map(campaign => {
                  const rate = campaign.sentEmails + campaign.failedEmails > 0
                    ? Math.round((campaign.sentEmails / (campaign.sentEmails + campaign.failedEmails)) * 100)
                    : 0;
                  
                  return (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>{campaign.listName || 'All Contacts'}</td>
                      <td>
                        <span className={`badge ${getStatusBadge(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td>{campaign.sentEmails} / {campaign.totalEmails}</td>
                      <td>{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
