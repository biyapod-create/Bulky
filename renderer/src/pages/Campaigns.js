import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle, Clock, Pause, Play, Square } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';
import {
  CampaignLogsModal,
  CampaignPreviewModal,
  CampaignProgressModal,
  CampaignScheduleModal,
  CreateCampaignModal
} from '../features/campaigns/CampaignsModals';
import {
  AbTestResultsSection,
  CampaignsFilterToolbar,
  CampaignsHeader,
  CampaignsInsightCards,
  CampaignsListCard,
  CampaignsSummaryCards
} from '../features/campaigns/CampaignsSurfaceSections';
import { getPrimarySmtpAccount } from '../utils/smtpAccounts';
import { buildEmailPreviewUrl } from '../utils/emailPreview';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';
const { applyPreviewPersonalization, evaluateContentReadiness } = require('../utils/contentReadiness');

const ACTIVE_CAMPAIGN_STORAGE_KEY = 'bulky_active_campaign_snapshot';

function publishActiveCampaignSnapshot(snapshot) {
  try {
    if (!snapshot || snapshot.status === 'completed' || snapshot.status === 'stopped') {
      localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, JSON.stringify({
        ...snapshot,
        updatedAt: new Date().toISOString()
      }));
    }
    window.dispatchEvent(new CustomEvent('bulky:active-campaign'));
  } catch {}
}

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
  const selectedCampaignRef = React.useRef(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    listId: '',
    batchSize: 50,
    delayMinutes: 10
  });

  useEffect(() => {
    selectedCampaignRef.current = selectedCampaign;
  }, [selectedCampaign]);

  // useCallback so onDataChanged always calls the current version (no stale closure)
  const loadData = useCallback(async (overrides = {}) => {
    // Silent refreshes (background data-change / poll) skip the loading spinner
    if (!overrides.silent) setLoading(true);
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
        publishActiveCampaignSnapshot({
          id: selectedCampaignRef.current?.id,
          name: selectedCampaignRef.current?.name || data.campaignName,
          status: data.status,
          sent: data.sent || 0,
          failed: data.failed || 0,
          bounced: data.bounced || 0,
          total: data.total || 0,
          currentEmail: data.currentEmail || ''
        });
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
          publishActiveCampaignSnapshot(null);
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

  const sortOptions = [
    { value: 'createdAt', label: 'Newest First' },
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'sentEmails', label: 'Sent Volume' }
  ];

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
      if (!smtpSettings?.host && window.electron.smtp?.get) {
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

      const [deliverabilityInfo, smtpAccounts, dashboardData] = await Promise.all([
        window.electron.settings?.getDeliverability?.() || Promise.resolve({}),
        window.electron.smtpAccounts?.getAll?.() || Promise.resolve([]),
        window.electron.stats?.getDashboard?.() || Promise.resolve({})
      ]);
      const readiness = evaluateContentReadiness({
        subject: [campaign.subject, campaign.subjectB].filter(Boolean).join('\n'),
        content: [campaign.content, campaign.contentB].filter(Boolean).join('\n'),
        spamScore: null,
        recipientBreakdown: { total: contacts.length, valid: contacts.length },
        deliverabilityInfo,
        smtpAccounts,
        smtpSettings,
        smtpHealth: Array.isArray(dashboardData?.smtpHealth) ? dashboardData.smtpHealth : []
      });
      if (readiness.blockers.length > 0) {
        addToast(`Campaign not ready: ${readiness.blockers[0]}`, 'error');
        return;
      }
      if (readiness.warnings.length > 0) {
        addToast(`Preflight warning: ${readiness.warnings[0]}`, 'warning');
      }

      setSelectedCampaign(campaign);
      setShowProgressModal(true);
      setDeliveryLog([]);
      setProgress({ status: 'starting', total: contacts.length, sent: 0, failed: 0, bounced: 0, skipped: 0 });
      publishActiveCampaignSnapshot({
        id: campaign.id,
        name: campaign.name,
        status: 'starting',
        sent: 0,
        failed: 0,
        bounced: 0,
        total: contacts.length,
        currentEmail: ''
      });

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
      publishActiveCampaignSnapshot(null);
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

      let html = applyPreviewPersonalization(campaign.content || '');
      let subj = applyPreviewPersonalization(campaign.subject || '');
      const sampleFullName = `${sampleContact.firstName || ''} ${sampleContact.lastName || ''}`.trim() || 'John Doe';
      html = html
        .replace(/John Doe/g, sampleFullName)
        .replace(/john@example\.com/gi, sampleContact.email || 'john@example.com')
        .replace(/Acme Inc/g, sampleContact.company || 'Acme Inc');
      subj = subj
        .replace(/John Doe/g, sampleFullName)
        .replace(/john@example\.com/gi, sampleContact.email || 'john@example.com')
        .replace(/Acme Inc/g, sampleContact.company || 'Acme Inc');

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
      scheduled: { className: 'badge-info', icon: <Clock size={12} />, color: '#5bb4d4' },
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
    <div className="page-container page-campaigns">
      <CampaignsHeader
        autoRefreshEnabled={autoRefreshEnabled}
        lastUpdatedAt={lastUpdatedAt}
        onToggleAutoRefresh={() => setAutoRefreshEnabled((prev) => !prev)}
        onRefresh={loadData}
        onCreate={() => setShowCreateModal(true)}
      />

      {/* Performance Summary Cards */}
      {campaigns.length > 0 && (
        <CampaignsSummaryCards summary={summary} />
      )}

      {campaigns.length > 0 && (
        <CampaignsInsightCards
          runningCampaigns={runningCampaigns}
          nextScheduledCampaign={nextScheduledCampaign}
          getTimeUntilScheduled={getTimeUntilScheduled}
          progress={progress}
          liveFailureRate={liveFailureRate}
          deliveryPressure={deliveryPressure}
          summary={summary}
          deliveryLog={deliveryLog}
        />
      )}

      {/* Search and Filter Bar */}
      {campaigns.length > 0 && (
        <CampaignsFilterToolbar
          campaignsCount={campaigns.length}
          filteredCount={filteredCampaigns.length}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortField={sortField}
          setSortField={setSortField}
          sortDir={sortDir}
          setSortDir={setSortDir}
          sortOptions={sortOptions}
        />
      )}

      {/* Campaign Cards / Table */}
      <CampaignsListCard
        loading={loading}
        campaigns={campaigns}
        filteredCampaigns={filteredCampaigns}
        onCreate={() => setShowCreateModal(true)}
        getStatusConfig={getStatusConfig}
        getCampaignProgress={getCampaignProgress}
        getTimeUntilScheduled={getTimeUntilScheduled}
        onPreview={handlePreview}
        onStart={handleStartCampaign}
        onSchedule={openScheduleModal}
        onCancelSchedule={handleCancelSchedule}
        onDuplicate={handleDuplicate}
        onAnalytics={(campaignId) => navigate(`/analytics/${campaignId}`)}
        onViewLogs={handleViewLogs}
        onDelete={handleDelete}
      />

      {/* A/B Test Results (shown for completed A/B campaigns) */}
      <AbTestResultsSection campaigns={filteredCampaigns} />

      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        newCampaign={newCampaign}
        setNewCampaign={setNewCampaign}
        lists={lists}
        onContinue={handleCreateCampaign}
      />

      <CampaignProgressModal
        isOpen={showProgressModal}
        progress={progress}
        deliveryLog={deliveryLog}
        elapsedSecs={elapsedSecs}
        getProgressPercent={getProgressPercent}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onClose={() => setShowProgressModal(false)}
      />

      <CampaignLogsModal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        selectedCampaign={selectedCampaign}
        logFilter={logFilter}
        setLogFilter={setLogFilter}
        campaignLogs={campaignLogs}
        logCounts={logCounts}
        filteredLogs={filteredLogs}
      />

      <CampaignScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        selectedCampaign={selectedCampaign}
        scheduleDate={scheduleDate}
        setScheduleDate={setScheduleDate}
        scheduleTime={scheduleTime}
        setScheduleTime={setScheduleTime}
        onSchedule={handleSchedule}
      />

      <CampaignPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        previewSubject={previewSubject}
        previewUrl={previewUrl}
      />
    </div>
  );
}

export default Campaigns;
