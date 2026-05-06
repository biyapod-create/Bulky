import React from 'react';
import { BarChart3, Calendar, Clock, Copy, Eye, Play, Search, Trash2 } from 'lucide-react';

export default function CampaignRowCard({
  campaign,
  statusCfg,
  progressPct,
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
  const openRate = campaign.sentEmails > 0
    ? (((campaign.openedEmails || 0) / campaign.sentEmails) * 100).toFixed(1)
    : null;
  const recipientTotal = Number(campaign.totalEmails || 0);
  const initial = (campaign.name || '?').charAt(0).toUpperCase();

  return (
    <div className="campaign-row-card">
      <div className={`campaign-row-avatar ${campaign.status || 'draft'}`}>
        {statusCfg.icon || initial}
      </div>
      <div className="campaign-row-main">
        <div className="campaign-row-title">
          <strong>{campaign.name}</strong>
          {campaign.isABTest && (
            <span className="badge badge-info" style={{ marginLeft: '8px', fontSize: '10px' }}>A/B</span>
          )}
        </div>
        <div className="campaign-row-meta">
          <span>{campaign.listName || 'All Contacts'}</span>
          <span>{recipientTotal.toLocaleString()} recipients</span>
          <span>{campaign.batchSize} per batch / {campaign.delayMinutes}m gap</span>
        </div>
        {campaign.subject && (
          <div className="text-sm text-muted" style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {campaign.subject}
          </div>
        )}
        <div className="campaign-row-progress" style={{ marginTop: '10px' }}>
          <div
            className={`campaign-row-progress-fill ${campaign.status}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="campaign-row-status">
        <span className={`badge ${statusCfg.className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {statusCfg.icon} {campaign.status}
        </span>
        {campaign.status === 'scheduled' && campaign.scheduledAt && (
          <div className="text-sm" style={{ marginTop: '6px', color: 'var(--accent)', fontSize: '11px' }}>
            {getTimeUntilScheduled(campaign.scheduledAt)}
          </div>
        )}
      </div>
      <div className="campaign-row-metrics">
        <div className="campaign-row-metric-value">
          {(campaign.sentEmails || 0).toLocaleString()}
          <span className="text-sm text-muted"> / {recipientTotal.toLocaleString()}</span>
        </div>
        <div className={`campaign-row-rate ${!openRate ? 'zero' : ''}`}>
          {openRate ? `${openRate}% open rate` : 'No open data yet'}
        </div>
        {campaign.failedEmails > 0 && (
          <div className="text-sm" style={{ color: 'var(--error)', fontSize: '11px', marginTop: '6px' }}>
            {campaign.failedEmails} failed
          </div>
        )}
      </div>
      <div className="campaign-row-actions">
        {campaign.content && (
          <button
            className="btn btn-outline btn-icon btn-sm"
            onClick={() => onPreview(campaign)}
            title="Preview Email"
          >
            <Eye size={14} />
          </button>
        )}
        {campaign.status === 'draft' && (
          <>
            <button
              className="btn btn-success btn-icon btn-sm"
              onClick={() => onStart(campaign)}
              title="Start Now"
            >
              <Play size={14} />
            </button>
            <button
              className="btn btn-outline btn-icon btn-sm"
              onClick={() => onSchedule(campaign)}
              title="Schedule"
            >
              <Calendar size={14} />
            </button>
          </>
        )}
        {campaign.status === 'scheduled' && (
          <button
            className="btn btn-warning btn-icon btn-sm"
            onClick={() => onCancelSchedule(campaign.id)}
            title="Cancel Schedule"
          >
            <Clock size={14} />
          </button>
        )}
        <button
          className="btn btn-outline btn-icon btn-sm"
          onClick={() => onDuplicate(campaign)}
          title="Duplicate"
        >
          <Copy size={14} />
        </button>
        <button
          className="btn btn-outline btn-icon btn-sm"
          onClick={() => onAnalytics(campaign.id)}
          title="Analytics"
        >
          <BarChart3 size={14} />
        </button>
        <button
          className="btn btn-outline btn-icon btn-sm"
          onClick={() => onViewLogs(campaign)}
          title="View Logs"
        >
          <Search size={14} />
        </button>
        <button
          className="btn btn-outline btn-icon btn-sm"
          onClick={() => onDelete(campaign.id)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
