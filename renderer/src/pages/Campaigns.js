import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Play, Pause, Square, Trash2, Eye, Send, BarChart3, Copy, Clock, Calendar, Search, Filter, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Zap, Users, ArrowRight } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';
import { getPrimarySmtpAccount } from '../utils/smtpAccounts';
import { buildEmailPreviewUrl } from '../utils/emailPreview';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';

function Campaigns({ isActive }) {
  const { addToast } = useToast();
  const { navigateTo } = useNavigation();
  const navigate = (path, opts) => navigateTo(path, opts?.state || {});
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [deliveryLog, setDeliveryLog] = useState([]);
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const sendStartRef = React.useRef(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    listId: '',
    batchSize: 50,
    delayMinutes: 10
  });

  // useCallback so onDataChanged always calls the current version (no stale closure)
  const loadData = useCallback(async () => {
    try {
      if (window.electron) {
        const [campaignsData, listsData] = await Promise.all([
          window.electron.campaigns.getAll(),
          window.electron.lists.getAll()
        ]);
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
        setLists(Array.isArray(listsData) ? listsData : []);
        setLastUpdatedAt(new Date());
      }
    } catch (error) {
      addToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
    let cleanup;
    if (window.electron?.email?.onProgress) {
      cleanup = window.electron.email.onProgress((data) => {
        setProgress(data);
        // Accumulate delivery log entries
        if (data.lastResult && data.currentEmail) {
          setDeliveryLog(prev => {
            const entry = {
              email: data.currentEmail,
              status: data.lastResult.status,
              reason: data.lastResult.failureReason || '',
              smtpCode: data.lastResult.smtpCode,
              time: new Date().toLocaleTimeString()
            };
            const updated = [entry, ...prev];
            return updated.slice(0, 100); // Keep last 100
          });
        }
        if (data.status === 'completed' || data.status === 'stopped') {
          loadData();
          // Push notification
          if (window.__bulkyNotify) {
            window.__bulkyNotify({
              type: 'campaign_complete',
              title: data.status === 'completed' ? 'Campaign Completed' : 'Campaign Stopped',
              message: `${data.sent || 0} delivered, ${data.failed || 0} failed`
            });
          }
        }
      });
    }
    return () => {
      if (cleanup) cleanup();
      else if (window.electron?.email?.removeProgressListener) {
        window.electron.email.removeProgressListener();
      }
    };
  }, [loadData]);

  useLiveDataRefresh({
    load: loadData,
    isActive,
    dataTypes: ['campaigns', 'contacts'],
    pollMs: autoRefreshEnabled ? 30000 : 0
  });

  // Elapsed-time counter for the progress modal
  useEffect(() => {
    if (showProgressModal && progress?.status === 'running') {
      if (!sendStartRef.current) sendStartRef.current = Date.now();
      const id = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - sendStartRef.current) / 1000));
      }, 1000);
      return () => clearInterval(id);
    }
    if (!showProgressModal) { sendStartRef.current = null; setElapsedSecs(0); }
  }, [showProgressModal, progress?.status]);

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

  const previewUrl = useMemo(() => buildEmailPreviewUrl({
    subject: previewSubject,
    content: previewHtml,
    clientLabel: 'Campaign Preview',
    clientStyle: {
      fontFamily: 'Arial, sans-serif',
      background: '#f3f4f6',
      accent: '#5b6cf0'
    }
  }), [previewHtml, previewSubject]);

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
      // Prefer active multi-account SMTP; fall back to legacy single SMTP
      let smtpSettings = null;
      const hasMultiAccountApi = !!window.electron.smtpAccounts?.getActive;
      if (hasMultiAccountApi) {
        const active = await window.electron.smtpAccounts.getActive();
        smtpSettings = getPrimarySmtpAccount(active, { activeOnly: true });
      }
      if (!smtpSettings?.host && !hasMultiAccountApi) {
        smtpSettings = await window.electron.smtp.get();
      }
      if (!smtpSettings?.host) {
        addToast('Please configure SMTP settings first', 'error');
        navigate('/settings');
        return;
      }

      let contacts = [];
      const manualEmails = parseManualEmails(campaign.manualEmails);

      if (manualEmails.length > 0) {
        const contactsResult = await window.electron.contacts.getForCampaign({ emails: manualEmails });
        const matchedContacts = Array.isArray(contactsResult) ? contactsResult : [];
        const matchedContactsByEmail = new Map(
          matchedContacts.map((contact) => [String(contact.email || '').toLowerCase(), contact])
        );

        contacts = manualEmails.map((email, index) => {
          const matchedContact = matchedContactsByEmail.get(email);
          return matchedContact || {
            id: `manual-${campaign.id}-${index}`,
            email,
            firstName: '',
            lastName: '',
            company: '',
            tags: []
          };
        });
      } else {
        const filter = { listId: campaign.listId || '' };
        // Composer stores tag filters in `tagFilter` (DB column).
        // Keep backward-compatibility with older `selectedTags` payloads.
        let tags = null;
        if (campaign.tagFilter) {
          try {
            tags = JSON.parse(campaign.tagFilter);
          } catch (e) {
            tags = null;
          }
        }
        if (!Array.isArray(tags) && campaign.selectedTags) {
          try {
            tags = JSON.parse(campaign.selectedTags);
          } catch (e) {
            tags = null;
          }
        }
        if (Array.isArray(tags) && tags.length > 0) {
          filter.tags = tags;
        }

        const contactsResult = await window.electron.contacts.getForCampaign(filter);
        contacts = Array.isArray(contactsResult) ? contactsResult : [];
      }
      if (contacts.length === 0) {
        addToast('No contacts to send to', 'error');
        return;
      }

      setSelectedCampaign(campaign);
      setShowProgressModal(true);
      setDeliveryLog([]);
      setProgress({ status: 'starting', total: contacts.length, sent: 0, failed: 0, bounced: 0, skipped: 0 });

      await window.electron.email.send({ campaign, contacts, settings: smtpSettings });
    } catch (error) {
      addToast('Failed to start campaign', 'error');
    }
  };

  const handlePause = async () => {
    try {
      await window.electron.email.pause();
      addToast('Campaign paused', 'info');
    } catch (error) {
      addToast('Failed to pause campaign', 'error');
    }
  };

  const handleResume = async () => {
    try {
      await window.electron.email.resume();
      addToast('Campaign resumed', 'info');
    } catch (error) {
      addToast('Failed to resume campaign', 'error');
    }
  };

  const handleStop = async () => {
    try {
      await window.electron.email.stop();
      addToast('Campaign stopped', 'warning');
      setShowProgressModal(false);
    } catch (error) {
      addToast('Failed to stop campaign', 'error');
    }
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
        manualEmails: campaign.manualEmails,
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

  const handlePreview = async (campaign) => {
    try {
      let sampleContact = { email: 'test@example.com', firstName: 'John', lastName: 'Doe' };
      const manualEmails = parseManualEmails(campaign.manualEmails);

      if (manualEmails.length > 0) {
        const contactsResult = await window.electron.contacts.getForCampaign({ emails: manualEmails });
        const contacts = Array.isArray(contactsResult) ? contactsResult : [];
        sampleContact = contacts[0] || { ...sampleContact, email: manualEmails[0] };
      } else {
        const filter = { listId: campaign.listId || '' };
        const contactsResult = await window.electron.contacts.getForCampaign(filter);
        const contacts = Array.isArray(contactsResult) ? contactsResult : [];
        sampleContact = contacts[0] || sampleContact;
      }

      // Simple personalization preview
      let html = campaign.content || '';
      let subj = campaign.subject || '';
      const replacements = {
        '{{email}}': sampleContact.email,
        '{{firstName}}': sampleContact.firstName || '',
        '{{lastName}}': sampleContact.lastName || '',
        '{{fullName}}': `${sampleContact.firstName || ''} ${sampleContact.lastName || ''}`.trim(),
        '{{company}}': sampleContact.company || '',
        '{{unsubscribeLink}}': '#unsubscribe',
        '{{unsubscribeUrl}}': '#unsubscribe'
      };
      for (const [key, val] of Object.entries(replacements)) {
        html = html.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'gi'), val);
        subj = subj.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'gi'), val);
      }

      setPreviewHtml(html);
      setPreviewSubject(subj);
      setShowPreviewModal(true);
    } catch (err) {
      addToast('Preview failed: ' + err.message, 'error');
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
    return Math.round(((progress.sent + progress.failed + (progress.bounced || 0)) / progress.total) * 100);
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

  const runningCampaigns = useMemo(() => campaigns.filter(c => c.status === 'running' || c.status === 'paused'), [campaigns]);
  const nextScheduledCampaign = useMemo(() => {
    return campaigns
      .filter(c => c.status === 'scheduled' && c.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
  }, [campaigns]);
  const liveFailureRate = useMemo(() => {
    const attempted = Number(progress?.sent || 0) + Number(progress?.failed || 0) + Number(progress?.bounced || 0);
    if (attempted <= 0) return 0;
    return Math.round((((Number(progress?.failed || 0) + Number(progress?.bounced || 0)) / attempted) * 100));
  }, [progress]);
  const deliveryPressure = summary.totalSent > 0
    ? Math.round((summary.totalFailed / Math.max(summary.totalSent, 1)) * 100)
    : 0;
  const parseManualEmails = useCallback((value) => {
    return [...new Set(
      String(value || '')
        .split(/[\n,;]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )];
  }, []);

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Create and manage your email campaigns.</p>
          <div className="flex gap-2 items-center" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
            <span className={`badge badge-${autoRefreshEnabled ? 'success' : 'default'}`}>
              {autoRefreshEnabled ? 'Live refresh on' : 'Live refresh off'}
            </span>
            {lastUpdatedAt && (
              <span className="text-sm text-muted">Last updated {lastUpdatedAt.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => setAutoRefreshEnabled(prev => !prev)}>
            {autoRefreshEnabled ? 'Pause Live' : 'Resume Live'}
          </button>
          <button className="btn btn-outline" onClick={loadData}>
            <Clock size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} /> New Campaign
          </button>
        </div>
      </div>

      {/* Performance Summary Cards */}
      {campaigns.length > 0 && (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: '#6366f1' }}><Send size={22} /></div>
            <div className="stat-content">
              <div className="stat-value">{(summary.totalSent || 0).toLocaleString()}</div>
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

      {campaigns.length > 0 && (
        <div className="panel-grid mb-4">
          <div className="insight-card">
            <div className="insight-value">{runningCampaigns.length}</div>
            <div className="insight-label">Live Operations</div>
            <div className="insight-meta">
              {runningCampaigns.length > 0
                ? `${runningCampaigns.filter(c => c.status === 'running').length} running and ${runningCampaigns.filter(c => c.status === 'paused').length} paused right now`
                : 'No campaign is actively sending right now'}
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-value">{nextScheduledCampaign ? getTimeUntilScheduled(nextScheduledCampaign.scheduledAt) : '--'}</div>
            <div className="insight-label">Next Scheduled Start</div>
            <div className="insight-meta">
              {nextScheduledCampaign
                ? `${nextScheduledCampaign.name} is the next queued campaign`
                : 'No scheduled campaigns are waiting in the queue'}
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-value">{progress?.status === 'running' || progress?.status === 'paused' || progress?.status === 'waiting' ? `${liveFailureRate}%` : `${deliveryPressure}%`}</div>
            <div className="insight-label">Failure Pressure</div>
            <div className="insight-meta">
              {progress?.status
                ? `Live run status: ${progress.status} with ${(progress.failed || 0) + (progress.bounced || 0)} unsuccessful attempts so far`
                : `${summary.totalFailed.toLocaleString()} failed deliveries across recorded campaigns`}
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-value">{deliveryLog.length}</div>
            <div className="insight-label">Recent Activity Feed</div>
            <div className="insight-meta">
              {deliveryLog.length > 0
                ? `${deliveryLog[0].status} for ${deliveryLog[0].email}`
                : 'Start or inspect a campaign to see live delivery activity here'}
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
                          {/* Preview button for any campaign with content */}
                          {campaign.content && (
                            <button
                              className="btn btn-outline btn-icon btn-sm"
                              onClick={() => handlePreview(campaign)}
                              title="Preview Email"
                            >
                              <Eye size={14} />
                            </button>
                          )}
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
              {progress.status === 'running' && elapsedSecs > 0 && (() => {
                const done = (progress.sent || 0) + (progress.failed || 0) + (progress.bounced || 0);
                const remaining = (progress.total || 0) - done;
                const rate = done > 0 ? done / elapsedSecs : 0;
                const etaSecs = rate > 0 ? Math.ceil(remaining / rate) : 0;
                const fmt = (s) => s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
                return (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Elapsed: {fmt(elapsedSecs)}
                    {etaSecs > 0 && ` · ETA: ~${fmt(etaSecs)}`}
                    {rate > 0 && ` · ${rate.toFixed(1)}/s`}
                  </div>
                );
              })()}
            </div>

            <div className="progress-bar mb-4">
              <div
                className={`progress-fill ${progress.status === 'completed' ? 'success' : ''}`}
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#22c55e' }}>{progress.sent}</div>
                <div className="stat-label">Delivered</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#f59e0b' }}>{progress.bounced || 0}</div>
                <div className="stat-label">Bounced</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#ef4444' }}>{progress.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progress.total - progress.sent - progress.failed - (progress.bounced || 0)}</div>
                <div className="stat-label">Remaining</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#6b7280' }}>{progress.skipped || 0}</div>
                <div className="stat-label">Skipped</div>
              </div>
            </div>

            {/* Delivery Summary when completed */}
            {(progress.status === 'completed' || progress.status === 'stopped') && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Delivery Summary</h4>
                <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                  <div><CheckCircle size={13} style={{ color: '#22c55e', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.sent}</strong> delivered successfully</div>
                  {(progress.bounced || 0) > 0 && <div><AlertTriangle size={13} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.bounced}</strong> bounced (auto-blacklisted after 2 hard bounces)</div>}
                  {progress.failed > 0 && <div><XCircle size={13} style={{ color: '#ef4444', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.failed}</strong> failed</div>}
                  {(progress.skipped || 0) > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Skipped: {progress.skippedReasons?.blacklisted || 0} blacklisted, {progress.skippedReasons?.unsubscribed || 0} unsubscribed, {progress.skippedReasons?.bounced || 0} previously bounced
                  </div>}
                </div>
              </div>
            )}

            {/* Live Delivery Feed */}
            {deliveryLog.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Live Activity</h4>
                <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-primary)' }}>
                  {deliveryLog.slice(0, 20).map((entry, i) => (
                    <div key={i} style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      {entry.status === 'sent' && <CheckCircle size={12} style={{ color: '#22c55e', flexShrink: 0 }} />}
                      {entry.status === 'bounced' && <AlertTriangle size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                      {entry.status === 'soft_bounce' && <AlertTriangle size={12} style={{ color: '#f97316', flexShrink: 0 }} />}
                      {(entry.status === 'failed' || !['sent','bounced','soft_bounce'].includes(entry.status)) && <XCircle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.email}</span>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 500,
                        background: entry.status === 'sent' ? '#dcfce7' : entry.status === 'bounced' ? '#fef3c7' : '#fee2e2',
                        color: entry.status === 'sent' ? '#166534' : entry.status === 'bounced' ? '#92400e' : '#991b1b',
                      }}>{entry.status === 'sent' ? 'Delivered' : entry.status === 'bounced' ? 'Bounced' : entry.status === 'soft_bounce' ? 'Soft Bounce' : 'Failed'}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{entry.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
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

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={`Preview: ${previewSubject}`}
        size="lg"
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            <strong>Subject:</strong> {previewSubject}
          </div>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#fff',
            maxHeight: 500,
            overflow: 'auto'
          }}>
            <iframe
              src={previewUrl}
              title="Email Preview"
              style={{ width: '100%', minHeight: 400, border: 'none' }}
              sandbox=""
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Preview uses data from the first contact in the selected list.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default Campaigns;
