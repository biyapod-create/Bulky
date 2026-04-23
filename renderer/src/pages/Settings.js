import React, { useState, useEffect } from 'react';
import { Save, TestTube, Server, Settings as SettingsIcon, Sun, Moon, Database, Download, Upload, HardDrive, AlertTriangle, Plus, Trash2, Edit3, CheckCircle, XCircle, Shield, TrendingUp, RefreshCw, Globe, Key, Search, Sparkles } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useTheme } from '../components/ThemeContext';
import { getPrimarySmtpAccount as getPrimaryAccount, getSenderDomain, getSenderEmail } from '../utils/smtpAccounts';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';

function Settings({ isActive }) {
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
  const [domainCheckResults, setDomainCheckResults] = useState(null);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [autoBackupConfig, setAutoBackupConfig] = useState({ enabled: false, intervalHours: 24 });
  const [backupHistory, setBackupHistory] = useState([]);
  const [isResetting, setIsResetting] = useState(false);

  // SMTP Accounts (multi-account support)
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [smtpHealth, setSmtpHealth] = useState([]);
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
    unsubscribeEmail: '',
    dailyLimit: 500,
    isDefault: false,
    rejectUnauthorized: true,
    warmUpEnabled: false,
    warmUpStartDate: '',
    dkimDomain: '',
    dkimSelector: '',
    dkimPrivateKey: ''
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

  // AI Settings
  const [aiSettings, setAiSettings] = useState({ apiKey: '', model: 'meta-llama/llama-3.1-8b-instruct:free' });
  const [aiTesting, setAiTesting] = useState(false);

  // Deliverability
  const [deliverabilityInfo, setDeliverabilityInfo] = useState({
    trackingDomain: '',
    dkimConfigured: false,
    spfConfigured: false,
    dmarcConfigured: false,
    sendingMode: 'bulk',
    companyAddress: ''
  });

  const getPrimarySenderAccount = () => {
    return getPrimaryAccount(smtpAccounts);
  };

  const getEffectiveFromEmail = () => {
    const primaryAccount = getPrimarySenderAccount();
    return String(smtpSettings.fromEmail || getSenderEmail(primaryAccount)).trim();
  };

  const getEffectiveSendingDomain = () => {
    return getSenderDomain({ fromEmail: getEffectiveFromEmail() });
  };

  useEffect(() => {
    loadSettings();
    loadBackupInfo();
    loadSmtpAccounts();
    loadSmtpOverview();
    loadDeliverabilityInfo();
    loadAutoBackupConfig();
    loadBackupHistory();
    loadAiSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when becoming the active tab
  useEffect(() => {
    if (isActive) {
      loadSmtpAccounts();
      loadSmtpOverview();
      loadDeliverabilityInfo();
      loadBackupHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // React to SMTP account changes made from other parts of the app
  useEffect(() => {
    if (!window.electron?.onDataChanged) return;
    const unsub = window.electron.onDataChanged((data) => {
      if (data.type === 'settings') {
        loadSettings();
        loadSmtpAccounts();
        loadSmtpOverview();
        loadDeliverabilityInfo();
        loadBackupInfo();
        loadAutoBackupConfig();
        loadBackupHistory();
        loadAiSettings();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBackupInfo = async () => {
    try {
      if (window.electron?.backup) {
        const info = await window.electron.backup.getInfo();
        setBackupInfo(info);
      }
    } catch (error) {
      console.warn('loadBackupInfo error:', error);
    }
  };

  const loadAutoBackupConfig = async () => {
    try {
      if (window.electron?.backup?.getAutoConfig) {
        const config = await window.electron.backup.getAutoConfig();
        if (config) setAutoBackupConfig(config);
      }
    } catch (e) {
      // ignored
    }
  };

  const loadBackupHistory = async () => {
    try {
      if (window.electron?.backup?.getHistory) {
        const history = await window.electron.backup.getHistory();
        setBackupHistory(Array.isArray(history) ? history : []);
      }
    } catch (e) {
      // ignored
    }
  };

  const loadAiSettings = async () => {
    try {
      if (window.electron?.ai?.getSettings) {
        const settings = await window.electron.ai.getSettings();
        if (settings) setAiSettings(settings);
      }
    } catch (e) {
      // ignored
    }
  };

  const handleSaveAiSettings = async () => {
    try {
      await window.electron?.ai?.saveSettings(aiSettings);
      addToast('AI settings saved', 'success');
    } catch (e) {
      addToast('Failed to save AI settings', 'error');
    }
  };

  const handleTestAi = async () => {
    if (!aiSettings.apiKey) {
      addToast('Please enter an API key first', 'error');
      return;
    }
    setAiTesting(true);
    try {
      await window.electron?.ai?.saveSettings(aiSettings);
      const result = await window.electron?.ai?.improveSubject({ subject: 'Test email subject', context: '' });
      if (result.error) {
        addToast('AI test failed: ' + result.error, 'error');
      } else {
        addToast('AI connection successful!', 'success');
      }
    } catch (e) {
      addToast('AI test failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setAiTesting(false);
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
    } catch (e) {
      // ignored
    }
  };

  const loadSmtpOverview = async () => {
    try {
      if (window.electron?.stats?.getDashboard) {
        const data = await window.electron.stats.getDashboard();
        setSmtpHealth(Array.isArray(data?.smtpHealth) ? data.smtpHealth : []);
      }
    } catch (e) {
      // ignored
    }
  };

  const refreshSettingsSurface = async () => {
    await Promise.all([
      loadSettings(),
      loadBackupInfo(),
      loadSmtpAccounts(),
      loadSmtpOverview(),
      loadDeliverabilityInfo(),
      loadAutoBackupConfig(),
      loadBackupHistory(),
      loadAiSettings()
    ]);
  };

  useLiveDataRefresh({
    load: refreshSettingsSurface,
    isActive,
    dataTypes: ['settings'],
    pollMs: 30000,
    runOnMount: false
  });

  const handleSaveSmtp = async () => {
    try {
      await window.electron.smtp.save(smtpSettings);
      loadSmtpOverview();
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
    setTestResults(prev => ({ ...prev, [account.id]: { testing: true, steps: [] } }));
    try {
      const result = await window.electron.smtpTest.detailed({
        host: account.host,
        port: account.port,
        secure: account.secure,
        username: account.username,
        password: account.password,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        rejectUnauthorized: account.rejectUnauthorized,
      });
      setTestResults(prev => ({ ...prev, [account.id]: result }));
      if (result.success) {
        addToast(`${account.name}: All tests passed!`, 'success');
      } else {
        addToast(`${account.name}: ${result.error}`, 'error');
      }
    } catch (error) {
      setTestResults(prev => ({ ...prev, [account.id]: { success: false, error: error.message, steps: [] } }));
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
      loadSmtpOverview();
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
      loadSmtpOverview();
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
      secure: !!account.secure,
      username: account.username || '',
      password: account.password || '',
      fromName: account.fromName || '',
      fromEmail: account.fromEmail || '',
      replyTo: account.replyTo || '',
      unsubscribeEmail: account.unsubscribeEmail || '',
      dailyLimit: account.dailyLimit || 500,
      isDefault: !!account.isDefault,
      rejectUnauthorized: account.rejectUnauthorized !== false && account.rejectUnauthorized !== 0,
      warmUpEnabled: !!account.warmUpEnabled,
      warmUpStartDate: account.warmUpStartDate || '',
      dkimDomain: account.dkimDomain || '',
      dkimSelector: account.dkimSelector || '',
      dkimPrivateKey: account.dkimPrivateKey || ''
    });
    setShowAccountModal(true);
  };

  const resetAccountForm = () => {
    setAccountForm({
      name: '', host: '', port: 587, secure: false, username: '', password: '',
      fromName: '', fromEmail: '', replyTo: '', unsubscribeEmail: '',
      dailyLimit: 500, isDefault: false, rejectUnauthorized: true,
      warmUpEnabled: false, warmUpStartDate: '',
      dkimDomain: '', dkimSelector: '', dkimPrivateKey: ''
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
      loadSmtpOverview();
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

  const handleResetEverything = async () => {
    if (isResetting) return;
    const ok = window.confirm(
      'WARNING: Reset Everything will permanently DELETE all Bulky data (contacts, campaigns, templates, SMTP accounts, settings, tracking events, retry queue, schedules, segments, blacklist, unsubscribes, and logs).\n\nThis cannot be undone. Restart the app after reset.\n\nDo you want to continue?'
    );
    if (!ok) return;

    setIsResetting(true);
    try {
      addToast('Resetting everything... restarting...', 'success');

      // Clear renderer-side state immediately (main process will restart)
      try { window.localStorage.clear(); window.sessionStorage.clear(); } catch {}

      await window.electron?.system?.resetAll?.();
    } catch (e) {
      // When Electron is relaunching, the IPC channel can close; treat as success.
      addToast('Reset triggered. Restarting...', 'success');
    } finally {
      setIsResetting(false);
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

  const handleCheckDomain = async () => {
    const domain = getEffectiveSendingDomain();
    if (!domain) {
      addToast('Please configure a sender email address first', 'error');
      return;
    }
    setCheckingDomain(true);
    try {
      const result = await window.electron.settings.checkDomain(domain);
      setDomainCheckResults(result);
      // Sync real DNS results into deliverability status so both tabs agree
      if (result) {
        const updated = {
          ...deliverabilityInfo,
          spfConfigured: !!result.spf?.found,
          dkimConfigured: !!result.dkim?.found,
          dmarcConfigured: !!result.dmarc?.found
        };
        setDeliverabilityInfo(updated);
        try { await window.electron.settings.saveDeliverability(updated); } catch {}
      }
    } catch (err) {
      addToast('Domain check failed: ' + err.message, 'error');
    } finally {
      setCheckingDomain(false);
    }
  };

  const effectiveFromEmail = getEffectiveFromEmail();
  const effectiveSendingDomain = getEffectiveSendingDomain();
  const smtpHealthById = new Map((smtpHealth || []).map((entry) => [entry.id, entry]));
  const totalAccounts = smtpAccounts.length;
  const activeAccounts = smtpHealth.length > 0
    ? smtpHealth.filter((entry) => entry.isActive).length
    : smtpAccounts.filter((entry) => entry.isActive).length;
  const totalDailyLimit = (smtpHealth.length > 0 ? smtpHealth : smtpAccounts)
    .reduce((sum, entry) => sum + (Number(entry.dailyLimit) || 0), 0);
  const totalUsedToday = (smtpHealth.length > 0 ? smtpHealth : smtpAccounts)
    .reduce((sum, entry) => sum + (Number(entry.sentToday) || 0), 0);
  const remainingCapacity = Math.max(totalDailyLimit - totalUsedToday, 0);
  const warmupAccounts = (smtpHealth.length > 0 ? smtpHealth : smtpAccounts)
    .filter((entry) => entry.warmUpEnabled)
    .length;
  const averageHealth = smtpHealth.length > 0
    ? Math.round(smtpHealth.reduce((sum, entry) => sum + (Number(entry.health) || 0), 0) / smtpHealth.length)
    : 0;
  const readinessChecks = [
    !!deliverabilityInfo.spfConfigured,
    !!deliverabilityInfo.dkimConfigured,
    !!deliverabilityInfo.dmarcConfigured,
    !!String(deliverabilityInfo.trackingDomain || '').trim(),
    activeAccounts > 0,
    !!effectiveSendingDomain
  ];
  const readinessScore = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);
  const readinessTone = readinessScore >= 80 ? 'var(--success)' : readinessScore >= 55 ? 'var(--warning)' : 'var(--error)';
  const senderFootprint = effectiveSendingDomain || 'No sender domain configured';
  const senderDomains = Array.from(new Set(smtpAccounts.map(account => getSenderDomain(account)).filter(Boolean)));
  const rotationReadyAccounts = smtpAccounts.filter((account) => {
    const healthSnapshot = smtpHealthById.get(account.id);
    const sentToday = Number(healthSnapshot?.sentToday ?? account.sentToday ?? 0);
    const dailyLimit = Number(healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 0);
    const underLimit = dailyLimit <= 0 || sentToday < dailyLimit;
    return !!account.isActive && !!getSenderEmail(account) && underLimit;
  }).length;
  const accountsNeedingAttention = smtpAccounts.filter((account) => {
    const healthSnapshot = smtpHealthById.get(account.id);
    const testResult = testResults[account.id];
    const sentToday = Number(healthSnapshot?.sentToday ?? account.sentToday ?? 0);
    const dailyLimit = Number(healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 0);
    const usagePct = dailyLimit > 0 ? (sentToday / dailyLimit) * 100 : 0;
    const accountHealth = Number(healthSnapshot?.health) || 0;
    return !account.isActive || usagePct >= 90 || (accountHealth > 0 && accountHealth < 55) || (testResult && testResult.success === false);
  }).length;

  const getProviderLabel = (host = '') => {
    const normalizedHost = String(host || '').toLowerCase();
    if (normalizedHost.includes('gmail') || normalizedHost.includes('google')) return 'Google';
    if (normalizedHost.includes('outlook') || normalizedHost.includes('office365') || normalizedHost.includes('hotmail')) return 'Microsoft';
    if (normalizedHost.includes('amazonaws') || normalizedHost.includes('ses')) return 'Amazon SES';
    if (normalizedHost.includes('mailgun')) return 'Mailgun';
    if (normalizedHost.includes('sendgrid')) return 'SendGrid';
    if (normalizedHost.includes('zoho')) return 'Zoho';
    if (normalizedHost.includes('yahoo')) return 'Yahoo';
    return 'Custom SMTP';
  };

  const getAccountRecommendation = (account, healthSnapshot, testResult) => {
    const sentToday = Number(healthSnapshot?.sentToday ?? account.sentToday ?? 0);
    const dailyLimit = Number(healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 0);
    const usagePct = dailyLimit > 0 ? (sentToday / dailyLimit) * 100 : 0;
    const accountHealth = Number(healthSnapshot?.health) || 0;

    if (!account.isActive) return 'Inactive accounts are skipped by rotation until re-enabled.';
    if (!account.fromEmail) return 'Add a sender email so campaigns can align this account to a domain.';
    if (!account.replyTo) return 'Add a reply-to address so replies stay predictable for recipients.';
    if ((!account.dkimSelector || !account.dkimDomain) && getSenderDomain(account)) return 'Add DKIM details for stronger alignment and inbox trust.';
    if (testResult && testResult.success === false) return 'This account failed its last detailed test and should be retested before large sends.';
    if (usagePct >= 90) return 'This account is close to its daily cap and may need rotation support from another sender.';
    if (accountHealth > 0 && accountHealth < 55) return 'Deliverability health is soft here; warm it up gently and review recent send quality.';
    return 'Ready to participate in rotation with current settings.';
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
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your email sending settings.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => refreshSettingsSurface()}>
          <RefreshCw size={14} /> Refresh Surface
        </button>
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
          className={`tab ${activeTab === 'domain' ? 'active' : ''}`}
          onClick={() => setActiveTab('domain')}
        >
          <Search size={16} style={{ marginRight: '6px' }} />
          Domain Health
        </button>
        <button
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <SettingsIcon size={16} style={{ marginRight: '6px' }} />
          General
        </button>
        <button
          className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Sparkles size={16} style={{ marginRight: '6px' }} />
          AI
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
        <div className="section-stack">
          <div className="panel-grid">
            <div className="insight-card">
              <div className="insight-value">{activeAccounts}/{Math.max(totalAccounts, 1)}</div>
              <div className="insight-label">Active Sending Pool</div>
              <div className="insight-meta">
                {totalAccounts > 0
                  ? `${Math.max(totalAccounts - activeAccounts, 0)} account(s) are currently inactive`
                  : 'Add at least two SMTP accounts for safe rotation'}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">{remainingCapacity.toLocaleString()}</div>
              <div className="insight-label">Daily Headroom</div>
              <div className="insight-meta">
                {totalUsedToday.toLocaleString()} used today out of {totalDailyLimit.toLocaleString()} scheduled capacity
              </div>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${totalDailyLimit > 0 ? Math.min((totalUsedToday / totalDailyLimit) * 100, 100) : 0}%`,
                    background: totalDailyLimit > 0 && totalUsedToday / totalDailyLimit > 0.9
                      ? 'var(--error)'
                      : totalDailyLimit > 0 && totalUsedToday / totalDailyLimit > 0.7
                        ? 'var(--warning)'
                        : 'var(--success)'
                  }}
                />
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">{averageHealth || '--'}</div>
              <div className="insight-label">Average SMTP Health</div>
              <div className="insight-meta">
                {smtpHealth.length > 0
                  ? 'Live health score based on deliverability history and account status'
                  : 'Health scoring appears once sending activity is recorded'}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">{warmupAccounts}</div>
              <div className="insight-label">Warmup Protected</div>
              <div className="insight-meta">
                {warmupAccounts > 0
                  ? 'Accounts with warmup enabled are ramping more safely'
                  : 'Enable warmup for new senders before pushing volume'}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">{rotationReadyAccounts}</div>
              <div className="insight-label">Rotation Ready</div>
              <div className="insight-meta">
                {rotationReadyAccounts > 0
                  ? `${accountsNeedingAttention} account(s) currently need operator attention`
                  : 'No active accounts are currently ready to absorb sending volume'}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">{senderDomains.length || '--'}</div>
              <div className="insight-label">Sender Domains</div>
              <div className="insight-meta">
                {senderDomains.length > 0
                  ? senderDomains.join(', ')
                  : 'Add sender emails to understand your current domain footprint'}
              </div>
            </div>
          </div>

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
                const healthSnapshot = smtpHealthById.get(account.id);
                const dailyUsed = healthSnapshot?.sentToday ?? account.sentToday ?? 0;
                const dailyLimit = healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 500;
                const usagePct = dailyLimit > 0 ? Math.min((dailyUsed / dailyLimit) * 100, 100) : 0;
                const accountHealth = Number(healthSnapshot?.health) || 0;
                const providerLabel = getProviderLabel(account.host);
                const senderDomain = getSenderDomain(account) || 'No sender domain';
                const recommendation = getAccountRecommendation(account, healthSnapshot, testResult);
                const accountNeedsAttention =
                  usagePct >= 90 ||
                  (accountHealth > 0 && accountHealth < 55) ||
                  (testResult && testResult.success === false);

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
                          <span className={`badge ${account.isActive ? 'badge-success' : 'badge-default'}`} style={{ fontSize: '10px' }}>
                            {account.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {!!account.warmUpEnabled && (
                            <span className="badge badge-warning" style={{ fontSize: '10px' }}>Warmup</span>
                          )}
                          {accountHealth > 0 && (
                            <span
                              className={`badge ${accountHealth >= 80 ? 'badge-success' : accountHealth >= 55 ? 'badge-warning' : 'badge-error'}`}
                              style={{ fontSize: '10px' }}
                            >
                              Health {accountHealth}
                            </span>
                          )}
                          {testResult && (
                            testResult.success
                              ? <CheckCircle size={14} style={{ color: '#22c55e' }} />
                              : <XCircle size={14} style={{ color: '#ef4444' }} />
                          )}
                        </div>
                        <div className="text-sm text-muted">{account.host}:{account.port} ({account.secure ? 'SSL' : 'STARTTLS'})</div>
                        <div className="text-sm text-muted">{account.fromName} &lt;{account.fromEmail}&gt;</div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                          <span className="badge badge-default" style={{ fontSize: '10px' }}>{providerLabel}</span>
                          <span className="badge badge-default" style={{ fontSize: '10px' }}>{senderDomain}</span>
                          <span className={`badge ${account.replyTo ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                            {account.replyTo ? 'Reply-To Ready' : 'Reply-To Missing'}
                          </span>
                          <span className={`badge ${account.dkimSelector && account.dkimDomain ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                            {account.dkimSelector && account.dkimDomain ? 'DKIM Ready' : 'DKIM Incomplete'}
                          </span>
                        </div>

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

                        <div style={{
                          marginTop: '10px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: accountNeedsAttention
                            ? 'rgba(245, 158, 11, 0.10)'
                            : 'var(--bg-tertiary)',
                          color: accountNeedsAttention
                            ? 'var(--warning)'
                            : 'var(--text-secondary)',
                          fontSize: '12px',
                          border: `1px solid ${accountNeedsAttention ? 'rgba(245, 158, 11, 0.25)' : 'var(--border)'}`
                        }}>
                          {recommendation}
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

                    {/* Detailed test results */}
                    {testResult && testResult.steps && testResult.steps.length > 0 && (
                      <div style={{ marginTop: '8px', padding: '10px', borderRadius: '6px', background: 'var(--bg-tertiary)', fontSize: '12px' }}>
                        {testResult.steps.map((step, si) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                            {step.status === 'pass' ? <CheckCircle size={12} style={{ color: 'var(--success)' }} />
                              : step.status === 'fail' ? <XCircle size={12} style={{ color: 'var(--error)' }} />
                              : <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
                            <span style={{ fontWeight: 500, textTransform: 'capitalize', minWidth: '60px' }}>{step.step}</span>
                            <span style={{ color: step.status === 'fail' ? 'var(--error)' : 'var(--text-muted)' }}>{step.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {testResult && !testResult.steps && !testResult.success && (
                      <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', fontSize: '12px', color: '#ef4444' }}>
                        {testResult.error || testResult.message}
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

            {/* Unsubscribe Email */}
            <div className="form-group">
              <label className="form-label">Unsubscribe Email</label>
              <input type="email" className="form-input" placeholder="unsubscribe@yourdomain.com"
                value={accountForm.unsubscribeEmail}
                onChange={(e) => setAccountForm({ ...accountForm, unsubscribeEmail: e.target.value })}
              />
              <small className="text-muted">Added to List-Unsubscribe header — improves inbox placement</small>
            </div>

            {/* DKIM Configuration */}
            <div style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={14} style={{ color: 'var(--accent)' }} /> DKIM Signing <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(strongly recommended for inbox delivery)</span>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">DKIM Domain</label>
                  <input type="text" className="form-input" placeholder="yourdomain.com"
                    value={accountForm.dkimDomain}
                    onChange={(e) => setAccountForm({ ...accountForm, dkimDomain: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">DKIM Selector</label>
                  <input type="text" className="form-input" placeholder="mail (or default)"
                    value={accountForm.dkimSelector}
                    onChange={(e) => setAccountForm({ ...accountForm, dkimSelector: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">DKIM Private Key</label>
                <textarea className="form-textarea" style={{ minHeight: '80px', fontFamily: 'monospace', fontSize: '11px' }}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  value={accountForm.dkimPrivateKey}
                  onChange={(e) => setAccountForm({ ...accountForm, dkimPrivateKey: e.target.value })}
                />
                <small className="text-muted">Paste your DKIM private key. Generate via your DNS/hosting panel and add the TXT record to DNS.</small>
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
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={accountForm.rejectUnauthorized !== false}
                  onChange={(e) => setAccountForm({ ...accountForm, rejectUnauthorized: e.target.checked })}
                /> Verify TLS Certificate
              </label>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!accountForm.warmUpEnabled}
                  onChange={(e) => setAccountForm({ ...accountForm, warmUpEnabled: e.target.checked })}
                /> Enable Warmup
              </label>
            </div>
            {accountForm.warmUpEnabled && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="form-label">Warmup Start Date</label>
                <input type="date" className="form-input"
                  value={accountForm.warmUpStartDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setAccountForm({ ...accountForm, warmUpStartDate: e.target.value })}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-outline" onClick={() => { setShowAccountModal(false); setEditingAccount(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveAccount}>
                <Save size={16} /> {editingAccount ? 'Update' : 'Add'} Account
              </button>
            </div>
          </Modal>
        </div>
        </div>
      )}

      {/* ===== DELIVERABILITY TAB ===== */}
      {activeTab === 'deliverability' && (
        <div className="section-stack">
          <div className="panel-grid">
            <div className="insight-card">
              <div className="insight-value" style={{ color: readinessTone }}>{readinessScore}%</div>
              <div className="insight-label">Domain Readiness</div>
              <div className="insight-meta">
                Sender footprint: {senderFootprint}
              </div>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${readinessScore}%`, background: readinessTone }} />
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">
                {[deliverabilityInfo.spfConfigured, deliverabilityInfo.dkimConfigured, deliverabilityInfo.dmarcConfigured].filter(Boolean).length}/3
              </div>
              <div className="insight-label">Authentication Coverage</div>
              <div className="insight-meta">
                SPF, DKIM, and DMARC should all be green before pushing volume.
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value">
                {String(deliverabilityInfo.trackingDomain || '').trim() ? 'Ready' : 'Local'}
              </div>
              <div className="insight-label">Tracking Surface</div>
              <div className="insight-meta">
                {String(deliverabilityInfo.trackingDomain || '').trim()
                  ? `Using ${deliverabilityInfo.trackingDomain}`
                  : 'Using the built-in localhost tracking domain'}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-value" style={{ textTransform: 'capitalize' }}>
                {deliverabilityInfo.sendingMode || 'bulk'}
              </div>
              <div className="insight-label">Send Profile</div>
              <div className="insight-meta">
                {deliverabilityInfo.sendingMode === 'personal'
                  ? 'Best for smaller conversational or transactional sends.'
                  : 'Best for campaigns with proper unsubscribe and footer compliance.'}
              </div>
            </div>
          </div>

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

            {/* Sending Mode */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Sending Mode</label>
              <select className="form-select"
                value={deliverabilityInfo.sendingMode || 'bulk'}
                onChange={(e) => setDeliverabilityInfo({ ...deliverabilityInfo, sendingMode: e.target.value })}
              >
                <option value="bulk">Bulk / Marketing — includes List-Unsubscribe header</option>
                <option value="personal">Personal / Transactional — omits List-Unsubscribe (better Primary inbox)</option>
              </select>
              <small className="text-muted">Personal mode omits the List-Unsubscribe header — Gmail is less likely to route to Promotions.</small>
            </div>

            {/* Physical Address (CAN-SPAM / GDPR requirement) */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Company / Physical Address</label>
              <input type="text" className="form-input"
                placeholder="© 2025 Your Company · 123 Main St, City, State"
                value={deliverabilityInfo.companyAddress || ''}
                onChange={(e) => setDeliverabilityInfo({ ...deliverabilityInfo, companyAddress: e.target.value })}
              />
              <small className="text-muted">CAN-SPAM and GDPR require a physical address in bulk emails. Auto-appended to every campaign email footer.</small>
            </div>

            {/* DNS Status Display — synced from Domain Health checks */}
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>DNS Configuration Status</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
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
              <button className="btn btn-outline btn-sm mt-3" onClick={() => { setActiveTab('domain'); handleCheckDomain(); }}>
                <Search size={14} /> Run Domain Health Check to Update
              </button>
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

      {/* ===== DOMAIN HEALTH TAB ===== */}
      {activeTab === 'domain' && (
        <div>
          <div className="card mb-4">
            <h3 className="card-title mb-4"><Search size={20} style={{ marginRight: '8px' }} /> Domain Health Check</h3>
            <p className="text-muted mb-4 text-sm">
              Check your sending domain's DNS records for SPF, DKIM, DMARC, and MX configuration. This helps ensure your emails reach the inbox.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div style={{ flex: 1 }}>
                <div className="text-sm text-muted mb-1">Domain to check (from your active sender address):</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                  {effectiveSendingDomain || <span style={{ color: '#ef4444' }}>No sender address configured</span>}
                </div>
                {effectiveFromEmail && (
                  <div className="text-sm text-muted mt-1">Using {effectiveFromEmail}</div>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCheckDomain}
                disabled={checkingDomain || !effectiveSendingDomain}
              >
                {checkingDomain ? (
                  <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</>
                ) : (
                  <><Search size={16} /> Check Domain</>
                )}
              </button>
            </div>

            {domainCheckResults && (
              <div>
                <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Results for <strong>{domainCheckResults.domain}</strong></h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {/* MX Record */}
                  <div style={{
                    padding: '16px', borderRadius: '8px',
                    border: `1px solid ${domainCheckResults.mx?.found ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    background: domainCheckResults.mx?.found ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {domainCheckResults.mx?.found
                        ? <CheckCircle size={16} style={{ color: '#22c55e' }} />
                        : <XCircle size={16} style={{ color: '#ef4444' }} />}
                      <strong style={{ fontSize: '13px' }}>MX Records</strong>
                    </div>
                    <div className="text-sm text-muted">Mail server routing</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: domainCheckResults.mx?.found ? '#22c55e' : '#ef4444' }}>
                      {domainCheckResults.mx?.found ? 'Found' : 'Not Found'}
                    </div>
                    {domainCheckResults.mx?.found && domainCheckResults.mx.records && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {domainCheckResults.mx.records.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* SPF Record */}
                  <div style={{
                    padding: '16px', borderRadius: '8px',
                    border: `1px solid ${domainCheckResults.spf?.found ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    background: domainCheckResults.spf?.found ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {domainCheckResults.spf?.found
                        ? <CheckCircle size={16} style={{ color: '#22c55e' }} />
                        : <XCircle size={16} style={{ color: '#ef4444' }} />}
                      <strong style={{ fontSize: '13px' }}>SPF Record</strong>
                    </div>
                    <div className="text-sm text-muted">Sender authorization</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: domainCheckResults.spf?.found ? '#22c55e' : '#ef4444' }}>
                      {domainCheckResults.spf?.found ? 'Found' : 'Not Found'}
                    </div>
                    {domainCheckResults.spf?.found && domainCheckResults.spf.records && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {domainCheckResults.spf.records.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* DKIM Record */}
                  <div style={{
                    padding: '16px', borderRadius: '8px',
                    border: `1px solid ${domainCheckResults.dkim?.found ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    background: domainCheckResults.dkim?.found ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {domainCheckResults.dkim?.found
                        ? <CheckCircle size={16} style={{ color: '#22c55e' }} />
                        : <XCircle size={16} style={{ color: '#ef4444' }} />}
                      <strong style={{ fontSize: '13px' }}>DKIM Record</strong>
                    </div>
                    <div className="text-sm text-muted">Message signing</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: domainCheckResults.dkim?.found ? '#22c55e' : '#ef4444' }}>
                      {domainCheckResults.dkim?.found ? 'Found' : 'Not Found'}
                    </div>
                    {domainCheckResults.dkim?.found && domainCheckResults.dkim.selector && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Selector: {domainCheckResults.dkim.selector}
                      </div>
                    )}
                    {domainCheckResults.dkim?.found && domainCheckResults.dkim.records?.length > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {domainCheckResults.dkim.records.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* DMARC Record */}
                  <div style={{
                    padding: '16px', borderRadius: '8px',
                    border: `1px solid ${domainCheckResults.dmarc?.found ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    background: domainCheckResults.dmarc?.found ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {domainCheckResults.dmarc?.found
                        ? <CheckCircle size={16} style={{ color: '#22c55e' }} />
                        : <XCircle size={16} style={{ color: '#ef4444' }} />}
                      <strong style={{ fontSize: '13px' }}>DMARC Record</strong>
                    </div>
                    <div className="text-sm text-muted">Domain spoofing protection</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: domainCheckResults.dmarc?.found ? '#22c55e' : '#ef4444' }}>
                      {domainCheckResults.dmarc?.found ? 'Found' : 'Not Found'}
                    </div>
                    {domainCheckResults.dmarc?.found && domainCheckResults.dmarc.records && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                        {domainCheckResults.dmarc.records.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendations */}
                {(domainCheckResults.spf?.recommendation || domainCheckResults.dkim?.recommendation || domainCheckResults.dmarc?.recommendation || !domainCheckResults.mx?.found) && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '16px' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                      <strong style={{ fontSize: '14px' }}>Recommended DNS Records to Add</strong>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {!domainCheckResults.mx?.found && (
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                          <strong style={{ color: '#ef4444' }}>MX Record Missing:</strong>
                          <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                            {domainCheckResults.mx?.isNullMx
                              ? 'This domain publishes a null MX record, which means it does not accept mail.'
                              : 'Your domain has no MX records. Contact your hosting provider to set up mail routing.'}
                          </div>
                        </div>
                      )}
                      {domainCheckResults.spf?.recommendation && (
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                          <strong style={{ color: '#f59e0b' }}>SPF Record:</strong>
                          <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            {domainCheckResults.spf.recommendation}
                          </div>
                        </div>
                      )}
                      {domainCheckResults.dkim?.recommendation && (
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                          <strong style={{ color: '#f59e0b' }}>DKIM Record:</strong>
                          <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            {domainCheckResults.dkim.recommendation}
                          </div>
                        </div>
                      )}
                      {domainCheckResults.dmarc?.recommendation && (
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                          <strong style={{ color: '#f59e0b' }}>DMARC Record:</strong>
                          <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            {domainCheckResults.dmarc.recommendation}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* All good message */}
                {domainCheckResults.mx?.found && domainCheckResults.spf?.found && domainCheckResults.dkim?.found && domainCheckResults.dmarc?.found && (
                  <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                    <CheckCircle size={24} style={{ color: '#22c55e', marginBottom: '8px' }} />
                    <div style={{ fontWeight: 600, color: '#22c55e' }}>All DNS records are properly configured!</div>
                    <div className="text-sm text-muted mt-1">Your domain is set up correctly for email deliverability.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tracking Domain Configuration */}
          <div className="card">
            <h3 className="card-title mb-4"><Globe size={20} style={{ marginRight: '8px' }} /> Tracking Domain</h3>
            <div className="form-group">
              <label className="form-label">Custom Tracking Domain</label>
              <input type="text" className="form-input" placeholder="track.yourdomain.com"
                value={deliverabilityInfo.trackingDomain}
                onChange={(e) => setDeliverabilityInfo({ ...deliverabilityInfo, trackingDomain: e.target.value })}
              />
              <small className="text-muted">CNAME this to your tracking server for branded open/click tracking URLs.</small>
            </div>
            <button className="btn btn-primary mt-3" onClick={handleSaveDeliverability}>
              <Save size={16} /> Save Tracking Domain
            </button>
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

      {/* ===== AI TAB ===== */}
      {activeTab === 'ai' && (
        <div className="card">
          <h3 className="card-title mb-4">
            <Sparkles size={20} style={{ marginRight: '8px', color: 'var(--accent)' }} />
            AI Intelligence (OpenRouter)
          </h3>
          <p className="text-muted mb-4" style={{ fontSize: '13px' }}>
            Connect to OpenRouter to unlock AI-powered subject line optimization, content analysis, and email generation. Get a free API key at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">openrouter.ai</a>
          </p>

          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              type="password"
              className="form-input"
              placeholder="sk-or-v1-..."
              value={aiSettings.apiKey}
              onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Model</label>
            <select
              className="form-select"
              value={aiSettings.model}
              onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
            >
              <optgroup label="Free Models">
                <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B (Free)</option>
                <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                <option value="google/gemma-2-9b-it:free">Gemma 2 9B (Free)</option>
              </optgroup>
              <optgroup label="OpenAI (Paid)">
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                <option value="openai/gpt-4-turbo">GPT-4 Turbo</option>
                <option value="openai/o1">OpenAI o1</option>
                <option value="openai/o1-mini">OpenAI o1 Mini</option>
                <option value="openai/o3-mini">OpenAI o3 Mini</option>
              </optgroup>
              <optgroup label="Anthropic (Paid)">
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
                <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
              </optgroup>
              <optgroup label="Google (Paid)">
                <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                <option value="google/gemini-pro-1.5">Gemini 1.5 Pro</option>
              </optgroup>
              <optgroup label="Mistral (Paid)">
                <option value="mistralai/mistral-large">Mistral Large</option>
                <option value="mistralai/mixtral-8x22b-instruct">Mixtral 8x22B</option>
              </optgroup>
              <optgroup label="Meta Llama (Paid)">
                <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                <option value="meta-llama/llama-3.1-405b-instruct">Llama 3.1 405B</option>
              </optgroup>
              <optgroup label="DeepSeek (Paid)">
                <option value="deepseek/deepseek-chat">DeepSeek V3</option>
                <option value="deepseek/deepseek-r1">DeepSeek R1</option>
              </optgroup>
              <optgroup label="xAI (Paid)">
                <option value="x-ai/grok-2">Grok 2</option>
                <option value="x-ai/grok-3-mini-beta">Grok 3 Mini</option>
              </optgroup>
            </select>
            <small className="text-muted">Paid models require credits on your OpenRouter account</small>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleSaveAiSettings}>
              <Save size={16} /> Save Settings
            </button>
            <button className="btn btn-outline" onClick={handleTestAi} disabled={aiTesting}>
              <TestTube size={16} /> {aiTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>What AI Can Do in Bulky</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {[
              { title: 'Subject Line Optimizer', desc: 'Generate 5 high-performing subject line variations' },
              { title: 'Content Analysis', desc: 'Score your email content and get improvement tips' },
              { title: 'Email Generator', desc: 'Generate full email content from a simple prompt' },
              { title: 'Template Block Builder', desc: 'Generate structured drag-and-drop template blocks from a prompt' },
              { title: 'Local Insights', desc: 'Offline analysis of length, personalization, CTA, and spam risk' },
              { title: '20+ Models', desc: 'GPT-4o, Claude 3.5, Gemini 2.0, Grok, DeepSeek, Llama, and more' }
            ].map((f, i) => (
              <div key={i} style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{f.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            ))}
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

          <div style={{ marginTop: '24px' }}>
            <h4 style={{ marginBottom: '12px' }}>
              <Trash2 size={18} style={{ marginRight: '8px', color: '#ef4444' }} /> Reset Everything
            </h4>
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

          {/* Auto-Backup Config */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ marginBottom: '12px' }}><RefreshCw size={18} style={{ marginRight: '8px' }} /> Auto-Backup</h4>
            <p className="text-sm text-muted mb-3">Automatically back up your database on a schedule. Last 5 auto-backups are kept.</p>
            <div className="flex gap-3 items-center">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoBackupConfig.enabled}
                  onChange={(e) => {
                    const updated = { ...autoBackupConfig, enabled: e.target.checked };
                    setAutoBackupConfig(updated);
                    window.electron.backup.autoConfig(updated);
                    addToast(e.target.checked ? 'Auto-backup enabled' : 'Auto-backup disabled', 'success');
                  }} />
                Enable auto-backup
              </label>
              <select className="form-select" style={{ width: '180px' }} value={autoBackupConfig.intervalHours}
                onChange={(e) => {
                  const updated = { ...autoBackupConfig, intervalHours: parseInt(e.target.value) };
                  setAutoBackupConfig(updated);
                  window.electron.backup.autoConfig(updated);
                }}>
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Every 24 hours</option>
                <option value="72">Every 3 days</option>
                <option value="168">Weekly</option>
              </select>
            </div>
          </div>

          {/* Backup History */}
          {backupHistory.length > 0 && (
            <div>
              <h4 style={{ marginBottom: '12px' }}><Database size={18} style={{ marginRight: '8px' }} /> Recent Backups</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {backupHistory.map((b, i) => (
                  <div key={b.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{b.filename}</span>
                      <span className={`badge badge-${b.type === 'auto' ? 'info' : 'default'} ml-2`}>{b.type}</span>
                    </div>
                    <div className="text-muted text-sm">{b.createdAt ? new Date(b.createdAt).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Settings;
