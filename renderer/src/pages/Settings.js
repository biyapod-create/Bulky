import React, { useState, useEffect, useCallback } from 'react';
import { Save, TestTube, Server, Mail, AlertTriangle, Plus, Trash2, Edit3, CheckCircle, XCircle, Shield, TrendingUp, RefreshCw, Globe, Key, Search } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useTheme } from '../components/ThemeContext';
import { useEntitlement } from '../components/EntitlementContext';
import { useNavigation } from '../components/NavigationContext';
import { getPrimarySmtpAccount as getPrimaryAccount, getSenderDomain, getSenderEmail } from '../utils/smtpAccounts';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';
import { VALID_TABS } from '../features/settings/settingsConfig';
import SettingsSidebar from '../features/settings/SettingsSidebar';
import SmtpConfigTab from '../features/settings/SmtpConfigTab';
import GeneralSettingsTab from '../features/settings/GeneralSettingsTab';
import CloudServicesTab from '../features/settings/CloudServicesTab';
import AiSettingsTab from '../features/settings/AiSettingsTab';
import BackupSettingsTab from '../features/settings/BackupSettingsTab';

const { buildInboxReadinessGuardrails } = require('../utils/deliverability');

const DEFAULT_CLOUD_CONFIG = {
  apiBaseUrl: '',
  trackingBaseUrl: '',
  updatesBaseUrl: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  hasSupabaseAnonKey: false,
  clearSupabaseAnonKey: false,
  paystackPublicKey: '',
  hasPaystackPublicKey: false,
  clearPaystackPublicKey: false,
  paystackCheckoutBaseUrl: ''
};

const DEFAULT_CLOUD_STATUS = {
  apiBaseUrl: '',
  trackingBaseUrl: '',
  updatesBaseUrl: '',
  cloudflare: {
    apiConfigured: false,
    trackingConfigured: false,
    updatesConfigured: false
  },
  supabase: {
    configured: false,
    url: '',
    hasAnonKey: false
  },
  paystack: {
    configured: false,
    hasPublicKey: false,
    checkoutBaseUrl: ''
  },
  hybridReady: false
};

const DEFAULT_ACCOUNT_STATUS = {
  provider: 'supabase',
  configured: false,
  authenticated: false,
  status: 'needs_configuration',
  account: {
    id: '',
    email: '',
    fullName: '',
    avatarUrl: '',
    workspaceName: '',
    providers: []
  },
  plan: {
    id: 'legacy',
    name: 'Local Build',
    description: 'Current local Bulky build'
  },
  mode: 'local',
  entitlementStatus: 'active',
  subscription: {
    provider: '',
    status: '',
    reference: '',
    customerCode: '',
    currentPeriodEnd: null
  },
  devices: {
    total: 0
  },
  lastValidatedAt: null,
  accessTokenExpiresAt: null,
  graceEndsAt: null,
  serviceWindowEndsAt: null,
  lastError: ''
};

const DEFAULT_SYNC_STATUS = {
  available: false,
  enabled: false,
  connected: false,
  state: 'idle',
  reason: 'not_started',
  accountId: '',
  planId: '',
  watchedTables: [],
  lastSyncAt: null,
  lastEventAt: null,
  lastEventTable: '',
  lastError: ''
};

const DEFAULT_DESKTOP_SIGN_IN_FORM = {
  email: '',
  password: ''
};

const DEFAULT_DESKTOP_SIGN_UP_FORM = {
  fullName: '',
  workspaceName: '',
  email: '',
  password: ''
};

function mergeAccountStatus(status = {}) {
  return {
    ...DEFAULT_ACCOUNT_STATUS,
    ...status,
    account: {
      ...DEFAULT_ACCOUNT_STATUS.account,
      ...(status.account || {})
    },
    plan: {
      ...DEFAULT_ACCOUNT_STATUS.plan,
      ...(status.plan || {})
    },
    subscription: {
      ...DEFAULT_ACCOUNT_STATUS.subscription,
      ...(status.subscription || {})
    },
    devices: {
      ...DEFAULT_ACCOUNT_STATUS.devices,
      ...(status.devices || {})
    }
  };
}

