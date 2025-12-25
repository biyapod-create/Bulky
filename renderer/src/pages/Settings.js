import React, { useState, useEffect } from 'react';
import { Save, TestTube, Server, Settings as SettingsIcon, Sun, Moon, Database, Download, Upload, HardDrive, AlertTriangle } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useTheme } from '../components/ThemeContext';

function Settings() {
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('smtp');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [backupInfo, setBackupInfo] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  const [smtpSettings, setSmtpSettings] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    unsubscribeEmail: '',
    unsubscribeUrl: ''
  });

  const [appSettings, setAppSettings] = useState({
    theme: 'dark',
    defaultBatchSize: 50,
    defaultDelayMinutes: 10,
    maxRetriesPerEmail: 2
  });

  useEffect(() => {
    loadSettings();
    loadBackupInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBackupInfo = async () => {
    try {
      if (window.electron?.backup) {
        const info = await window.electron.backup.getInfo();
        setBackupInfo(info);
      }
    } catch (error) {
      console.error('Failed to load backup info:', error);
    }
  };

  const loadSettings = async () => {
    try {
      if (window.electron) {
        const [smtp, app] = await Promise.all([
          window.electron.smtp.get(),
          window.electron.settings.get()
        ]);
        if (smtp) setSmtpSettings(smtp);
        if (app) setAppSettings(app);
      }
    } catch (error) {
      addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSmtp = async () => {
    try {
      await window.electron.smtp.save(smtpSettings);
      addToast('SMTP settings saved', 'success');
    } catch (error) {
      addToast('Failed to save settings', 'error');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await window.electron.smtp.test(smtpSettings);
      if (result.success) {
        addToast('Connection successful!', 'success');
      } else {
        addToast(`Connection failed: ${result.message}`, 'error');
      }
    } catch (error) {
      addToast('Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveApp = async () => {
    try {
      await window.electron.settings.save(appSettings);
      addToast('Settings saved', 'success');
    } catch (error) {
      addToast('Failed to save settings', 'error');
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await window.electron.backup.create();
      if (result.success) {
        addToast('Backup created successfully!', 'success');
        loadBackupInfo();
      } else if (!result.canceled) {
        addToast('Backup failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      addToast('Backup failed: ' + error.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('⚠️ WARNING: Restoring a backup will REPLACE ALL current data. This cannot be undone.\n\nAre you sure you want to continue?')) {
      return;
    }
    
    setIsRestoring(true);
    try {
      const result = await window.electron.backup.restore();
      if (result.success) {
        addToast('Backup restored successfully! Reloading...', 'success');
        loadBackupInfo();
        // Reload the page to refresh all data
        setTimeout(() => window.location.reload(), 1500);
      } else if (!result.canceled) {
        addToast('Restore failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      addToast('Restore failed: ' + error.message, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted" style={{ padding: '100px' }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your email sending settings.</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'smtp' ? 'active' : ''}`}
          onClick={() => setActiveTab('smtp')}
        >
          <Server size={16} style={{ marginRight: '6px' }} />
          SMTP Configuration
        </button>
        <button 
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <SettingsIcon size={16} style={{ marginRight: '6px' }} />
          General
        </button>
        <button 
          className={`tab ${activeTab === 'backup' ? 'active' : ''}`}
          onClick={() => setActiveTab('backup')}
        >
          <Database size={16} style={{ marginRight: '6px' }} />
          Backup & Restore
        </button>
      </div>

      {activeTab === 'smtp' && (
        <div className="card">
          <h3 className="card-title mb-4">SMTP Server Settings</h3>
          <p className="text-muted mb-4">
            Configure your outgoing mail server. These settings are required to send emails.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SMTP Host *</label>
              <input
                type="text"
                className="form-input"
                placeholder="smtp.example.com"
                value={smtpSettings.host}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Port *</label>
              <input
                type="number"
                className="form-input"
                placeholder="587"
                value={smtpSettings.port}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                className="form-input"
                placeholder="your@email.com"
                value={smtpSettings.username}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={smtpSettings.password}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={smtpSettings.secure}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, secure: e.target.checked })}
              />
              Use SSL/TLS (port 465)
            </label>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>Sender Information</h4>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">From Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Your Name or Company"
                value={smtpSettings.fromName}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">From Email *</label>
              <input
                type="email"
                className="form-input"
                placeholder="noreply@yourdomain.com"
                value={smtpSettings.fromEmail}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reply-To Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="replies@yourdomain.com (optional)"
              value={smtpSettings.replyTo || ''}
              onChange={(e) => setSmtpSettings({ ...smtpSettings, replyTo: e.target.value })}
            />
            <small className="text-muted">Where replies should go (defaults to From Email)</small>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>📬 Deliverability Settings</h4>
          <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
            These settings help your emails reach the inbox instead of spam.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Unsubscribe Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="unsubscribe@yourdomain.com"
                value={smtpSettings.unsubscribeEmail || ''}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, unsubscribeEmail: e.target.value })}
              />
              <small className="text-muted">Adds List-Unsubscribe header</small>
            </div>
            <div className="form-group">
              <label className="form-label">Unsubscribe URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://yourdomain.com/unsubscribe"
                value={smtpSettings.unsubscribeUrl || ''}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, unsubscribeUrl: e.target.value })}
              />
              <small className="text-muted">Alternative to email (use one)</small>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button className="btn btn-primary" onClick={handleSaveSmtp}>
              <Save size={16} /> Save Settings
            </button>
            <button 
              className="btn btn-outline" 
              onClick={handleTestConnection}
              disabled={testing}
            >
              <TestTube size={16} /> {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <div className="card mt-4" style={{ background: 'var(--bg-tertiary)', padding: '16px' }}>
            <h5 style={{ fontSize: '14px', marginBottom: '12px' }}>Common SMTP Settings:</h5>
            <div className="text-sm text-muted">
              <p><strong>Gmail:</strong> smtp.gmail.com, Port 587, Use App Password</p>
              <p><strong>Outlook:</strong> smtp-mail.outlook.com, Port 587</p>
              <p><strong>cPanel:</strong> mail.yourdomain.com, Port 465 (SSL) or 587</p>
              <p><strong>Amazon SES:</strong> email-smtp.[region].amazonaws.com, Port 587</p>
            </div>
          </div>

          <div className="card mt-4" style={{ background: 'var(--bg-tertiary)', padding: '16px' }}>
            <h5 style={{ fontSize: '14px', marginBottom: '12px' }}>📧 Tips to Avoid Spam Folder:</h5>
            <div className="text-sm text-muted">
              <p><strong>1. Set up SPF/DKIM:</strong> Ask your hosting provider to configure email authentication</p>
              <p><strong>2. Use a real reply-to:</strong> Monitored email addresses get better inbox rates</p>
              <p><strong>3. Add unsubscribe option:</strong> Gmail requires this for bulk senders</p>
              <p><strong>4. Avoid spam triggers:</strong> Words like FREE, URGENT, ACT NOW, excessive caps</p>
              <p><strong>5. Balance text/HTML:</strong> Include both plain text and HTML versions (auto-done)</p>
              <p><strong>6. Use your own domain:</strong> Custom domain emails perform better than gmail.com</p>
              <p><strong>7. Warm up gradually:</strong> Start with small batches and increase over time</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
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
                onChange={(e) => setAppSettings({ ...appSettings, defaultBatchSize: parseInt(e.target.value) })}
              />
              <small className="text-muted">Emails sent per batch</small>
            </div>
            <div className="form-group">
              <label className="form-label">Default Delay (minutes)</label>
              <input
                type="number"
                className="form-input"
                value={appSettings.defaultDelayMinutes}
                onChange={(e) => setAppSettings({ ...appSettings, defaultDelayMinutes: parseInt(e.target.value) })}
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
              onChange={(e) => setAppSettings({ ...appSettings, maxRetriesPerEmail: parseInt(e.target.value) })}
            />
            <small className="text-muted">How many times to retry failed emails</small>
          </div>

          <button className="btn btn-primary mt-4" onClick={handleSaveApp}>
            <Save size={16} /> Save Settings
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>About</h4>
          <div className="text-muted">
            <p><strong>Bulky Email Sender</strong> v3.1.0</p>
            <p>by AllenRetro</p>
            <p className="mt-2">Professional bulk email sender without subscription limitations.</p>
            <p className="mt-2 text-sm">New in v3.1: WYSIWYG Editor, Campaign Analytics Charts, Backup & Restore, Improved Spam Detection</p>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="card">
          <h3 className="card-title mb-4"><Database size={20} style={{ marginRight: '8px' }} /> Backup & Restore</h3>
          <p className="text-muted mb-4">
            Create backups of your entire database including contacts, campaigns, templates, and settings.
          </p>

          {/* Database Info */}
          {backupInfo && (
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '16px', 
              borderRadius: '8px', 
              marginBottom: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px'
            }}>
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

          {/* Backup Section */}
          <div style={{ marginBottom: '32px' }}>
            <h4 style={{ marginBottom: '12px' }}><Download size={18} style={{ marginRight: '8px' }} /> Create Backup</h4>
            <p className="text-sm text-muted mb-3">
              Export your entire database to a file. This includes all contacts, campaigns, templates, SMTP settings, and preferences.
            </p>
            <button 
              className="btn btn-primary" 
              onClick={handleBackup}
              disabled={isBackingUp}
            >
              {isBackingUp ? 'Creating Backup...' : <><Download size={16} /> Create Backup</>}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          {/* Restore Section */}
          <div>
            <h4 style={{ marginBottom: '12px' }}><Upload size={18} style={{ marginRight: '8px' }} /> Restore Backup</h4>
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '16px', 
              borderRadius: '8px', 
              marginBottom: '16px'
            }}>
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

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          {/* Tips */}
          <div className="text-sm text-muted">
            <h4 style={{ marginBottom: '12px', color: 'var(--text)' }}>Backup Tips</h4>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Create regular backups before major changes</li>
              <li>Store backups in a safe location (cloud storage, external drive)</li>
              <li>Test your backups periodically by restoring to a test environment</li>
              <li>The backup file is a complete SQLite database that can be opened with any SQLite viewer</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
