import React from 'react';
import { AlertTriangle, Database, Download, HardDrive, RefreshCw, Trash2, Upload } from 'lucide-react';

export default function BackupSettingsTab({
  backupInfo,
  isBackingUp,
  isRestoring,
  isResetting,
  handleBackup,
  handleRestore,
  handleResetEverything,
  autoBackupConfig,
  handleAutoBackupEnabledChange,
  handleAutoBackupIntervalChange,
  backupHistory
}) {
  return (
    <div className="card">
      <h3 className="card-title mb-4"><Database size={20} style={{ marginRight: '8px' }} /> Backup & Restore</h3>
      <p className="text-muted mb-4">
        Create backups of your entire database including contacts, campaigns, templates, and settings.
      </p>

      {backupInfo && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px'
          }}
        >
          <div>
            <div className="text-sm text-muted">Database Size</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}><HardDrive size={16} style={{ marginRight: '6px' }} />{backupInfo.size}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Last Modified</div>
            <div style={{ fontSize: '14px' }}>{backupInfo.lastModified}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Location</div>
            <div style={{ fontSize: '12px', wordBreak: 'break-all' }}>{backupInfo.path}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ marginBottom: '12px' }}><Download size={18} style={{ marginRight: '8px' }} /> Create Backup</h4>
        <p className="text-sm text-muted mb-3">
          Export your entire database to a file. This includes all contacts, campaigns, templates, SMTP settings, and preferences.
        </p>
        <button className="btn btn-primary" onClick={handleBackup} disabled={isBackingUp}>
          {isBackingUp ? 'Creating Backup...' : <><Download size={16} /> Create Backup</>}
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <div>
        <h4 style={{ marginBottom: '12px' }}><Upload size={18} style={{ marginRight: '8px' }} /> Restore Backup</h4>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#ef4444' }}>Warning: This action cannot be undone!</strong>
              <p className="text-sm text-muted mt-1">
                Restoring a backup will completely replace all current data. Make sure to create a backup of your current data first if needed.
              </p>
            </div>
          </div>
        </div>
        <button
          className="btn btn-outline"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
          onClick={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? 'Restoring...' : <><Upload size={16} /> Restore from Backup</>}
        </button>
      </div>

      <div style={{ marginTop: '24px' }}>
        <h4 style={{ marginBottom: '12px' }}>
          <Trash2 size={18} style={{ marginRight: '8px', color: '#ef4444' }} /> Reset Everything
        </h4>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#ef4444' }}>WARNING: Cannot be undone</strong>
              <p className="text-sm text-muted mt-1">
                This will delete ALL Bulky data stored in the database (contacts, campaigns, templates, SMTP accounts, tracking, schedules, segments, blacklist/unsubscribes) and internal logs, then restart the app.
              </p>
            </div>
          </div>
        </div>
        <button
          className="btn btn-outline"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
          onClick={handleResetEverything}
          disabled={isResetting}
        >
          {isResetting ? 'Resetting...' : <><Trash2 size={16} /> Reset Everything</>}
        </button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ marginBottom: '12px' }}><RefreshCw size={18} style={{ marginRight: '8px' }} /> Auto-Backup</h4>
        <p className="text-sm text-muted mb-3">Automatically back up your database on a schedule. Last 5 auto-backups are kept.</p>
        <div className="flex gap-3 items-center">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoBackupConfig.enabled}
              onChange={(e) => handleAutoBackupEnabledChange(e.target.checked)}
            />
            Enable auto-backup
          </label>
          <select
            className="form-select"
            style={{ width: '180px' }}
            value={autoBackupConfig.intervalHours}
            onChange={(e) => handleAutoBackupIntervalChange(parseInt(e.target.value, 10))}
          >
            <option value="6">Every 6 hours</option>
            <option value="12">Every 12 hours</option>
            <option value="24">Every 24 hours</option>
            <option value="72">Every 3 days</option>
            <option value="168">Weekly</option>
          </select>
        </div>
      </div>

      {backupHistory.length > 0 && (
        <div>
          <h4 style={{ marginBottom: '12px' }}><Database size={18} style={{ marginRight: '8px' }} /> Recent Backups</h4>
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {backupHistory.map((backup, index) => (
              <div key={backup.id || index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{backup.filename}</span>
                  <span className={`badge badge-${backup.type === 'auto' ? 'info' : 'default'} ml-2`}>{backup.type}</span>
                </div>
                <div className="text-muted text-sm">{backup.createdAt ? new Date(backup.createdAt).toLocaleString() : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
