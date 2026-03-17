import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Play, Pause, Square, Trash2, Eye, Send, BarChart3, Copy, Clock, Calendar, Search, Filter, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Zap, Users, ArrowRight } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useNavigate } from 'react-router-dom';

function Campaigns() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [logFilter, setLogFilter] = useState('all');
  // eslint-disable-next-line no-unused-vars
  const [expandedCard, setExpandedCard] = useState(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    listId: '',
    batchSize: 50,
    delayMinutes: 10
  });

  useEffect(() => {
    loadData();
    if (window.electron?.email?.onProgress) {
      window.electron.email.onProgress((data) => {
        setProgress(data);
        if (data.status === 'completed' || data.status === 'stopped') {
          loadData();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [campaignsData, listsData] = await Promise.all([
          window.electron.campaigns.getAll(),
          window.electron.lists.getAll()
        ]);
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
        setLists(Array.isArray(listsData) ? listsData : []);
      }
    } catch (error) {
      addToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Performance summary calculations
  const summary = useMemo(() => {
    const total = campaigns.length;
    const completed = campaigns.filter(c => c.status === 'completed').length;
    const drafts = campaigns.filter(c => c.status === 'draft').length;
    const scheduled = campaigns.filter(c => c.status === 'scheduled').length;
    const running = campaigns.filter(c => c.status === 'running').length;
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sentEmails || 0), 0);
    const totalFailed = campaigns.reduce((sum, c) => sum + (c.failedEmails || 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + (c.openedEmails || 0), 0);
    const totalClicked = campaigns.reduce((sum, c) => sum + (c.clickedEmails || 0), 0);
    const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
    const avgClickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : '0.0';
    return { total, completed, drafts, scheduled, running, totalSent, totalFailed, totalOpened, avgOpenRate, avgClickRate };
  }, [campaigns]);

  // Filtered and sorted campaigns
  const filteredCampaigns = useMemo(() => {
    let filtered = campaigns.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.subject || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    filtered.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      if (sortField === 'sentEmails' || sortField === 'totalEmails') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
    return filtered;
  }, [campaigns, searchTerm, statusFilter, sortField, sortDir]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return campaignLogs;
    return campaignLogs.filter(l => l.status === logFilter);
  }, [campaignLogs, logFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const handleCreateCampaign = () => {
    if (!newCampaign.name) {
      addToast('Campaign name is required', 'error');
      return;
    }
    navigate('/composer', { state: { campaign: newCampaign } });
    setShowCreateModal(false);
  };

  const handleStartCampaign = async (campaign) => {
    try {
      const smtpSettings = await window.electron.smtp.get();
      if (!smtpSettings?.host) {
        addToast('Please configure SMTP settings first', 'error');
        navigate('/settings');
        return;
      }

      const filter = { listId: campaign.listId || '' };
      if (campaign.selectedTags) {
        try {
          filter.tags = JSON.parse(campaign.selectedTags);
        } catch (e) {
          filter.tags = [];
        }
      }

      const contacts = await window.electron.contacts.getForCampaign(filter);
      if (contacts.length === 0) {
        addToast('No contacts to send to', 'error');
        return;
      }

      setSelectedCampaign(campaign);
      setShowProgressModal(true);
      setProgress({ status: 'starting', total: contacts.length, sent: 0, failed: 0 });

      await window.electron.email.send({ campaign, contacts, settings: smtpSettings });
    } catch (error) {
      addToast('Failed to start campaign', 'error');
    }
  };

  const handlePause = async () => {
    await window.electron.email.pause();
    addToast('Campaign paused', 'info');
  };

  const handleResume = async () => {
    await window.electron.email.resume();
    addToast('Campaign resumed', 'info');
  };

  const handleStop = async () => {
    await window.electron.email.stop();
    addToast('Campaign stopped', 'warning');
    setShowProgressModal(false);
  };

  const handleViewLogs = async (campaign) => {
    try {
      const logs = await window.electron.campaigns.getLogs(campaign.id);
      setCampaignLogs(Array.isArray(logs) ? logs : []);
      setSelectedCampaign(campaign);
      setLogFilter('all');
      setShowLogsModal(true);
    } catch (error) {
      addToast('Failed to load logs', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await window.electron.campaigns.delete(id);
      addToast('Campaign deleted', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to delete campaign', 'error');
    }
  };

  const handleDuplicate = async (campaign) => {
    try {
      const duplicated = {
        name: `${campaign.name} (Copy)`,
        subject: campaign.subject,
        subjectB: campaign.subjectB,
        content: campaign.content,
        contentB: campaign.contentB,
        isABTest: campaign.isABTest,
        abTestPercent: campaign.abTestPercent,
        listId: campaign.listId,
        batchSize: campaign.batchSize,
        delayMinutes: campaign.delayMinutes,
        status: 'draft',
        totalEmails: 0,
        sentEmails: 0,
        failedEmails: 0
      };
      await window.electron.campaigns.add(duplicated);
      addToast('Campaign duplicated', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to duplicate campaign', 'error');
    }
  };

  const openScheduleModal = (campaign) => {
    setSelectedCampaign(campaign);
    const now = new Date();
    now.setHours(now.getHours() + 1);
    setScheduleDate(now.toISOString().split('T')[0]);
    setScheduleTime(now.toTimeString().slice(0, 5));
    setShowScheduleModal(true);
  };

  const handleSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      addToast('Please select date and time', 'error');
      return;
    }
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      await window.electron.campaigns.schedule({ campaignId: selectedCampaign.id, scheduledAt });
      addToast(`Campaign scheduled for ${new Date(scheduledAt).toLocaleString()}`, 'success');
      setShowScheduleModal(false);
      loadData();
    } catch (error) {
      addToast('Failed to schedule campaign', 'error');
    }
  };

  const handleCancelSchedule = async (campaignId) => {
    try {
      await window.electron.campaigns.cancelSchedule(campaignId);
      addToast('Schedule cancelled', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to cancel schedule', 'error');
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      completed: { className: 'badge-success', icon: <CheckCircle size={12} />, color: '#22c55e' },
      running: { className: 'badge-info', icon: <Play size={12} />, color: '#3b82f6' },
      paused: { className: 'badge-warning', icon: <Pause size={12} />, color: '#f59e0b' },
      draft: { className: 'badge-default', icon: null, color: '#6b7280' },
      stopped: { className: 'badge-error', icon: <Square size={12} />, color: '#ef4444' },
      scheduled: { className: 'badge-info', icon: <Clock size={12} />, color: '#8b5cf6' },
    };
    return configs[status] || configs.draft;
  };

  const getProgressPercent = () => {
    if (!progress || !progress.total) return 0;
    return Math.round(((progress.sent + progress.failed) / progress.total) * 100);
  };

  const getCampaignProgress = (campaign) => {
    if (!campaign.totalEmails) return 0;
    return Math.round((campaign.sentEmails / campaign.totalEmails) * 100);
  };

  const getTimeUntilScheduled = (scheduledAt) => {
    if (!scheduledAt) return '';
    const diff = new Date(scheduledAt) - new Date();
    if (diff <= 0) return 'Starting soon...';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `in ${hours}h ${mins}m`;
    return `in ${mins}m`;
  };

  const logCounts = useMemo(() => {
    const sent = campaignLogs.filter(l => l.status === 'sent').length;
    const failed = campaignLogs.filter(l => l.status === 'failed').length;
    const bounced = campaignLogs.filter(l => l.status === 'bounced').length;
    return { sent, failed, bounced };
  }, [campaignLogs]);

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Create and manage your email campaigns.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} /> New Campaign
        </button>
      </div>

      {/* Performance Summary Cards */}
      {campaigns.length > 0 && (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#6366f1' }}><Send size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{summary.totalSent.toLocaleString()}</div>
              <div className="stat-label">Total Emails Sent</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#22c55e' }}><CheckCircle size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{summary.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#3b82f6' }}><Eye size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{summary.avgOpenRate}%</div>
              <div className="stat-label">Avg Open Rate</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#a855f7' }}><Zap size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{summary.avgClickRate}%</div>
              <div className="stat-label">Avg Click Rate</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#f59e0b' }}><Clock size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{summary.drafts + summary.scheduled}</div>
              <div className="stat-label">Pending ({summary.scheduled} scheduled)</div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filter Bar */}
      {campaigns.length > 0 && (
        <div className="card mb-4">
          <div className="flex gap-3 items-center">
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search campaigns by name or subject..."
                style={{ paddingLeft: '36px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={16} style={{ color: 'var(--text-muted)' }} />
              <select
                className="form-select"
                style={{ width: '160px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="stopped">Stopped</option>
              </select>
            </div>
            <div className="text-sm text-muted" style={{ whiteSpace: 'nowrap' }}>
              {filteredCampaigns.length} of {campaigns.length}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Cards / Table */}
      <div className="card">
        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">
            <Send className="empty-state-icon" />
            <h3 className="empty-state-title">No campaigns yet</h3>
            <p className="empty-state-text">Create your first campaign to start sending emails.</p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create Campaign
            </button>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            No campaigns match your search criteria.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                    <span className="flex items-center gap-1">Campaign <SortIcon field="name" /></span>
                  </th>
                  <th>List</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('sentEmails')}>
                    <span className="flex items-center gap-1">Progress <SortIcon field="sentEmails" /></span>
                  </th>
                  <th>Engagement</th>
                  <th>Throttle</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map(campaign => {
                  const statusCfg = getStatusConfig(campaign.status);
                  const progressPct = getCampaignProgress(campaign);
                  const openRate = campaign.sentEmails > 0
                    ? ((campaign.openedEmails || 0) / campaign.sentEmails * 100).toFixed(1) : null;
                  const clickRate = (campaign.openedEmails || 0) > 0
                    ? ((campaign.clickedEmails || 0) / campaign.openedEmails * 100).toFixed(1) : null;

                  return (
                    <tr key={campaign.id}>
                      <td>
                        <div>
                          <strong>{campaign.name}</strong>
                          {campaign.isABTest && (
                            <span className="badge badge-info" style={{ marginLeft: '8px', fontSize: '10px' }}>A/B</span>
                          )}
                          {campaign.subject && (
                            <div className="text-sm text-muted" style={{ marginTop: '2px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {campaign.subject}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="text-sm">{campaign.listName || 'All Contacts'}</td>
                      <td>
                        <span className={`badge ${statusCfg.className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {statusCfg.icon} {campaign.status}
                        </span>
                        {campaign.status === 'scheduled' && campaign.scheduledAt && (
                          <div className="text-sm" style={{ marginTop: '4px', color: '#8b5cf6', fontSize: '11px' }}>
                            {getTimeUntilScheduled(campaign.scheduledAt)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="progress-bar" style={{ width: '80px' }}>
                            <div
                              className="progress-fill"
                              style={{
                                width: `${progressPct}%`,
                                background: campaign.status === 'completed' ? '#22c55e' : undefined
                              }}
                            />
                          </div>
                          <span className="text-sm text-muted">
                            {campaign.sentEmails}/{campaign.totalEmails}
                          </span>
                        </div>
                        {campaign.failedEmails > 0 && (
                          <div className="text-sm" style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>
                            {campaign.failedEmails} failed
                          </div>
                        )}
                      </td>
                      <td>
                        {campaign.status === 'completed' && openRate !== null ? (
                          <div style={{ fontSize: '12px' }}>
                            <div style={{ color: '#3b82f6' }}>{openRate}% opens</div>
                            {clickRate !== null && <div style={{ color: '#a855f7' }}>{clickRate}% clicks</div>}
                          </div>
                        ) : (
                          <span className="text-sm text-muted">--</span>
                        )}
                      </td>
                      <td className="text-sm text-muted">
                        {campaign.batchSize} / {campaign.delayMinutes}min
                      </td>
                      <td>
                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                          {campaign.status === 'draft' && (
                            <>
                              <button
                                className="btn btn-success btn-icon btn-sm"
                                onClick={() => handleStartCampaign(campaign)}
                                title="Start Now"
                              >
                                <Play size={14} />
                              </button>
                              <button
                                className="btn btn-outline btn-icon btn-sm"
                                onClick={() => openScheduleModal(campaign)}
                                title="Schedule"
                              >
                                <Calendar size={14} />
                              </button>
                            </>
                          )}
                          {campaign.status === 'scheduled' && (
                            <button
                              className="btn btn-warning btn-icon btn-sm"
                              onClick={() => handleCancelSchedule(campaign.id)}
                              title="Cancel Schedule"
                            >
                              <Clock size={14} />
                            </button>
                          )}
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleDuplicate(campaign)}
                            title="Duplicate"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => navigate(`/analytics/${campaign.id}`)}
                            title="Analytics"
                          >
                            <BarChart3 size={14} />
                          </button>
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleViewLogs(campaign)}
                            title="View Logs"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleDelete(campaign.id)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* A/B Test Results (shown for completed A/B campaigns) */}
      {filteredCampaigns.some(c => c.isABTest && c.status === 'completed') && (
        <div className="card mt-4">
          <h3 className="card-title mb-4"><Zap size={18} style={{ marginRight: '8px' }} /> A/B Test Results</h3>
          {filteredCampaigns.filter(c => c.isABTest && c.status === 'completed').map(campaign => {
            const aOpens = campaign.openedEmailsA || 0;
            const bOpens = campaign.openedEmailsB || 0;
            const aSent = campaign.sentEmailsA || Math.floor((campaign.sentEmails || 0) / 2);
            const bSent = campaign.sentEmailsB || Math.ceil((campaign.sentEmails || 0) / 2);
            const aRate = aSent > 0 ? (aOpens / aSent * 100).toFixed(1) : '0.0';
            const bRate = bSent > 0 ? (bOpens / bSent * 100).toFixed(1) : '0.0';
            const winner = parseFloat(aRate) >= parseFloat(bRate) ? 'A' : 'B';

            return (
              <div key={campaign.id} style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div className="flex justify-between items-center mb-3">
                  <strong>{campaign.name}</strong>
                  <span className="badge badge-success">Winner: Variant {winner}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', border: winner === 'A' ? '2px solid #22c55e' : '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <div className="text-sm text-muted mb-1">Variant A</div>
                    <div style={{ fontSize: '11px', marginBottom: '8px', color: 'var(--text-muted)' }}>{campaign.subject || 'Subject A'}</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{aRate}%</div>
                    <div className="text-sm text-muted">{aOpens} opens / {aSent} sent</div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '12px' }}>VS</div>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '8px', border: winner === 'B' ? '2px solid #22c55e' : '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <div className="text-sm text-muted mb-1">Variant B</div>
                    <div style={{ fontSize: '11px', marginBottom: '8px', color: 'var(--text-muted)' }}>{campaign.subjectB || 'Subject B'}</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7' }}>{bRate}%</div>
                    <div className="text-sm text-muted">{bOpens} opens / {bSent} sent</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New Campaign"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateCampaign}>
              <ArrowRight size={16} /> Continue to Composer
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Campaign Name *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Summer Newsletter"
            value={newCampaign.name}
            onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Select List</label>
          <select
            className="form-select"
            value={newCampaign.listId}
            onChange={(e) => setNewCampaign({ ...newCampaign, listId: e.target.value })}
          >
            <option value="">All Contacts</option>
            {lists.map(list => (
              <option key={list.id} value={list.id}>{list.name} ({list.contactCount})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Batch Size</label>
            <input
              type="number"
              className="form-input"
              value={newCampaign.batchSize}
              onChange={(e) => setNewCampaign({ ...newCampaign, batchSize: parseInt(e.target.value) })}
            />
            <small className="text-muted">Emails per batch</small>
          </div>
          <div className="form-group">
            <label className="form-label">Delay (minutes)</label>
            <input
              type="number"
              className="form-input"
              value={newCampaign.delayMinutes}
              onChange={(e) => setNewCampaign({ ...newCampaign, delayMinutes: parseInt(e.target.value) })}
            />
            <small className="text-muted">Between batches</small>
          </div>
        </div>
      </Modal>

      {/* Progress Modal */}
      <Modal
        isOpen={showProgressModal}
        onClose={() => {}}
        title="Sending Campaign"
        size="lg"
      >
        {progress && (
          <div>
            <div className="text-center mb-4">
              <div style={{
                width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 12px',
                background: `conic-gradient(var(--accent) ${getProgressPercent() * 3.6}deg, var(--bg-tertiary) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 'bold'
                }}>
                  {getProgressPercent()}%
                </div>
              </div>
              <div className="text-muted">
                {progress.status === 'waiting'
                  ? `Waiting ${progress.nextBatchIn} minutes before next batch...`
                  : progress.status === 'running'
                  ? `Sending to ${progress.currentEmail || '...'}`
                  : progress.status
                }
              </div>
            </div>

            <div className="progress-bar mb-4">
              <div
                className={`progress-fill ${progress.status === 'completed' ? 'success' : ''}`}
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#22c55e' }}>{progress.sent}</div>
                <div className="stat-label">Sent</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#ef4444' }}>{progress.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progress.total - progress.sent - progress.failed}</div>
                <div className="stat-label">Remaining</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#3b82f6' }}>
                  {progress.total > 0 ? Math.round(progress.sent / Math.max(1, (Date.now() - (progress.startedAt || Date.now())) / 60000)) : 0}
                </div>
                <div className="stat-label">Per Minute</div>
              </div>
            </div>

            <div className="flex justify-center gap-3 mt-4">
              {progress.status === 'running' && (
                <button className="btn btn-warning" onClick={handlePause}>
                  <Pause size={16} /> Pause
                </button>
              )}
              {progress.status === 'paused' && (
                <button className="btn btn-success" onClick={handleResume}>
                  <Play size={16} /> Resume
                </button>
              )}
              {(progress.status === 'running' || progress.status === 'paused' || progress.status === 'waiting') && (
                <button className="btn btn-danger" onClick={handleStop}>
                  <Square size={16} /> Stop
                </button>
              )}
              {(progress.status === 'completed' || progress.status === 'stopped') && (
                <button className="btn btn-primary" onClick={() => setShowProgressModal(false)}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Logs Modal with Filtering */}
      <Modal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        title={`Campaign Logs: ${selectedCampaign?.name}`}
        size="xl"
        footer={
          <button className="btn btn-secondary" onClick={() => setShowLogsModal(false)}>Close</button>
        }
      >
        {/* Log filter tabs */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${logFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setLogFilter('all')}
          >
            All ({campaignLogs.length})
          </button>
          <button
            className={`btn btn-sm ${logFilter === 'sent' ? 'btn-success' : 'btn-outline'}`}
            onClick={() => setLogFilter('sent')}
          >
            <CheckCircle size={12} /> Sent ({logCounts.sent})
          </button>
          <button
            className={`btn btn-sm ${logFilter === 'bounced' ? 'btn-warning' : 'btn-outline'}`}
            onClick={() => setLogFilter('bounced')}
          >
            <AlertTriangle size={12} /> Bounced ({logCounts.bounced})
          </button>
          <button
            className={`btn btn-sm ${logFilter === 'failed' ? 'btn-danger' : 'btn-outline'}`}
            onClick={() => setLogFilter('failed')}
          >
            <XCircle size={12} /> Failed ({logCounts.failed})
          </button>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            {campaignLogs.length === 0 ? 'No logs available yet.' : `No ${logFilter} logs found.`}
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.email}</td>
                    <td>
                      <span className={`badge ${log.status === 'sent' ? 'badge-success' : log.status === 'bounced' ? 'badge-warning' : 'badge-error'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{log.failureType || '-'}</td>
                    <td className="text-sm text-muted">
                      {new Date(log.sentAt).toLocaleString()}
                    </td>
                    <td className="text-sm text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.error || log.failureReason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Schedule Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title={`Schedule Campaign: ${selectedCampaign?.name}`}
      >
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
          <div className="flex items-center gap-2 text-sm">
            <Users size={16} style={{ color: 'var(--accent)' }} />
            <span>
              <strong>{selectedCampaign?.totalEmails || 0}</strong> recipients will receive this campaign
            </span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time</label>
            <input
              type="time"
              className="form-input"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
        </div>

        {scheduleDate && scheduleTime && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={18} style={{ color: 'var(--accent)' }} />
              <span>Campaign will start at:</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', marginLeft: '28px' }}>
              {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString(undefined, {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '28px', marginTop: '4px' }}>
              Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} ({new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()})
            </div>
          </div>
        )}

        {/* Quick schedule presets */}
        <div style={{ marginTop: '16px' }}>
          <div className="text-sm text-muted mb-2">Quick schedule:</div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {[
              { label: 'In 1 hour', hours: 1 },
              { label: 'Tomorrow 9 AM', preset: 'tomorrow9' },
              { label: 'Tomorrow 2 PM', preset: 'tomorrow14' },
              { label: 'Next Monday 10 AM', preset: 'nextMonday' },
            ].map(({ label, hours, preset }) => (
              <button
                key={label}
                className="btn btn-outline btn-sm"
                onClick={() => {
                  let d;
                  if (hours) {
                    d = new Date();
                    d.setHours(d.getHours() + hours);
                  } else if (preset === 'tomorrow9') {
                    d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(9, 0, 0, 0);
                  } else if (preset === 'tomorrow14') {
                    d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(14, 0, 0, 0);
                  } else if (preset === 'nextMonday') {
                    d = new Date();
                    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
                    d.setDate(d.getDate() + daysUntilMonday);
                    d.setHours(10, 0, 0, 0);
                  }
                  setScheduleDate(d.toISOString().split('T')[0]);
                  setScheduleTime(d.toTimeString().slice(0, 5));
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-outline" onClick={() => setShowScheduleModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSchedule}><Clock size={16} /> Schedule</button>
        </div>
      </Modal>
    </div>
  );
}

export default Campaigns;
