import React from 'react';
import { ExternalLink, FileText, FlaskConical, Save } from 'lucide-react';

export default function ComposerHeader({
  handleOpenInBuilder,
  handleSaveAsTemplate,
  handleSaveCampaign,
  onTestSend,
  recipientCount,
  recipientMode,
  activeSmtpCount,
  smtpAccountsCount,
  spamScore,
  readinessTone,
  readinessLabel
}) {
  return (
    <>
      <div className="page-header bulky-page-header">
        <div>
          <h1 className="page-title">Email Composer</h1>
          <p className="page-subtitle">Create and design your email content.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-outline" onClick={handleOpenInBuilder} title="Open in Template Builder">
            <ExternalLink size={16} /> Open in Builder
          </button>
          <button className="btn btn-outline" onClick={handleSaveAsTemplate}>
            <FileText size={16} /> Save as Template
          </button>
          <button className="btn btn-outline" onClick={onTestSend} title="Send a test email to yourself">
            <FlaskConical size={16} /> Test Send
          </button>
          <button className="btn btn-primary" onClick={handleSaveCampaign}>
            <Save size={16} /> Save Campaign
          </button>
        </div>
      </div>

      <div className="composer-summary-grid">
        <div className="operator-kpi-card tone-accent">
          <div className="operator-kpi-label">Recipients</div>
          <div className="operator-kpi-value">{recipientCount.toLocaleString()}</div>
          <div className="operator-kpi-meta">
            {recipientMode === 'manual' ? 'Locked individual list' : recipientMode === 'list' ? 'List-driven audience' : 'All active contacts'}
          </div>
        </div>
        <div className="operator-kpi-card tone-success">
          <div className="operator-kpi-label">Active SMTPs</div>
          <div className="operator-kpi-value">{activeSmtpCount}</div>
          <div className="operator-kpi-meta">{smtpAccountsCount > 0 ? `${smtpAccountsCount} configured total` : 'No SMTP accounts configured yet'}</div>
        </div>
        <div className={`operator-kpi-card tone-${spamScore && Number(spamScore.score) >= 80 ? 'success' : spamScore && Number(spamScore.score) >= 60 ? 'accent' : spamScore && Number(spamScore.score) >= 40 ? 'warning' : spamScore ? 'error' : 'accent'}`}>
          <div className="operator-kpi-label">Spam Score</div>
          <div className="operator-kpi-value">{spamScore ? spamScore.score : '--'}</div>
          <div className="operator-kpi-meta">{spamScore ? spamScore.rating : 'Run automatically while you compose'}</div>
        </div>
        <div className={`operator-kpi-card tone-${readinessTone}`}>
          <div className="operator-kpi-label">Readiness</div>
          <div className="operator-kpi-value">{readinessLabel}</div>
          <div className="operator-kpi-meta">Merge tags, recipients, and deliverability checks</div>
        </div>
      </div>
    </>
  );
}