function Settings({ isActive }) {
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { entitlementState, hasCapability } = useEntitlement();
  const { pageParams, navigateTo } = useNavigation();
  const [activeTab, setActiveTab] = useState('general');

  // Deep-link: when navigated to /settings?tab=X or with pageParams, open that tab
  useEffect(() => {
    const param = pageParams?.['/settings']?.tab;
    if (param && VALID_TABS.includes(param)) setActiveTab(param);
  }, [pageParams]);
  useEffect(() => {
    if (activeTab === 'ai' && !hasCapability('aiAssistant')) {
      setActiveTab('general');
    }
  }, [activeTab, hasCapability]);
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
  const [appVersion, setAppVersion] = useState('');
  const [systemDiagnostics, setSystemDiagnostics] = useState(null);
  const [aiDiagnostics, setAiDiagnostics] = useState(null);
  const [cloudConfig, setCloudConfig] = useState(DEFAULT_CLOUD_CONFIG);
  const [cloudStatus, setCloudStatus] = useState(DEFAULT_CLOUD_STATUS);
  const [loadingCloudConfig, setLoadingCloudConfig] = useState(false);
  const [savingCloudConfig, setSavingCloudConfig] = useState(false);
  const [accountStatus, setAccountStatus] = useState(DEFAULT_ACCOUNT_STATUS);
  const [desktopAccountForm, setDesktopAccountForm] = useState(DEFAULT_DESKTOP_SIGN_IN_FORM);
  const [desktopSignUpForm, setDesktopSignUpForm] = useState(DEFAULT_DESKTOP_SIGN_UP_FORM);
  const [loadingAccountStatus, setLoadingAccountStatus] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [syncStatus, setSyncStatus] = useState(DEFAULT_SYNC_STATUS);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [cloudDiagnostics, setCloudDiagnostics] = useState(null);
  const [testingCloudConnections, setTestingCloudConnections] = useState(false);

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
    hasStoredPassword: false,
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

  // Seed Accounts (for Inbox Placement testing)
  const [seedAccounts, setSeedAccounts] = useState([]);
  const [seedForm, setSeedForm]         = useState({ email: '', provider: 'gmail', isActive: true });
  const [seedLoading, setSeedLoading]   = useState(false);

  const loadSeedAccounts = async () => {
    try { const d = await window.electron?.seed?.getAll?.(); setSeedAccounts(Array.isArray(d) ? d : []); } catch {}
  };
  const createSeed = async () => {
    if (!seedForm.email.trim()) { addToast('Email is required', 'error'); return; }
    setSeedLoading(true);
    try {
      const r = await window.electron?.seed?.create?.(seedForm);
      if (r?.error) throw new Error(r.error);
      addToast('Seed account added', 'success');
      setSeedForm({ email: '', provider: 'gmail', isActive: true });
      loadSeedAccounts();
    } catch (e) { addToast(e.message || 'Failed', 'error'); }
    finally { setSeedLoading(false); }
  };
  const deleteSeed = async (id) => {
    if (!window.confirm('Remove this seed account?')) return;
    try { await window.electron?.seed?.delete?.(id); addToast('Removed', 'success'); loadSeedAccounts(); }
    catch (e) { addToast('Failed', 'error'); }
  };
  const toggleSeed = async (acc) => {
    try {
      await window.electron?.seed?.update?.({ ...acc, isActive: !acc.isActive });
      loadSeedAccounts();
    } catch {}
  };

  // Legacy single SMTP (kept for backward compat)
  const [smtpSettings, setSmtpSettings] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    hasStoredPassword: false,
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

  // AI Settings - no hardcoded API key or model
  const [aiSettings, setAiSettings] = useState({
    enabled: true,
    apiKey: '',
    hasApiKey: false,
    clearApiKey: false,
    model: '',
    provider: 'openrouter',
    lmstudioBaseUrl: 'http://localhost:1234/v1'
  });
  const [aiTesting, setAiTesting] = useState(false);
  const [lmStudioModels, setLmStudioModels] = useState([]);
  const [lmStudioLoading, setLmStudioLoading] = useState(false);

  // Deliverability
  const [deliverabilityInfo, setDeliverabilityInfo] = useState({
    trackingDomain: '',
    dkimConfigured: false,
    spfConfigured: false,
    dmarcConfigured: false,
    sendingMode: 'bulk',
    companyAddress: ''
  });

  const normalizeAiSettingsState = useCallback((settings = {}) => ({
    enabled: settings.enabled !== false && settings.enabled !== 'false',
    apiKey: '',
    hasApiKey: !!settings.hasApiKey,
    clearApiKey: false,
    model: settings.model || '',
    provider: settings.provider || 'openrouter',
    lmstudioBaseUrl: settings.lmstudioBaseUrl || 'http://localhost:1234/v1'
  }), []);

  const buildAiSettingsPayload = useCallback((settings = {}) => ({
    enabled: settings.enabled !== false && settings.enabled !== 'false',
    apiKey: settings.apiKey || '',
    hasApiKey: !!settings.hasApiKey,
    clearApiKey: !!settings.clearApiKey,
    model: settings.model || '',
    provider: settings.provider || 'openrouter',
    lmstudioBaseUrl: settings.lmstudioBaseUrl || 'http://localhost:1234/v1'
  }), []);

  const syncAiSettingsAfterSave = useCallback((settings, result = {}) => {
    const next = normalizeAiSettingsState({
      ...settings,
      hasApiKey: result.hasApiKey !== undefined
        ? result.hasApiKey
        : ((!!settings.hasApiKey && !settings.clearApiKey) || !!settings.apiKey)
    });
    setAiSettings(next);
    aiSettingsRef.current = next;
    return next;
  }, [normalizeAiSettingsState]);

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

  const formatBytes = (bytes) => {
    const size = Number(bytes || 0);
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const value = size / (1024 ** unitIndex);
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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
    loadCloudConfig();
    loadAccountStatus();
    loadSyncStatus();
    loadDiagnostics();
    loadSeedAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when becoming the active tab
  useEffect(() => {
    if (isActive) {
      loadSmtpAccounts();
      loadSmtpOverview();
      loadDeliverabilityInfo();
      loadBackupHistory();
      loadCloudConfig();
      loadAccountStatus();
      loadSyncStatus();
      loadDiagnostics();
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
        loadCloudConfig();
        loadAccountStatus();
        loadSyncStatus();
        loadDiagnostics();
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
        if (settings) {
          const normalized = normalizeAiSettingsState(settings);
          setAiSettings(normalized);
          // Keep ref in sync so loadLmStudioModels reads fresh URL without
          // needing aiSettings in its dep array.
          aiSettingsRef.current = normalized;
        }
      }
      // Bug-fix: load the full OpenRouter model list dynamically from the
      // service instead of using the old hardcoded 7-model state.
      if (window.electron?.ai?.getModels) {
        const models = await window.electron.ai.getModels();
        if (Array.isArray(models) && models.length > 0) {
          setOpenRouterModels(models);
        }
      }
    } catch (e) {
      // ignored
    }
  };

  const loadDiagnostics = useCallback(async () => {
    try {
      const [version, diagnostics, aiDiag] = await Promise.all([
        window.electron?.app?.getVersion?.() || Promise.resolve(''),
        window.electron?.settings?.getDiagnostics?.() || Promise.resolve(null),
        window.electron?.ai?.getDiagnostics?.() || Promise.resolve(null)
      ]);
      if (version) setAppVersion(version);
      if (diagnostics) {
        setSystemDiagnostics(diagnostics);
        if (!version && diagnostics.version) {
          setAppVersion(diagnostics.version);
        }
      }
      if (aiDiag) setAiDiagnostics(aiDiag);
    } catch {
      // ignored
    }
  }, []);

  const loadCloudConfig = useCallback(async () => {
    if (!window.electron?.cloud) {
      setCloudConfig(DEFAULT_CLOUD_CONFIG);
      setCloudStatus(DEFAULT_CLOUD_STATUS);
      return;
    }

    setLoadingCloudConfig(true);
    try {
      const [configResult, statusResult] = await Promise.all([
        window.electron.cloud.getConfig?.() || Promise.resolve(null),
        window.electron.cloud.getStatus?.() || Promise.resolve(null)
      ]);

      if (configResult && !configResult.error) {
        setCloudConfig({
          ...DEFAULT_CLOUD_CONFIG,
          ...configResult
        });
      }

      if (statusResult && !statusResult.error) {
        setCloudStatus({
          ...DEFAULT_CLOUD_STATUS,
          ...statusResult,
          cloudflare: {
            ...DEFAULT_CLOUD_STATUS.cloudflare,
            ...(statusResult.cloudflare || {})
          },
          supabase: {
            ...DEFAULT_CLOUD_STATUS.supabase,
            ...(statusResult.supabase || {})
          },
          paystack: {
            ...DEFAULT_CLOUD_STATUS.paystack,
            ...(statusResult.paystack || {})
          }
        });
      }
    } catch {
      // ignored
    } finally {
      setLoadingCloudConfig(false);
    }
  }, []);

  const loadAccountStatus = useCallback(async () => {
    if (!window.electron?.account?.getStatus) {
      setAccountStatus(DEFAULT_ACCOUNT_STATUS);
      return;
    }

    setLoadingAccountStatus(true);
    try {
      const nextStatus = await window.electron.account.getStatus();
      if (nextStatus && !nextStatus.error) {
        setAccountStatus(mergeAccountStatus(nextStatus));
      }
    } catch {
      // ignored
    } finally {
      setLoadingAccountStatus(false);
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    if (!window.electron?.cloud?.getSyncStatus) {
      setSyncStatus(DEFAULT_SYNC_STATUS);
      return;
    }

    setLoadingSyncStatus(true);
    try {
      const nextStatus = await window.electron.cloud.getSyncStatus();
      if (nextStatus && !nextStatus.error) {
        setSyncStatus({
          ...DEFAULT_SYNC_STATUS,
          ...nextStatus
        });
      }
    } catch {
      // ignored
    } finally {
      setLoadingSyncStatus(false);
    }
  }, []);

  // Bug-fix: was deduplicated via toast-ID state which itself lived in the dep
  // array of loadLmStudioModels ?????? causing the callback to be recreated on every
  // error, which re-triggered the auto-load effect, creating an infinite retry
  // loop whenever LM Studio was unreachable. Replaced with a plain ref flag.
  const lmStudioErrorShownRef = React.useRef(false);

  // Bug-fix: openRouterModels was a hardcoded 7-model stale list. Now loaded
  // dynamically from ai:getModels so the dropdown always mirrors aiService.js.
  const [openRouterModels, setOpenRouterModels] = useState([]);

  // Bug-fix: Removed aiSettings from the useCallback dep array. The function
  // was reading aiSettings.lmstudioBaseUrl from the closure which caused it to
  // be recreated on every aiSettings change ?????? and that recreation re-triggered
  // the auto-load useEffect. Fix: read lmstudioBaseUrl via a ref so the
  // callback is stable and the effect only fires when provider changes.
  const aiSettingsRef = React.useRef(null);
  const loadLmStudioModels = useCallback(async () => {
    if (!window.electron?.ai?.getLmstudioModels) return;
    setLmStudioLoading(true);
    lmStudioErrorShownRef.current = false;

    // Read current URL from ref so this callback does not need aiSettings in
    // its dep array (which would recreate it on every keystroke).
    const savedUrl = aiSettingsRef.current?.lmstudioBaseUrl || 'http://localhost:1234/v1';
    const triedEndpoints = [
      savedUrl,
      'http://localhost:1234/v1',
      'http://127.0.0.1:1234/v1',
      'http://localhost:1234',
      'http://127.0.0.1:1234'
    ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

    let found = false;
    let lastError = '';

    for (const base of triedEndpoints) {
      try {
        const result = await window.electron.ai.getLmstudioModels(base);
        if (result?.models && Array.isArray(result.models) && result.models.length > 0) {
          setLmStudioModels(result.models);
          // Update URL in settings state if we found a working endpoint
          setAiSettings((prev) => {
            const next = { ...prev, lmstudioBaseUrl: base };
            // Auto-select first model only if current model is empty
            if (!prev.model) next.model = result.models[0].id;
            return next;
          });
          addToast('LM Studio models loaded', 'success');
          found = true;
          break;
        } else if (result?.error) {
          lastError = result.error;
        } else {
          lastError = 'LM Studio reachable but no models loaded -- load a model in LM Studio first';
        }
      } catch (e) {
        lastError = e.message || 'Failed to reach LM Studio';
      }
    }

    if (!found) {
      setLmStudioModels([]);
      // Bug-fix: do NOT call setAiSettings here. The old code called
      // setAiSettings({...prev, model:''}) which created a new object reference
      // every render, which recreated this callback, which re-triggered the
      // auto-load effect ?????? infinite loop when LM Studio is unreachable.
      if (!lmStudioErrorShownRef.current) {
        lmStudioErrorShownRef.current = true;
        addToast(
          lastError.includes('ECONNREFUSED') || lastError.includes('connect') || lastError.includes('ENOTFOUND')
            ? 'LM Studio not detected. Start LM Studio, load a model, then click Load Models.'
            : (lastError || 'Could not load LM Studio models'),
          'error',
          6000
        );
      }
    }
    setLmStudioLoading(false);
  // Stable dep array ?????? no aiSettings, no error state.
  // aiSettingsRef.current is always fresh without being a dep.
  }, [addToast]);

  const handleSaveAiSettings = async () => {
    try {
      // Bug-fix: the IPC layer returns { error } as a resolved value ?????? not a
      // rejection ?????? so we must check result?.error explicitly. Previously this
      // handler showed "AI settings saved" even when the validator rejected the
      // payload (e.g. empty model on first setup).
      const result = await window.electron?.ai?.saveSettings(buildAiSettingsPayload(aiSettings));
      if (result?.error) {
        addToast('Could not save AI settings: ' + result.error, 'error');
      } else {
        syncAiSettingsAfterSave(aiSettings, result);
        addToast('AI settings saved', 'success');
      }
    } catch (e) {
      addToast('Failed to save AI settings: ' + (e.message || 'Unknown error'), 'error');
    }
  };

  const handleRefreshCloudConfig = useCallback(async () => {
    await Promise.all([
      loadCloudConfig(),
      loadAccountStatus(),
      loadSyncStatus(),
      loadDiagnostics()
    ]);
  }, [loadAccountStatus, loadCloudConfig, loadDiagnostics, loadSyncStatus]);

  const emitAccountStatusChanged = (status) => {
    if (!status) {
      return;
    }
    window.dispatchEvent(new CustomEvent('bulky:account-status-changed', { detail: status }));
  };

  const handleSaveCloudConfig = async () => {
    if (!window.electron?.cloud?.saveConfig) {
      addToast('Cloud configuration is not available in this build', 'error');
      return;
    }

    setSavingCloudConfig(true);
    try {
      const result = await window.electron.cloud.saveConfig(cloudConfig);
      if (result?.error) {
        addToast('Failed to save cloud configuration: ' + result.error, 'error');
        return;
      }

      if (result?.config) {
        setCloudConfig({
          ...DEFAULT_CLOUD_CONFIG,
          ...result.config
        });
      }

      if (result?.status) {
        setCloudStatus({
          ...DEFAULT_CLOUD_STATUS,
          ...result.status,
          cloudflare: {
            ...DEFAULT_CLOUD_STATUS.cloudflare,
            ...(result.status.cloudflare || {})
          },
          supabase: {
            ...DEFAULT_CLOUD_STATUS.supabase,
            ...(result.status.supabase || {})
          },
          paystack: {
            ...DEFAULT_CLOUD_STATUS.paystack,
            ...(result.status.paystack || {})
          }
        });
      }

      if (result?.accountStatus && !result.accountStatus.error) {
        setAccountStatus(mergeAccountStatus(result.accountStatus));
        emitAccountStatusChanged(result.accountStatus);
      }

      if (result?.syncStatus && !result.syncStatus.error) {
        setSyncStatus({
          ...DEFAULT_SYNC_STATUS,
          ...result.syncStatus
        });
      }

      await loadDiagnostics();
      await Promise.all([
        loadAccountStatus(),
        loadSyncStatus()
      ]);
      addToast('Connected service settings saved', 'success');
    } catch (error) {
      addToast('Failed to save connected service settings: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSavingCloudConfig(false);
    }
  };

  const handleAccountSignIn = async () => {
    if (!window.electron?.account?.signIn) {
      addToast('Desktop account login is not available in this build', 'error');
      return;
    }

    setSubmittingAccount(true);
    try {
      const result = await window.electron.account.signIn(desktopAccountForm);
      if (result?.error) {
        addToast('Desktop sign-in failed: ' + result.error, 'error');
        return;
      }

      if (result?.status) {
        setAccountStatus(mergeAccountStatus(result.status));
        emitAccountStatusChanged(result.status);
      }

      setDesktopAccountForm((prev) => ({ ...prev, password: '' }));
      await Promise.all([
        loadDiagnostics(),
        loadSyncStatus()
      ]);
      addToast('Desktop account connected', 'success');
    } catch (error) {
      addToast('Desktop sign-in failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleAccountSignUp = async () => {
    if (!window.electron?.account?.signUp) {
      addToast('Desktop account sign-up is not available in this build', 'error');
      return;
    }

    setSubmittingAccount(true);
    try {
      const result = await window.electron.account.signUp(desktopSignUpForm);
      if (result?.error) {
        addToast('Desktop sign-up failed: ' + result.error, 'error');
        return;
      }

      if (result?.status) {
        setAccountStatus(mergeAccountStatus(result.status));
        emitAccountStatusChanged(result.status);
      }

      setDesktopAccountForm({
        email: desktopSignUpForm.email,
        password: ''
      });
      setDesktopSignUpForm((prev) => ({
        ...prev,
        password: ''
      }));

      await Promise.all([
        loadDiagnostics(),
        loadSyncStatus()
      ]);
      addToast(
        result?.message || (result?.pendingConfirmation
          ? 'Desktop account created. Check your email to confirm it before signing in.'
          : 'Desktop account created and connected.'),
        'success'
      );
    } catch (error) {
      addToast('Desktop sign-up failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleAccountSignOut = async () => {
    if (!window.electron?.account?.signOut) {
      addToast('Desktop account sign-out is not available in this build', 'error');
      return;
    }

    setSubmittingAccount(true);
    try {
      const result = await window.electron.account.signOut();
      if (result?.error) {
        addToast('Could not sign out: ' + result.error, 'error');
        return;
      }

      if (result?.status) {
        setAccountStatus(mergeAccountStatus(result.status));
        emitAccountStatusChanged(result.status);
      }

      setDesktopAccountForm(DEFAULT_DESKTOP_SIGN_IN_FORM);
      setDesktopSignUpForm(DEFAULT_DESKTOP_SIGN_UP_FORM);
      await Promise.all([
        loadDiagnostics(),
        loadSyncStatus()
      ]);
      addToast('Desktop account signed out', 'success');
    } catch (error) {
      addToast('Could not sign out: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleAccountRefresh = async () => {
    if (!window.electron?.account?.refresh) {
      addToast('Desktop account refresh is not available in this build', 'error');
      return;
    }

    setSubmittingAccount(true);
    try {
      const result = await window.electron.account.refresh();
      if (result?.error) {
        addToast('Could not refresh the desktop session: ' + result.error, 'error');
        return;
      }

      if (result?.status) {
        setAccountStatus(mergeAccountStatus(result.status));
        emitAccountStatusChanged(result.status);
      } else {
        await loadAccountStatus();
      }

      await Promise.all([
        loadDiagnostics(),
        loadSyncStatus()
      ]);
      addToast('Desktop account session refreshed', 'success');
    } catch (error) {
      addToast('Could not refresh the desktop session: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleRunCloudDiagnostics = async () => {
    if (!window.electron?.cloud?.testConnections) {
      addToast('Connected service diagnostics are not available in this build', 'error');
      return;
    }

    setTestingCloudConnections(true);
    try {
      const result = await window.electron.cloud.testConnections();
      if (result?.error) {
        addToast('Diagnostics failed: ' + result.error, 'error');
        return;
      }

      setCloudDiagnostics(result);
      const supabaseOk = !!result?.supabase?.ok;
      const trackingOk = !!result?.cloudflare?.tracking?.ok;
      addToast(
        supabaseOk && trackingOk
          ? 'Connected service diagnostics passed'
          : 'Diagnostics finished with one or more connection issues',
        supabaseOk && trackingOk ? 'success' : 'warning'
      );
    } catch (error) {
      addToast('Diagnostics failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setTestingCloudConnections(false);
    }
  };

  const handleSyncNow = async () => {
    if (!window.electron?.cloud?.syncNow) {
      addToast('Realtime sync is not available in this build', 'error');
      return;
    }

    setLoadingSyncStatus(true);
    try {
      const result = await window.electron.cloud.syncNow();
      if (result?.error) {
        addToast('Realtime sync failed: ' + result.error, 'error');
        return;
      }

      setSyncStatus({
        ...DEFAULT_SYNC_STATUS,
        ...result
      });
      await Promise.all([
        loadAccountStatus(),
        loadDiagnostics()
      ]);
      addToast('Realtime sync completed', 'success');
    } catch (error) {
      addToast('Realtime sync failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoadingSyncStatus(false);
    }
  };

  const handleOpenCheckout = async (planId) => {
    if (!window.electron?.cloud?.openCheckout) {
      addToast('Billing checkout is not available in this build', 'error');
      return;
    }

    try {
      const result = await window.electron.cloud.openCheckout({
        planId,
        email: accountStatus?.account?.email || desktopSignUpForm.email || desktopAccountForm.email || '',
        workspaceName: accountStatus?.account?.workspaceName || desktopSignUpForm.workspaceName || '',
        source: 'settings-account'
      });

      if (result?.error) {
        addToast('Could not open billing checkout: ' + result.error, 'error');
        return;
      }

      addToast(`Opened ${planId === 'pro' ? 'Pro' : 'One-off'} checkout`, 'success');
    } catch (error) {
      addToast('Could not open billing checkout: ' + (error.message || 'Unknown error'), 'error');
    }
  };

  const handleTestAi = async () => {
    if (aiSettings.provider === 'openrouter' && !aiSettings.apiKey && !aiSettings.hasApiKey) {
      addToast('Please enter an OpenRouter API key first', 'error');
      return;
    }
    if (aiSettings.provider === 'lmstudio' && !aiSettings.lmstudioBaseUrl) {
      addToast('Please enter the LM Studio server URL first', 'error');
      return;
    }
    setAiTesting(true);
    try {
      // BUG 1 FIX: Test FIRST, persist only on success.
      // Previously saveSettings ran before testConnection so a bad key was
      // committed to the DB even when the test failed.
      const result = await window.electron?.ai?.testConnection(buildAiSettingsPayload(aiSettings));
      if (result?.error) {
        addToast('Connection failed: ' + result.error, 'error');
      } else {
        // Test passed ?????? now safe to persist
        const saveResult = await window.electron?.ai?.saveSettings(buildAiSettingsPayload(aiSettings));
        if (saveResult?.error) {
          addToast('Connected, but could not save settings: ' + saveResult.error, 'error');
        } else {
          syncAiSettingsAfterSave(aiSettings, saveResult);
          addToast(result?.message || 'AI connection successful -- settings saved!', 'success');
        }
        if (result?.models && aiSettings.provider === 'lmstudio') {
          setLmStudioModels(result.models);
        }
      }
    } catch (e) {
      addToast('AI test failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setAiTesting(false);
    }
  };

  // Keep aiSettingsRef always in sync with the latest aiSettings state so
  // loadLmStudioModels can read the URL without being in its dep array.
  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  // Auto-load LM Studio models when the user switches to the lmstudio provider.
  // loadLmStudioModels, lmStudioModels.length, lmStudioLoading are intentionally
  // omitted from the dep array. loadLmStudioModels is a stable callback ([addToast]
  // only) ?????? adding it here caused an infinite retry loop when LM Studio was
  // unreachable (old aiSettings dep recreated the callback on every error).
  useEffect(() => {
    if (aiSettings.provider === 'lmstudio' && lmStudioModels.length === 0 && !lmStudioLoading) {
      loadLmStudioModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSettings.provider]);

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
      loadAiSettings(),
      loadCloudConfig(),
      loadAccountStatus(),
      loadDiagnostics()
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
      const result = await window.electron.smtp.save(smtpSettings);
      if (result?.error) {
        addToast('Failed to save settings: ' + result.error, 'error');
        return;
      }
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
        addToast(`Connection failed: ${result.error || result.message || 'Unknown error'}`, 'error');
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
      let result;
      if (editingAccount) {
        result = await window.electron.smtpAccounts.update({ ...accountForm, id: editingAccount.id });
      } else {
        result = await window.electron.smtpAccounts.add(accountForm);
      }
      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }
      addToast(editingAccount ? 'Account updated' : 'Account added', 'success');
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
      password: '',
      hasStoredPassword: !!account.hasStoredPassword,
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
      name: '', host: '', port: 587, secure: false, username: '', password: '', hasStoredPassword: false,
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

  const handleAutoBackupEnabledChange = async (enabled) => {
    const updated = { ...autoBackupConfig, enabled };
    setAutoBackupConfig(updated);
    try {
      await window.electron?.backup?.autoConfig?.(updated);
      addToast(enabled ? 'Auto-backup enabled' : 'Auto-backup disabled', 'success');
    } catch (error) {
      addToast('Failed to update auto-backup settings', 'error');
    }
  };

  const handleAutoBackupIntervalChange = async (intervalHours) => {
    const updated = { ...autoBackupConfig, intervalHours };
    setAutoBackupConfig(updated);
    try {
      await window.electron?.backup?.autoConfig?.(updated);
    } catch (error) {
      addToast('Failed to update auto-backup schedule', 'error');
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

  const handleToggleAiEnabled = async (enabled) => {
    const nextSettings = { ...aiSettings, enabled };
    setAiSettings(nextSettings);
    try { localStorage.setItem('bulky_sidebar_ai_enabled', enabled ? '1' : '0'); } catch {}
    try {
      const result = await window.electron?.ai?.saveSettings(buildAiSettingsPayload(nextSettings));
      if (result?.error) {
        addToast('Failed to update AI settings: ' + result.error, 'error');
        return;
      }
      syncAiSettingsAfterSave(nextSettings, result);
      addToast(enabled ? 'AI assistant enabled' : 'AI assistant hidden from sidebar', 'success');
    } catch (error) {
      addToast('Failed to update AI settings', 'error');
    }
  };

  const openGuide = () => navigateTo('/guide');

  const effectiveFromEmail = getEffectiveFromEmail();
  const effectiveSendingDomain = getEffectiveSendingDomain();
  const smtpHealthById = new Map((smtpHealth || []).map((entry) => [entry.id, entry]));
  const todayKey = new Date().toISOString().split('T')[0];
  const getFreshSentToday = (entry = {}) => {
    if (!entry) return 0;
    const lastResetDate = String(entry.lastResetDate || '').trim();
    if (lastResetDate && lastResetDate !== todayKey) {
      return 0;
    }
    return Number(entry.sentToday) || 0;
  };
  const totalAccounts = smtpAccounts.length;
  const activeAccounts = smtpHealth.length > 0
    ? smtpHealth.filter((entry) => entry.isActive).length
    : smtpAccounts.filter((entry) => entry.isActive).length;
  const totalDailyLimit = (smtpHealth.length > 0 ? smtpHealth : smtpAccounts)
    .reduce((sum, entry) => sum + (Number(entry.dailyLimit) || 0), 0);
  const totalUsedToday = (smtpHealth.length > 0 ? smtpHealth : smtpAccounts)
    .reduce((sum, entry) => sum + getFreshSentToday(entry), 0);
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
  const inboxReadinessGuardrails = buildInboxReadinessGuardrails({
    deliverabilityInfo,
    smtpAccounts,
    smtpSettings,
    smtpHealth
  });
  const guardrailSummary = inboxReadinessGuardrails.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, { pass: 0, warn: 0, fail: 0 });
  const senderDomains = Array.from(new Set(smtpAccounts.map(account => getSenderDomain(account)).filter(Boolean)));
  const rotationReadyAccounts = smtpAccounts.filter((account) => {
    const healthSnapshot = smtpHealthById.get(account.id);
    const sentToday = getFreshSentToday(healthSnapshot || account);
    const dailyLimit = Number(healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 0);
    const underLimit = dailyLimit <= 0 || sentToday < dailyLimit;
    return !!account.isActive && !!getSenderEmail(account) && underLimit;
  }).length;
  const accountsNeedingAttention = smtpAccounts.filter((account) => {
    const healthSnapshot = smtpHealthById.get(account.id);
    const testResult = testResults[account.id];
    const sentToday = getFreshSentToday(healthSnapshot || account);
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
    const sentToday = getFreshSentToday(healthSnapshot || account);
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
      <div className="settings-loading">
        <RefreshCw size={24} style={{ animation: 'spin 1.2s linear infinite', opacity: 0.4 }} />
      </div>
    );
  }

  /* ── Tab groups — CONNECTION / DELIVERABILITY / SYSTEM ── */
  return (
    <div className="settings-shell">
      {/* ── Vertical grouped tab sidebar ── */}
      <SettingsSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={refreshSettingsSurface}
        hasCapability={hasCapability}
      />

      {/* ── Content panel ── */}
      <div className="settings-content">
        {activeTab === 'smtp' && (
          <SmtpConfigTab
            smtpSettings={smtpSettings}
            setSmtpSettings={setSmtpSettings}
            handleSaveSmtp={handleSaveSmtp}
            handleTestConnection={handleTestConnection}
            testing={testing}
          />
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
                const dailyUsed = getFreshSentToday(healthSnapshot || account);
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
                <input type="password" className="form-input" placeholder={accountForm.hasStoredPassword ? 'Leave blank to keep the saved password' : '...'}
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                />
                <small className="text-muted">
                  {accountForm.hasStoredPassword
                    ? 'A password is already stored locally. Enter a new one only if you want to replace it.'
                    : 'The password is stored locally and will not be sent back into the renderer after it is saved.'}
                </small>
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
              <small className="text-muted">Added to the List-Unsubscribe header to improve inbox readiness and recipient trust.</small>
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
                  ? `Using ${deliverabilityInfo.trackingDomain} with public tracking mode`
                  : 'Using the built-in localhost tracking domain for local-only tracking'}
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

          <div className="card">
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <h3 className="card-title mb-2"><Shield size={20} style={{ marginRight: '8px' }} /> Inbox Readiness Guardrails</h3>
                <p className="text-muted text-sm">
                  These checks turn your current SMTP, DNS, and compliance setup into a quick send-readiness review before you push live volume.
                </p>
              </div>
              <div className="text-sm text-muted" style={{ textAlign: 'right' }}>
                <div><strong style={{ color: 'var(--success)' }}>{guardrailSummary.pass}</strong> passed</div>
                <div><strong style={{ color: 'var(--warning)' }}>{guardrailSummary.warn}</strong> review</div>
                <div><strong style={{ color: 'var(--error)' }}>{guardrailSummary.fail}</strong> blocking</div>
              </div>
            </div>

            <div className="panel-grid">
              {inboxReadinessGuardrails.map((item) => {
                const Icon = item.status === 'pass' ? CheckCircle : item.status === 'warn' ? AlertTriangle : XCircle;
                const accent = item.status === 'pass'
                  ? 'var(--success)'
                  : item.status === 'warn'
                    ? 'var(--warning)'
                    : 'var(--error)';

                return (
                  <div
                    key={item.id}
                    style={{
                      border: `1px solid ${accent}22`,
                      background: `linear-gradient(180deg, ${accent}12 0%, rgba(255,255,255,0) 100%)`,
                      borderRadius: '14px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} style={{ color: accent, flexShrink: 0 }} />
                      <strong style={{ fontSize: '14px' }}>{item.title}</strong>
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {item.detail}
                    </div>
                    <div className="text-sm text-muted">
                      Next step: {item.nextStep}
                    </div>
                  </div>
                );
              })}
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
                <option value="bulk">Bulk / Marketing -- includes List-Unsubscribe header</option>
                <option value="personal">Personal / Transactional -- omits List-Unsubscribe (better Primary inbox)</option>
              </select>
              <small className="text-muted">Personal mode omits the List-Unsubscribe header -- Gmail is less likely to route to Promotions.</small>
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

            {/* DNS Status Display - synced from Domain Health checks */}
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

      {/* ===== SEED ACCOUNTS TAB ===== */}
      {activeTab === 'seed' && (
        <div>
          <div className="card mb-4">
            <h3 className="card-title mb-4"><Mail size={20} style={{ marginRight: '8px' }} /> Seed Accounts</h3>
            <p className="text-muted mb-4">
              Add seed email accounts at major providers (Gmail, Outlook, Yahoo, Apple) to test inbox placement. Bulky will send test emails to these accounts and report where they land.
            </p>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="seed@gmail.com"
                  value={seedForm.email}
                  onChange={(e) => setSeedForm({ ...seedForm, email: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Provider</label>
                <select
                  className="form-select"
                  value={seedForm.provider}
                  onChange={(e) => setSeedForm({ ...seedForm, provider: e.target.value })}
                >
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                  <option value="yahoo">Yahoo</option>
                  <option value="apple">Apple Mail</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={seedForm.isActive}
                  onChange={(e) => setSeedForm({ ...seedForm, isActive: e.target.checked })}
                />
                <span>Active</span>
              </label>
            </div>
            <button
              className="btn btn-primary"
              onClick={createSeed}
              disabled={seedLoading || !seedForm.email.trim()}
            >
              {seedLoading ? 'Adding...' : <><Plus size={16} /> Add Seed Account</>}
            </button>
          </div>

          {seedAccounts.length > 0 && (
            <div className="card">
              <h4 className="card-title mb-3">Configured Seed Accounts</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {seedAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: acc.isActive ? 'rgba(34,197,94,0.06)' : 'var(--bg-tertiary)',
                      border: `1px solid ${acc.isActive ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: acc.isActive ? 'var(--success)' : 'var(--text-muted)',
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{acc.email}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {acc.provider}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => toggleSeed(acc)}
                        title={acc.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {acc.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteSeed(acc.id)}
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

        {activeTab === 'general' && (
          <GeneralSettingsTab
            theme={theme}
            toggleTheme={toggleTheme}
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            handleSaveApp={handleSaveApp}
            handleExportSettings={handleExportSettings}
            handleImportSettings={handleImportSettings}
            systemDiagnostics={systemDiagnostics}
            appVersion={appVersion}
            formatBytes={formatBytes}
            openGuide={openGuide}
            entitlementState={entitlementState}
          />
        )}

        {activeTab === 'cloud' && (
          <CloudServicesTab
            cloudConfig={cloudConfig}
            setCloudConfig={setCloudConfig}
            cloudStatus={cloudStatus}
            accountStatus={accountStatus}
            desktopAccountForm={desktopAccountForm}
            setDesktopAccountForm={setDesktopAccountForm}
            desktopSignUpForm={desktopSignUpForm}
            setDesktopSignUpForm={setDesktopSignUpForm}
            savingCloudConfig={savingCloudConfig}
            loadingCloudConfig={loadingCloudConfig}
            loadingAccountStatus={loadingAccountStatus}
            submittingAccount={submittingAccount}
            syncStatus={syncStatus}
            loadingSyncStatus={loadingSyncStatus}
            cloudDiagnostics={cloudDiagnostics}
            testingCloudConnections={testingCloudConnections}
            handleSaveCloudConfig={handleSaveCloudConfig}
            handleRefreshCloudConfig={handleRefreshCloudConfig}
            handleAccountSignUp={handleAccountSignUp}
            handleAccountSignIn={handleAccountSignIn}
            handleAccountSignOut={handleAccountSignOut}
            handleAccountRefresh={handleAccountRefresh}
            handleRunCloudDiagnostics={handleRunCloudDiagnostics}
            handleSyncNow={handleSyncNow}
            handleOpenCheckout={handleOpenCheckout}
          />
        )}

        {activeTab === 'ai' && (
          <AiSettingsTab
            aiSettings={aiSettings}
            setAiSettings={setAiSettings}
            aiDiagnostics={aiDiagnostics}
            openRouterModels={openRouterModels}
            lmStudioModels={lmStudioModels}
            lmStudioLoading={lmStudioLoading}
            aiTesting={aiTesting}
            loadLmStudioModels={loadLmStudioModels}
            handleSaveAiSettings={handleSaveAiSettings}
            handleTestAi={handleTestAi}
            handleToggleAiEnabled={handleToggleAiEnabled}
          />
        )}

        {activeTab === 'backup' && (
          <BackupSettingsTab
            backupInfo={backupInfo}
            isBackingUp={isBackingUp}
            isRestoring={isRestoring}
            isResetting={isResetting}
            handleBackup={handleBackup}
            handleRestore={handleRestore}
            handleResetEverything={handleResetEverything}
            autoBackupConfig={autoBackupConfig}
            handleAutoBackupEnabledChange={handleAutoBackupEnabledChange}
            handleAutoBackupIntervalChange={handleAutoBackupIntervalChange}
            backupHistory={backupHistory}
          />
        )}
      </div>
    </div>
  );
}

export default Settings;

