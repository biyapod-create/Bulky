import React from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Filter,
  Plus,
  Search,
  Send,
  Zap
} from 'lucide-react';
import CampaignRowCard from './CampaignRowCard';

export function CampaignsHeader({
  autoRefreshEnabled,
  lastUpdatedAt,
  onToggleAutoRefresh,
  onRefresh,
  onCreate
}) {
  return (
    <div className="page-header bulky-page-header">
      <div>
        <h1 className="page-title">Campaigns</h1>
        <p className="page-subtitle">Create and manage your email campaigns.</p>
        <div className="page-header-meta">
          <span className={`badge badge-${autoRefreshEnabled ? 'success' : 'default'}`}>
            {autoRefreshEnabled ? 'Live refresh on' : 'Live refresh off'}
          </span>
          {lastUpdatedAt && (
            <span className="text-sm text-muted">Last updated {lastUpdatedAt.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
      <div className="page-header-actions">
        <button className="btn btn-outline" onClick={onToggleAutoRefresh}>
          {autoRefreshEnabled ? 'Pause Live' : 'Resume Live'}
        </button>
        <button className="btn btn-outline" onClick={onRefresh}>
          <Clock size={16} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={onCreate}>
          <Plus size={18} /> New Campaign
        </button>
      </div>
    </div>
  );
}

export function CampaignsSummaryCards({ summary }) {
  return (
    <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
      <div className="stat-card">
        <div className="stat-icon" style={{ color: 'var(--accent)' }}><Send size={22} /></div>
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
        <div className="stat-icon" style={{ color: 'var(--accent)' }}><Zap size={22} /></div>
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
  );
}

export function CampaignsInsightCards({
  runningCampaigns,
  nextScheduledCampaign,
  getTimeUntilScheduled,
  progress,
  liveFailureRate,
  deliveryPressure,
  summary,
  deliveryLog
}) {
  return (
    <div className="panel-grid mb-4">
      <div className="insight-card">
        <div className="insight-value">{runningCampaigns.length}</div>
        <div className="insight-label">Live Operations</div>
        <div className="insight-meta">
          {runningCampaigns.length > 0
            ? `${runningCampaigns.filter((campaign) => campaign.status === 'running').length} running and ${runningCampaigns.filter((campaign) => campaign.status === 'paused').length} paused right now`
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
  );
}

export function CampaignsFilterToolbar({
  campaignsCount,
  filteredCount,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  sortOptions
}) {
  return (
    <div className="card filter-toolbar-card mb-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search campaigns by name or subject..."
            style={{ paddingLeft: '36px' }}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form-select"
            style={{ width: '160px' }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
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
        <select
          className="form-select"
          style={{ width: '160px' }}
          value={sortField}
          onChange={(event) => setSortField(event.target.value)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')}>
          {sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {sortDir === 'asc' ? 'Ascending' : 'Descending'}
        </button>
        <div className="text-sm text-muted" style={{ whiteSpace: 'nowrap' }}>
          {filteredCount} of {campaignsCount}
        </div>
      </div>
    </div>
  );
}

export function CampaignsListCard({
  loading,
  campaigns,
  filteredCampaigns,
  onCreate,
  getStatusConfig,
  getCampaignProgress,
  getTimeUntilScheduled,
  onPreview,
  onStart,
  onSchedule,
  onCancelSchedule,
  onDuplicate,
  onAnalytics,
  onViewLogs,
  onDelete
}) {
  return (
    <div className="card dense-data-card">
      {loading ? (
        <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <Send className="empty-state-icon" />
          <h3 className="empty-state-title">No campaigns yet</h3>
          <p className="empty-state-text">Create your first campaign to start sending emails.</p>
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={16} /> Create Campaign
          </button>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="text-center text-muted" style={{ padding: '40px' }}>
          No campaigns match your search criteria.
        </div>
      ) : (
        <div className="campaign-rows-list">
          {filteredCampaigns.map((campaign) => (
            <CampaignRowCard
              key={campaign.id}
              campaign={campaign}
              statusCfg={getStatusConfig(campaign.status)}
              progressPct={getCampaignProgress(campaign)}
              getTimeUntilScheduled={getTimeUntilScheduled}
              onPreview={onPreview}
              onStart={onStart}
              onSchedule={onSchedule}
              onCancelSchedule={onCancelSchedule}
              onDuplicate={onDuplicate}
              onAnalytics={onAnalytics}
              onViewLogs={onViewLogs}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AbTestResultsSection({ campaigns }) {
  const abCampaigns = campaigns.filter((campaign) => campaign.isABTest && campaign.status === 'completed');
  if (abCampaigns.length === 0) {
    return null;
  }

  return (
    <div className="card mt-4">
      <h3 className="card-title mb-4"><Zap size={18} style={{ marginRight: '8px' }} /> A/B Test Results</h3>
      {abCampaigns.map((campaign) => {
        const aOpens = campaign.openedEmailsA || 0;
        const bOpens = campaign.openedEmailsB || 0;
        const aSent = campaign.sentEmailsA || Math.floor((campaign.sentEmails || 0) / 2);
        const bSent = campaign.sentEmailsB || Math.ceil((campaign.sentEmails || 0) / 2);
        const aRate = aSent > 0 ? ((aOpens / aSent) * 100).toFixed(1) : '0.0';
        const bRate = bSent > 0 ? ((bOpens / bSent) * 100).toFixed(1) : '0.0';
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
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent)' }}>{bRate}%</div>
                <div className="text-sm text-muted">{bOpens} opens / {bSent} sent</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
