import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Square, Trash2, Eye, Send } from 'lucide-react';
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
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    listId: '',
    batchSize: 50,
    delayMinutes: 10
  });

  useEffect(() => {
    loadData();
    
    // Listen for progress updates
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
        setCampaigns(campaignsData || []);
        setLists(listsData || []);
      }
    } catch (error) {
      addToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = () => {
    if (!newCampaign.name) {
      addToast('Campaign name is required', 'error');
      return;
    }
    // Navigate to composer with campaign settings
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

      const contacts = campaign.listId 
        ? await window.electron.lists.getContacts(campaign.listId)
        : await window.electron.contacts.getAll();

      if (contacts.length === 0) {
        addToast('No contacts to send to', 'error');
        return;
      }

      setSelectedCampaign(campaign);
      setShowProgressModal(true);
      setProgress({ status: 'starting', total: contacts.length, sent: 0, failed: 0 });

      await window.electron.email.send({
        campaign,
        contacts,
        settings: smtpSettings
      });
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
      setCampaignLogs(logs || []);
      setSelectedCampaign(campaign);
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

  const getProgressPercent = () => {
    if (!progress || !progress.total) return 0;
    return Math.round(((progress.sent + progress.failed) / progress.total) * 100);
  };

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
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Throttle</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(campaign => (
                  <tr key={campaign.id}>
                    <td><strong>{campaign.name}</strong></td>
                    <td>{campaign.listName || 'All Contacts'}</td>
                    <td>
                      <span className={`badge ${getStatusBadge(campaign.status)}`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="progress-bar" style={{ width: '100px' }}>
                          <div 
                            className="progress-fill"
                            style={{ 
                              width: campaign.totalEmails > 0 
                                ? `${(campaign.sentEmails / campaign.totalEmails) * 100}%` 
                                : '0%' 
                            }}
                          />
                        </div>
                        <span className="text-sm text-muted">
                          {campaign.sentEmails}/{campaign.totalEmails}
                        </span>
                      </div>
                    </td>
                    <td className="text-sm text-muted">
                      {campaign.batchSize} / {campaign.delayMinutes}min
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {campaign.status === 'draft' && (
                          <button 
                            className="btn btn-success btn-icon btn-sm"
                            onClick={() => handleStartCampaign(campaign)}
                            title="Start"
                          >
                            <Play size={14} />
                          </button>
                        )}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New Campaign"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateCampaign}>Continue to Composer</button>
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
              <div className="stat-value">{getProgressPercent()}%</div>
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

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat-card">
                <div className="stat-value">{progress.sent}</div>
                <div className="stat-label">Sent</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progress.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progress.total - progress.sent - progress.failed}</div>
                <div className="stat-label">Remaining</div>
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

      {/* Logs Modal */}
      <Modal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        title={`Campaign Logs: ${selectedCampaign?.name}`}
        size="lg"
        footer={
          <button className="btn btn-secondary" onClick={() => setShowLogsModal(false)}>Close</button>
        }
      >
        {campaignLogs.length === 0 ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            No logs available yet.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {campaignLogs.map(log => (
                  <tr key={log.id}>
                    <td>{log.email}</td>
                    <td>
                      <span className={`badge ${log.status === 'sent' ? 'badge-success' : 'badge-error'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="text-sm text-muted">
                      {new Date(log.sentAt).toLocaleString()}
                    </td>
                    <td className="text-sm text-muted">{log.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Campaigns;
