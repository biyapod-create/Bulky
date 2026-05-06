import React from 'react';
import { BookOpen, Download, Moon, Save, Sun, Upload } from 'lucide-react';
import EntitlementOverviewCard from './EntitlementOverviewCard';

export default function GeneralSettingsTab({
  theme,
  toggleTheme,
  appSettings,
  setAppSettings,
  handleSaveApp,
  handleExportSettings,
  handleImportSettings,
  systemDiagnostics,
  appVersion,
  formatBytes,
  openGuide,
  entitlementState
}) {
  return (
    <div className="card">
      <h3 className="card-title mb-4">General Settings</h3>

      <div className="form-group">
        <label className="form-label">Theme</label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => toggleTheme('dark')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Moon size={18} /> Dark Mode
          </button>
          <button
            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => toggleTheme('light')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Sun size={18} /> Light Mode
          </button>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <h4 style={{ marginBottom: '16px' }}>Default Campaign Settings</h4>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Default Batch Size</label>
          <input
            type="number"
            className="form-input"
            value={appSettings.defaultBatchSize}
            onChange={(e) => setAppSettings({ ...appSettings, defaultBatchSize: parseInt(e.target.value, 10) })}
          />
          <small className="text-muted">Emails sent per batch</small>
        </div>
        <div className="form-group">
          <label className="form-label">Default Delay (minutes)</label>
          <input
            type="number"
            className="form-input"
            value={appSettings.defaultDelayMinutes}
            onChange={(e) => setAppSettings({ ...appSettings, defaultDelayMinutes: parseInt(e.target.value, 10) })}
          />
          <small className="text-muted">Wait time between batches</small>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Max Retries Per Email</label>
        <input
          type="number"
          className="form-input"
          style={{ maxWidth: '200px' }}
          value={appSettings.maxRetriesPerEmail}
          onChange={(e) => setAppSettings({ ...appSettings, maxRetriesPerEmail: parseInt(e.target.value, 10) })}
        />
        <small className="text-muted">How many times to retry failed emails</small>
      </div>

      <button className="btn btn-primary mt-4" onClick={handleSaveApp}>
        <Save size={16} /> Save Settings
      </button>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <EntitlementOverviewCard entitlementState={entitlementState} />

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <h4 style={{ marginBottom: '16px' }}>Import / Export Settings</h4>
      <p className="text-muted text-sm mb-3">
        Export all settings (SMTP, preferences, warmup) to a file, or import from a previous export.
      </p>
      <div className="flex gap-3">
        <button className="btn btn-outline" onClick={handleExportSettings}>
          <Download size={16} /> Export Settings
        </button>
        <button className="btn btn-outline" onClick={handleImportSettings}>
          <Upload size={16} /> Import Settings
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      {systemDiagnostics && (
        <>
          <h4 style={{ marginBottom: '16px' }}>System Diagnostics</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            {[
              {
                label: 'App Version',
                value: appVersion || systemDiagnostics.version || 'Unknown',
                detail: `Database size: ${formatBytes(systemDiagnostics.database?.sizeBytes)}`
              },
              {
                label: 'Tracking',
                value: systemDiagnostics.tracking?.baseUrl || 'Unavailable',
                detail: systemDiagnostics.tracking?.listening
                  ? `Listening on port ${systemDiagnostics.tracking?.port || 'unknown'}`
                  : 'Tracking listener is not active'
              },
              {
                label: 'SMTP Readiness',
                value: `${systemDiagnostics.smtp?.activeAccounts || 0}/${systemDiagnostics.smtp?.totalAccounts || 0} active`,
                detail: systemDiagnostics.smtp?.primaryFromEmail || 'No primary sender configured'
              },
              {
                label: 'Deliverability Mode',
                value: systemDiagnostics.deliverability?.sendingMode || 'bulk',
                detail: systemDiagnostics.deliverability?.companyAddress
                  ? 'Physical address is configured'
                  : 'Physical address is still missing'
              }
            ].map((item) => (
              <div key={item.label} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>{item.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', wordBreak: 'break-word' }}>{item.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            DB path: {systemDiagnostics.database?.path || 'Unavailable'}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />
        </>
      )}

      <div className="guide-link-card">
        <div>
          <div className="guide-link-kicker">Documentation</div>
          <h4 style={{ marginBottom: '8px' }}>Bulky guide and help center</h4>
          <p className="text-muted text-sm">
            Open the in-app guide for setup, verification, deliverability, templates, tracking, and analytics workflows.
          </p>
        </div>
        <button className="btn btn-outline" onClick={openGuide}>
          <BookOpen size={16} /> Open Guide
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <h4 style={{ marginBottom: '16px' }}>About</h4>
      <div className="text-muted">
        <p><strong>Bulky Email Sender</strong> v{appVersion || systemDiagnostics?.version || '6.1.0'}</p>
        <p>by AllenRetro</p>
        <p className="mt-2">Local-first bulk email desktop software with entitlement-gated hybrid features.</p>
        <p className="mt-2 text-sm">v6.1: Automations, Drip Sequences, Signup Forms, Inbox Placement, AI Assistant, Multi-SMTP Rotation, Warmup, Tracking, Spintax</p>
      </div>
    </div>
  );
}
