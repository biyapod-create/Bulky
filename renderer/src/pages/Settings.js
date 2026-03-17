import React, { useState, useEffect } from 'react';
import { Save, TestTube, Server, Settings as SettingsIcon, Sun, Moon, Database, Download, Upload, HardDrive, AlertTriangle, Plus, Trash2, Edit3, CheckCircle, XCircle, Shield, TrendingUp, RefreshCw, Globe, Key } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useTheme } from '../components/ThemeContext';

function Settings() {
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('smtp');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingAccountId, setTestingAccountId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [backupInfo, setBackupInfo] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // SMTP Accounts (multi-account support)
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    dailyLimit: 500,
    isDefault: false
  });

  // Legacy single SMTP (kept for backward compat)
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

  // Warmup settings
  const [warmupSettings, setWarmupSettings] = useState({
    enabled: false,
    startVolume: 20,
    dailyIncrease: 10,
    maxVolume: 500,
    warmupDays: 14
  });

  // Deliverability
  const [deliverabilityInfo, setDeliverabilityInfo] = useState({
    trackingDomain: '',
    dkimConfigured: false,
    spfConfigured: false,
    dmarcConfigured: false
  });

  useEffect(() => {
    loadSettings();
    loadBackupInfo();
    loadSmtpAccounts();
    loadDeliverabilityInfo();
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

        // Load warmup settings if available
        try {
          const warmup = await window.electron.settings.getWarmup();
          if (warmup) setWarmupSettings(warmup);
        } catch {}
      }
    } catch (error) {
      addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSmtpAccounts = async () => {
    try {
      if (window.electron?.smtpAccounts?.getAll) {
        const accounts = await window.electron.smtpAccounts.getAll();
        setSmtpAccounts(Array.isArray(accounts) ? accounts : []);
      }
    } catch {
      // Multi-account may not be supported yet
    }
  };

  const loadDeliverabilityInfo = async () => {
    try {
      if (window.electron?.settings?.getDeliverability) {
        const info = await window.electron.settings.getDeliverability();
        if (info) setDeliverabilityInfo(info);
      }
    } catch {}
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

  const handleTestAccount = async (account) => {
    setTestingAccountId(account.id);
    try {
      const result = await window.electron.smtp.test({
        host: account.host,
        port: account.port,
        secure: account.secure,
        username: account.username,
        password: account.password,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
      });
      setTestResults(prev => ({ ...prev, [account.id]: result }));
      if (result.success) {
        addToast(`${account.name}: Connection successful!`, 'success');
      } else {
        addToast(`${account.name}: ${result.message}`, 'error');
      }
    } catch (error) {
      setTestResults(prev => ({ ...prev, [account.id]: { success: false, message: error.message } }));
      addToast(`${account.name}: Test failed`, 'error');
    } finally {
      setTestingAccountId(null);
    }
  };

  const handleSaveAccount = async () => {
    if (!accountForm.name || !accountForm.host || !accountForm.username) {
      addToast('Name, host, and username are required', 'error');
      return;
    }
    try {
      if (editingAccount) {
        await window.electron.smtpAccounts.update({ ...accountForm, id: editingAccount.id });
        addToast('Account updated', 'success');
      } else {
        await window.electron.smtpAccounts.add(accountForm);
        addToast('Account added', 'success');
      }
      setShowAccountModal(false);
      setEditingAccount(null);
      resetAccountForm();
      loadSmtpAccounts();
    } catch (error) {
      addToast('Failed to save account', 'error');
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Delete this SMTP account?')) return;
    try {
      await window.electron.smtpAccounts.delete(id);
      addToast('Account deleted', 'success');
      loadSmtpAccounts();
    } catch (error) {
      addToast('Failed to delete account', 'error');
    }
  };

  const openEditAccount = (account) => {
    setEditingAccount(account);
    setAccountForm({
      name: account.name || '',
      host: account.host || '',
      port: account.port || 587,
      secure: account.secure || false,
      username: account.username || '',
      password: account.password || '',
      fromName: account.fromName || '',
      fromEmail: account.fromEmail || '',
      replyTo: account.replyTo || '',
      dailyLimit: account.dailyLimit || 500,
      isDefault: account.isDefault || false
    });
    setShowAccountModal(true);
  };

  const resetAccountForm = () => {
    setAccountForm({
      name: '', host: '', port: 587, secure: false, username: '', password: '',
      fromName: '', fromEmail: '', replyTo: '', dailyLimit: 500, isDefault: false
    });
  };

  const handleSaveApp = async () => {
    try {
      await window.electron.settings.save(appSettings);
      addToast('Settings saved', 'success');
    } catch (error) {
      addToast('Failed to save settings', 'error');
    }
  };

  const handleSaveWarmup = async () => {
    try {
      await window.electron.settings.saveWarmup(warmupSettings);
      addToast('Warmup settings saved', 'success');
    } catch (error) {
      addToast('Failed to save warmup settings', 'error');
    }
  };

  const handleSaveDeliverability = async () => {
    try {
      await window.electron.settings.saveDeliverability(deliverabilityInfo);
      addToast('Deliverability settings saved', 'success');
    } catch (error) {
      addToast('Failed to save deliverability settings', 'error');
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
    if (!window.confirm('WARNING: Restoring a backup will REPLACE ALL current data. This cannot be undone.\n\nAre you sure you want to continue?')) {
      return;
    }
    setIsRestoring(true);
    try {
      const result = await window.electron.backup.restore();
      if (result.success) {
        addToast('Backup restored successfully! Reloading...', 'success');
        loadBackupInfo();
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

  const handleExportSettings = async () => {
    try {
      const result = await window.electron.settings.exportAll();
      if (result?.success) {
        addToast('Settings exported', 'success');
      }
    } catch (error) {
      addToast('Failed to export settings', 'error');
    }
  };

  const handleImportSettings = async () => {
    try {
      const result = await window.electron.settings.importAll();
      if (result?.success) {
        addToast('Settings imported. Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      addToast('Failed to import settings', 'error');
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
          className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          <Key size={16} style={{ marginRight: '6px' }} />
          SMTP Accounts
        </button>
        <button
          className={`tab ${activeTab === 'deliverability' ? 'active' : ''}`}
          onClick={() => setActiveTab('deliverability')}
        >
          <Shield size={16} style={{ marginRight: '6px' }} />
          Deliverability
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

      {/* ===== SMTP CONFIGURATION TAB ===== */}
      {activeTab === 'smtp' && (
        <div className="card">
          <h3 className="card-title mb-4">SMTP Server Settings</h3>
          <p className="text-muted mb-4">
            Configure your primary outgoing mail server. These settings are required to send emails.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SMTP Host *</label>
              <input type="text" className="form-input" placeholder="smtp.example.com"
                value={smtpSettings.host}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Port *</label>
              <input type="number" className="form-input" placeholder="587"
                value={smtpSettings.port}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input type="text" className="form-input" placeholder="your@email.com"
                value={smtpSettings.username}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input type="password" className="form-input" placeholder="••••••••"
                value={smtpSettings.password}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={smtpSettings.secure}
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
              <input type="text" className="form-input" placeholder="Your Name or Company"
                value={smtpSettings.fromName}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">From Email *</label>
              <input type="email" className="form-input" placeholder="noreply@yourdomain.com"
                value={smtpSettings.fromEmail}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reply-To Email</label>
            <input type="email" className="form-input" placeholder="replies@yourdomain.com (optional)"
              value={smtpSettings.replyTo || ''}
              onChange={(e) => setSmtpSettings({ ...smtpSettings, replyTo: e.target.value })}
            />
            <small className="text-muted">Where replies should go (defaults to From Email)</small>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>Unsubscribe Headers</h4>
          <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
            Adding unsubscribe options helps your emails reach the inbox.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Unsubscribe Email</label>
              <input type="email" className="form-input" placeholder="unsubscribe@yourdomain.com"
                value={smtpSettings.unsubscribeEmail || ''}
                onChange={(e) => setSmtpSettings({ ...smtpSettings, unsubscribeEmail: e.target.value })}
              />
              <small className="text-muted">Adds List-Unsubscribe header</small>
            </div>
            <div className="form-group">
              <label className="form-label">Unsubscribe URL</label>
              <input type="url" className="form-input" placeholder="https://yourdomain.com/unsubscribe"
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
            <button className="btn btn-outline" onClick={handleTestConnection} disabled={testing}>
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
        </div>
      )}

      {/* ===== SMTP ACCOUNTS TAB ===== */}
      {activeTab === 'accounts' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="card-title">SMTP Accounts</h3>
              <p className="text-muted text-sm mt-1">Manage multiple SMTP accounts for rotation and higher volume.</p>
            </div>
            <button className="btn btn-primary" onClick={() => { resetAccountForm(); setEditingAccount(null); setShowAccountModal(true); }}>
              <Plus size={16} /> Add Account
            </button>
          </div>

          {smtpAccounts.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '40px' }}>
              <Server size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p>No SMTP accounts configured yet.</p>
              <p className="text-sm">Add multiple accounts to rotate sending and increase daily limits.</p>
              <button className="btn btn-primary mt-3" onClick={() => { resetAccountForm(); setEditingAccount(null); setShowAccountModal(true); }}>
                <Plus size={16} /> Add First Account
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {smtpAccounts.map(account => {
                const testResult = testResults[account.id];
                const dailyUsed = account.sentToday || 0;
                const dailyLimit = account.dailyLimit || 500;
                const usagePct = dailyLimit > 0 ? Math.min((dailyUsed / dailyLimit) * 100, 100) : 0;

                return (
                  <div key={account.id} style={{
                    border: '1px solid var(--border)', borderRadius: '8px', padding: '16px',
                    background: account.isDefault ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-secondary)'
                  }}>
                    <div className="flex justify-between items-start">
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2 mb-1">
                          <strong style={{ fontSize: '15px' }}>{account.name}</strong>
                          {account.isDefault && (
                            <span className="badge badge-info" style={{ fontSize: '10px' }}>Default</span>
                          )}
                          {testResult && (
                            testResult.success
                              ? <CheckCircle size={14} style={{ color: '#22c55e' }} />
                              : <XCircle size={14} style={{ color: '#ef4444' }} />
                          )}
                        </div>
                        <div className="text-sm text-muted">{account.host}:{account.port} ({account.secure ? 'SSL' : 'STARTTLS'})</div>
                        <div className="text-sm text-muted">{account.fromName} &lt;{account.fromEmail}&gt;</div>

                        {/* Daily usage bar */}
                        <div style={{ marginTop: '8px' }}>
                          <div className="flex justify-between text-sm mb-1">
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Daily: {dailyUsed} / {dailyLimit}</span>
                            <span style={{ fontSize: '11px', color: usagePct > 90 ? '#ef4444' : usagePct > 70 ? '#f59e0b' : '#22c55e' }}>
                              {usagePct.toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${usagePct}%`,
                              background: usagePct > 90 ? '#ef4444' : usagePct > 70 ? '#f59e0b' : '#22c55e',
                              transition: 'width 0.3s'
                            }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleTestAccount(account)}
                          disabled={testingAccountId === account.id}
                          title="Test connection"
                        >
                          {testingAccountId === account.id ? (
                            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <TestTube size={14} />
                          )}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditAccount(account)} title="Edit">
                          <Edit3 size={14} />
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleDeleteAccount(account.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {testResult && !testResult.success && (
                      <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', fontSize: '12px', color: '#ef4444' }}>
                        {testResult.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Account Modal */}
          <Modal
            isOpen={showAccountModal}
            onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
            title={editingAccount ? 'Edit SMTP Account' : 'Add SMTP Account'}
            size="lg"
          >
            <div className="form-group">
              <label className="form-label">Account Name *</label>
              <input type="text" className="form-input" placeholder="e.g., Primary, Gmail, SES"
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SMTP Host *</label>
                <input type="text" className="form-input" placeholder="smtp.example.com"
                  value={accountForm.host}
                  onChange={(e) => setAccountForm({ ...accountForm, host: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input type="number" className="form-input" placeholder="587"
                  value={accountForm.port}
                  onChange={(e) => setAccountForm({ ...accountForm, port: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input type="text" className="form-input" placeholder="your@email.com"
                  value={accountForm.username}
                  onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input type="password" className="form-input" placeholder="••••••••"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From Name</label>
                <input type="text" className="form-input" placeholder="Your Name"
                  value={accountForm.fromName}
                  onChange={(e) => setAccountForm({ ...accountForm, fromName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">From Email</label>
                <input type="email" className="form-input" placeholder="noreply@domain.com"
                  value={accountForm.fromEmail}
                  onChange={(e) => setAccountForm({ ...accountForm, fromEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Daily Send Limit</label>
                <input type="number" className="form-input" placeholder="500"
                  value={accountForm.dailyLimit}
                  onChange={(e) => setAccountForm({ ...accountForm, dailyLimit: parseInt(e.target.value) })}
                />
                <small className="text-muted">Max emails per day for this account</small>
              </div>
              <div className="form-group">
                <label className="form-label">Reply-To</label>
                <input type="email" className="form-input" placeholder="Optional"
                  value={accountForm.replyTo}
                  onChange={(e) => setAccountForm({ ...accountForm, replyTo: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-4 mt-2">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={accountForm.secure}
                  onChange={(e) => setAccountForm({ ...accountForm, secure: e.target.checked })}
                /> SSL/TLS
              </label>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={accountForm.isDefault}
                  onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
                /> Set as Default
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => { setShowAccountModal(false); setEditingAccount(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveAccount}>
                <Save size={16} /> {editingAccount ? 'Update' : 'Add'} Account
              </button>
            </div>
          </Modal>
        </div>
      )}

      {/* ===== DELIVERABILITY TAB ===== */}
      {activeTab === 'deliverability' && (
        <div>
          {/* Warmup Schedule */}
          <div className="card mb-4">
            <h3 className="card-title mb-4"><TrendingUp size={20} style={{ marginRight: '8px' }} /> Warmup Schedule</h3>
            <p className="text-muted mb-4 text-sm">
              Gradually increase sending volume to build sender reputation with ISPs.
            </p>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={warmupSettings.enabled}
                  onChange={(e) => setWarmupSettings({ ...warmupSettings, enabled: e.target.checked })}
                />
                Enable Warmup Mode
              </label>
            </div>

            {warmupSettings.enabled && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Starting Volume (emails/day)</label>
                    <input type="number" className="form-input" value={warmupSettings.startVolume}
                      onChange={(e) => setWarmupSettings({ ...warmupSettings, startVolume: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Daily Increase</label>
                    <input type="number" className="form-input" value={warmupSettings.dailyIncrease}
                      onChange={(e) => setWarmupSettings({ ...warmupSettings, dailyIncrease: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Max Volume (emails/day)</label>
                    <input type="number" className="form-input" value={warmupSettings.maxVolume}
                      onChange={(e) => setWarmupSettings({ ...warmupSettings, maxVolume: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Warmup Duration (days)</label>
                    <input type="number" className="form-input" value={warmupSettings.warmupDays}
                      onChange={(e) => setWarmupSettings({ ...warmupSettings, warmupDays: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Warmup preview */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px', marginTop: '8px' }}>
                  <div className="text-sm text-muted mb-2">Warmup Preview (daily volume):</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                    {Array.from({ length: Math.min(warmupSettings.warmupDays, 14) }, (_, i) => {
                      const vol = Math.min(warmupSettings.startVolume + (warmupSettings.dailyIncrease * i), warmupSettings.maxVolume);
                      const maxH = warmupSettings.maxVolume || 1;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ fontSize: '9px', marginBottom: '2px' }}>{vol}</div>
                          <div style={{ width: '100%', height: `${(vol / maxH) * 60}px`, background: '#6366f1', borderRadius: '3px 3px 0 0', minHeight: '2px' }} />
                          <div style={{ fontSize: '8px', color: 'var(--text-muted)', marginTop: '2px' }}>D{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <button className="btn btn-primary mt-4" onClick={handleSaveWarmup}>
              <Save size={16} /> Save Warmup Settings
            </button>
          </div>

          {/* Deliverability Settings */}
          <div className="card">
            <h3 className="card-title mb-4"><Globe size={20} style={{ marginRight: '8px' }} /> Deliverability Settings</h3>

            <div className="form-group">
              <label className="form-label">Tracking Domain</label>
              <input type="text" className="form-input" placeholder="track.yourdomain.com"
                value={deliverabilityInfo.trackingDomain}
                onChange={(e) => setDeliverabilityInfo({ ...deliverabilityInfo, trackingDomain: e.target.value })}
              />
              <small className="text-muted">Custom domain for open/click tracking (CNAME to tracking server)</small>
            </div>

            {/* DNS Status Display */}
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>DNS Configuration Status</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                  { label: 'SPF Record', key: 'spfConfigured', desc: 'Authorizes your server to send email' },
                  { label: 'DKIM Signing', key: 'dkimConfigured', desc: 'Verifies email authenticity' },
                  { label: 'DMARC Policy', key: 'dmarcConfigured', desc: 'Prevents domain spoofing' },
                ].map(({ label, key, desc }) => (
                  <div key={key} style={{
                    padding: '16px', borderRadius: '8px',
                    border: `1px solid ${deliverabilityInfo[key] ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    background: deliverabilityInfo[key] ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {deliverabilityInfo[key]
                        ? <CheckCircle size={16} style={{ color: '#22c55e' }} />
                        : <XCircle size={16} style={{ color: '#ef4444' }} />}
                      <strong style={{ fontSize: '13px' }}>{label}</strong>
                    </div>
                    <div className="text-sm text-muted">{desc}</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: deliverabilityInfo[key] ? '#22c55e' : '#ef4444' }}>
                      {deliverabilityInfo[key] ? 'Configured' : 'Not Detected'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-primary mt-4" onClick={handleSaveDeliverability}>
              <Save size={16} /> Save Deliverability Settings
            </button>

            <div className="card mt-4" style={{ background: 'var(--bg-tertiary)', padding: '16px' }}>
              <h5 style={{ fontSize: '14px', marginBottom: '12px' }}>Tips to Avoid Spam Folder:</h5>
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
        </div>
      )}

      {/* ===== GENERAL TAB ===== */}
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
              <input type="number" className="form-input"
                value={appSettings.defaultBatchSize}
                onChange={(e) => setAppSettings({ ...appSettings, defaultBatchSize: parseInt(e.target.value) })}
              />
              <small className="text-muted">Emails sent per batch</small>
            </div>
            <div className="form-group">
              <label className="form-label">Default Delay (minutes)</label>
              <input type="number" className="form-input"
                value={appSettings.defaultDelayMinutes}
                onChange={(e) => setAppSettings({ ...appSettings, defaultDelayMinutes: parseInt(e.target.value) })}
              />
              <small className="text-muted">Wait time between batches</small>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Max Retries Per Email</label>
            <input type="number" className="form-input" style={{ maxWidth: '200px' }}
              value={appSettings.maxRetriesPerEmail}
              onChange={(e) => setAppSettings({ ...appSettings, maxRetriesPerEmail: parseInt(e.target.value) })}
            />
            <small className="text-muted">How many times to retry failed emails</small>
          </div>

          <button className="btn btn-primary mt-4" onClick={handleSaveApp}>
            <Save size={16} /> Save Settings
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          {/* Import / Export Settings */}
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

          <h4 style={{ marginBottom: '16px' }}>About</h4>
          <div className="text-muted">
            <p><strong>Bulky Email Sender</strong> v3.5.0</p>
            <p>by AllenRetro</p>
            <p className="mt-2">Professional bulk email sender without subscription limitations.</p>
            <p className="mt-2 text-sm">New in v3.5: Tracking, Tags, Scheduling, Spintax, Multi-SMTP, Warmup</p>
          </div>
        </div>
      )}

      {/* ===== BACKUP TAB ===== */}
      {activeTab === 'backup' && (
        <div className="card">
          <h3 className="card-title mb-4"><Database size={20} style={{ marginRight: '8px' }} /> Backup & Restore</h3>
          <p className="text-muted mb-4">
            Create backups of your entire database including contacts, campaigns, templates, and settings.
          </p>

          {/* Database Info */}
          {backupInfo && (
            <div style={{
              background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', marginBottom: '24px',
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'
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
            <button className="btn btn-primary" onClick={handleBackup} disabled={isBackingUp}>
              {isBackingUp ? 'Creating Backup...' : <><Download size={16} /> Create Backup</>}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          {/* Restore Section */}
          <div>
            <h4 style={{ marginBottom: '12px' }}><Upload size={18} style={{ marginRight: '8px' }} /> Restore Backup</h4>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '16px', borderRadius: '8px', marginBottom: '16px'
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
