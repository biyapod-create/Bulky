const { createClient } = require('@supabase/supabase-js');
const { normalizePlanId } = require('./entitlementService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_ACCOUNT = Object.freeze({
  id: '',
  email: '',
  fullName: '',
  avatarUrl: '',
  workspaceName: '',
  providers: []
});

function safeParseJson(rawValue) {
  if (!rawValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeProviderList(providers) {
  if (!Array.isArray(providers)) {
    return [];
  }

  return providers
    .map((provider) => String(provider || '').trim().toLowerCase())
    .filter(Boolean);
}

function sanitizeAccount(account = {}) {
  return {
    id: account.id ? String(account.id) : '',
    email: account.email ? String(account.email) : '',
    fullName: account.fullName ? String(account.fullName) : '',
    avatarUrl: account.avatarUrl ? String(account.avatarUrl) : '',
    workspaceName: account.workspaceName ? String(account.workspaceName) : '',
    providers: sanitizeProviderList(account.providers)
  };
}

class EncryptedDbStorageAdapter {
  constructor(db, { encryptValue, decryptValue, keyPrefix = 'supabase-auth:' } = {}) {
    this.db = db;
    this.encryptValue = encryptValue;
    this.decryptValue = decryptValue;
    this.keyPrefix = keyPrefix;
  }

  _resolveKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  getItem(key) {
    const stored = this.db?.getSetting?.(this._resolveKey(key));
    if (!stored) {
      return null;
    }

    try {
      return typeof this.decryptValue === 'function' ? this.decryptValue(stored) : stored;
    } catch {
      return null;
    }
  }

  setItem(key, value) {
    const stored = typeof this.encryptValue === 'function'
      ? this.encryptValue(value)
      : value;

    this.db?.setSetting?.(this._resolveKey(key), stored);
  }

  removeItem(key) {
    this.db?.setSetting?.(this._resolveKey(key), '');
  }
}

class DesktopAccountService {
  constructor(options = {}) {
    this.db = options.db;
    this.cloudConfigService = options.cloudConfigService;
    this.entitlementService = options.entitlementService;
    this.encryptValue = options.encryptValue;
    this.decryptValue = options.decryptValue;
    this.logger = options.logger;
    this.appVersion = options.appVersion || '';
    this.stateSettingKey = options.stateSettingKey || 'desktopAccountState';
    this.storageKey = options.storageKey || 'bulky-desktop-auth';
    this.createSupabaseClient = options.createSupabaseClient || createClient;
    this.statusListener = typeof options.statusListener === 'function' ? options.statusListener : null;
    this.storage = new EncryptedDbStorageAdapter(this.db, {
      encryptValue: this.encryptValue,
      decryptValue: this.decryptValue
    });
    this.client = null;
    this.clientSignature = '';
    this.authSubscription = null;
  }

  _readState() {
    return safeParseJson(this.db?.getSetting?.(this.stateSettingKey));
  }

  _writeState(nextState = {}) {
    this.db?.setSetting?.(this.stateSettingKey, JSON.stringify(nextState));
    const status = this.getStatus();
    try {
      this.statusListener?.(status);
    } catch (error) {
      this.logger?.warn?.('Desktop account status listener failed', { error: error.message });
    }
    return status;
  }

  setStatusListener(listener) {
    this.statusListener = typeof listener === 'function' ? listener : null;
  }

  _getConnectionConfig() {
    const config = this.cloudConfigService?.getInternalConfig?.() || {};
    return {
      supabaseUrl: String(config.supabaseUrl || '').trim(),
      supabaseAnonKey: String(config.supabaseAnonKey || '').trim()
    };
  }

  _buildClientSignature() {
    const { supabaseUrl, supabaseAnonKey } = this._getConnectionConfig();
    return `${supabaseUrl}::${supabaseAnonKey}`;
  }

  _disposeClient() {
    try {
      this.authSubscription?.unsubscribe?.();
    } catch {
      // ignored
    }

    this.authSubscription = null;
    this.client = null;
    this.clientSignature = '';
  }

  isConfigured() {
    const { supabaseUrl, supabaseAnonKey } = this._getConnectionConfig();
    return !!supabaseUrl && !!supabaseAnonKey;
  }

  async _ensureClient() {
    if (!this.isConfigured()) {
      this._disposeClient();
      return null;
    }

    const signature = this._buildClientSignature();
    if (this.client && this.clientSignature === signature) {
      return this.client;
    }

    this._disposeClient();

    const { supabaseUrl, supabaseAnonKey } = this._getConnectionConfig();
    this.client = this.createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: this.storage,
        storageKey: this.storageKey
      },
      global: {
        headers: {
          'X-Client-Info': `bulky-desktop/${this.appVersion || 'dev'}`
        }
      }
    });
    this.clientSignature = signature;

    const authListener = this.client?.auth?.onAuthStateChange?.((event, session) => {
      const nextStatus = event === 'SIGNED_OUT' ? 'signed_out' : 'authenticated';
      this._syncStateFromSession(session, { status: nextStatus }).catch((error) => {
        this.logger?.warn?.('Desktop account auth sync failed', { error: error.message });
      });
    });

    this.authSubscription = authListener?.data?.subscription || null;
    return this.client;
  }

  async getSupabaseClient() {
    return this._ensureClient();
  }

  async getCurrentSession() {
    const client = await this._ensureClient();
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return data?.session || null;
    } catch {
      return null;
    }
  }

  _extractAccount(sessionUser) {
    if (!sessionUser) {
      return DEFAULT_ACCOUNT;
    }

    const metadata = sessionUser.user_metadata || {};
    const identities = Array.isArray(sessionUser.identities) ? sessionUser.identities : [];

    return sanitizeAccount({
      id: sessionUser.id,
      email: sessionUser.email,
      fullName: metadata.full_name || metadata.name || '',
      avatarUrl: metadata.avatar_url || '',
      workspaceName: metadata.workspace_name || metadata.company_name || '',
      providers: identities.map((identity) => identity?.provider).filter(Boolean)
    });
  }

  _extractPlanId(sessionUser, fallbackPlanId = 'freemium') {
    const metadata = sessionUser?.user_metadata || {};
    const appMetadata = sessionUser?.app_metadata || {};
    return normalizePlanId(
      appMetadata.bulky_plan ||
      appMetadata.plan_id ||
      metadata.bulky_plan ||
      metadata.plan_id ||
      fallbackPlanId
    );
  }

  _extractRemotePlanId(remoteEntitlement, remoteSubscription, sessionUser) {
    return normalizePlanId(
      remoteEntitlement?.plan_id ||
      remoteEntitlement?.plan_code ||
      remoteSubscription?.plan_id ||
      remoteSubscription?.plan_code ||
      this._extractPlanId(sessionUser)
    );
  }

  _mapRemoteCapabilities(remoteEntitlement = {}) {
    const capabilityMap = {
      analytics: remoteEntitlement.can_use_statistics,
      aiAssistant: remoteEntitlement.can_use_cloud_ai,
      desktopLogin: remoteEntitlement.can_use_desktop_login,
      hostedTracking: remoteEntitlement.can_use_cloud_tracking,
      hostedForms: remoteEntitlement.can_use_hosted_forms,
      realtimeSync: remoteEntitlement.can_use_multi_device_sync,
      automaticUpdates: remoteEntitlement.can_use_auto_updates,
      cloudAiUsage: remoteEntitlement.can_use_cloud_ai
    };

    return Object.fromEntries(
      Object.entries(capabilityMap).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  _mapRemoteLimits(remoteEntitlement = {}) {
    const toNumberOrNull = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return Object.fromEntries(
      Object.entries({
        maxSmtpAccounts: remoteEntitlement.max_smtp_accounts,
        maxEmailsPerCycle: remoteEntitlement.max_monthly_sent_emails
      }).filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, toNumberOrNull(value)])
    );
  }

  async _fetchMaybeSingle(queryBuilderFactory) {
    try {
      const query = queryBuilderFactory();
      const { data, error } = await query.limit(1);
      if (error) {
        throw error;
      }

      if (Array.isArray(data)) {
        return data[0] || null;
      }

      return data || null;
    } catch (error) {
      this.logger?.warn?.('Desktop account remote row fetch failed', { error: error.message });
      return null;
    }
  }

  async _fetchRemoteState(client, sessionUser) {
    if (!client || !sessionUser?.id) {
      return {
        profile: null,
        entitlement: null,
        subscription: null,
        devices: []
      };
    }

    const userId = sessionUser.id;
    const profile = await this._fetchMaybeSingle(() => client.from('profiles').select('*').eq('id', userId));
    const profileByUserId = profile || await this._fetchMaybeSingle(() => client.from('profiles').select('*').eq('user_id', userId));
    const entitlement = await this._fetchMaybeSingle(() => client.from('entitlements').select('*').eq('user_id', userId).order('updated_at', { ascending: false }));
    const subscription = await this._fetchMaybeSingle(() => client.from('subscriptions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }));

    let devices = [];
    try {
      const { data, error } = await client.from('devices').select('*').eq('user_id', userId);
      if (!error && Array.isArray(data)) {
        devices = data;
      }
    } catch (error) {
      this.logger?.warn?.('Desktop account device fetch failed', { error: error.message });
    }

    return {
      profile: profileByUserId,
      entitlement,
      subscription,
      devices
    };
  }

  async _syncStateFromSession(session, { status = 'authenticated' } = {}) {
    if (!session?.user) {
      this.entitlementService?.resetToLocalLegacy?.();
      this._writeState({
        provider: 'supabase',
        configured: this.isConfigured(),
        authenticated: false,
        status: this.isConfigured() ? status : 'needs_configuration',
        account: DEFAULT_ACCOUNT,
        planId: 'legacy',
        lastValidatedAt: new Date().toISOString(),
        accessTokenExpiresAt: null,
        lastError: ''
      });
      return this.getStatus();
    }

    const client = await this._ensureClient();
    const remoteState = await this._fetchRemoteState(client, session.user);
    const account = this._extractAccount(session.user);
    const profileRow = remoteState.profile || {};
    const resolvedAccount = sanitizeAccount({
      ...account,
      fullName: profileRow.full_name || profileRow.name || account.fullName,
      avatarUrl: profileRow.avatar_url || account.avatarUrl,
      workspaceName: profileRow.workspace_name || account.workspaceName
    });
    const planId = this._extractRemotePlanId(remoteState.entitlement, remoteState.subscription, session.user);
    const validatedAt = new Date().toISOString();
    const subscriptionRow = remoteState.subscription || {};
    const entitlementRow = remoteState.entitlement || {};
    const serviceWindowEndsAt = entitlementRow.hosted_service_expires_at
      || entitlementRow.service_window_ends_at
      || subscriptionRow.current_period_end
      || subscriptionRow.renews_at
      || null;
    const graceEndsAt = entitlementRow.grace_ends_at || subscriptionRow.grace_ends_at || null;
    const capabilities = this._mapRemoteCapabilities(entitlementRow);
    const limits = this._mapRemoteLimits(entitlementRow);

    this.entitlementService?.applyCloudState?.({
      planId,
      mode: planId === 'pro' || planId === 'one_off' ? 'hybrid' : 'local',
      source: 'cloud-supabase',
      status: entitlementRow.status || subscriptionRow.status || 'active',
      account: {
        email: resolvedAccount.email,
        workspaceName: resolvedAccount.workspaceName
      },
      capabilities,
      limits,
      serviceWindowEndsAt,
      graceEndsAt,
      lastValidatedAt: validatedAt
    });

    this._writeState({
      provider: 'supabase',
      configured: true,
      authenticated: true,
      status,
      account: resolvedAccount,
      planId,
      subscription: {
        provider: subscriptionRow.provider || 'paystack',
        status: subscriptionRow.status || '',
        reference: subscriptionRow.reference || subscriptionRow.subscription_code || '',
        customerCode: subscriptionRow.customer_code || '',
        currentPeriodEnd: subscriptionRow.current_period_end || subscriptionRow.renews_at || null
      },
      devices: {
        total: Array.isArray(remoteState.devices) ? remoteState.devices.length : 0
      },
      lastValidatedAt: validatedAt,
      accessTokenExpiresAt: session.expires_at
        ? new Date(Number(session.expires_at) * 1000).toISOString()
        : null,
      graceEndsAt,
      serviceWindowEndsAt,
      lastError: ''
    });

    return this.getStatus();
  }

  _buildUnavailableStatus(lastError = '') {
    const current = this._readState();
    return this._writeState({
      provider: 'supabase',
      configured: false,
      authenticated: false,
      status: 'needs_configuration',
      account: sanitizeAccount(current.account || DEFAULT_ACCOUNT),
      planId: current.planId || 'legacy',
      lastValidatedAt: current.lastValidatedAt || null,
      accessTokenExpiresAt: null,
      lastError
    });
  }

  getStatus() {
    const stored = this._readState();
    const configured = this.isConfigured();
    const entitlementState = this.entitlementService?.getState?.();

    return {
      provider: 'supabase',
      configured,
      authenticated: configured ? !!stored.authenticated : false,
      status: stored.status || (configured ? 'signed_out' : 'needs_configuration'),
      account: sanitizeAccount(stored.account || DEFAULT_ACCOUNT),
      plan: entitlementState?.plan || {
        id: stored.planId || 'legacy',
        name: stored.planId || 'Local Build',
        description: ''
      },
      mode: entitlementState?.mode || 'local',
      entitlementStatus: entitlementState?.status || 'active',
      subscription: {
        provider: stored?.subscription?.provider || '',
        status: stored?.subscription?.status || '',
        reference: stored?.subscription?.reference || '',
        customerCode: stored?.subscription?.customerCode || '',
        currentPeriodEnd: stored?.subscription?.currentPeriodEnd || null
      },
      devices: {
        total: Number(stored?.devices?.total || 0)
      },
      lastValidatedAt: stored.lastValidatedAt || null,
      accessTokenExpiresAt: stored.accessTokenExpiresAt || null,
      graceEndsAt: stored.graceEndsAt || null,
      serviceWindowEndsAt: stored.serviceWindowEndsAt || null,
      lastError: stored.lastError || ''
    };
  }

  async refreshRemoteState() {
    const session = await this.getCurrentSession();
    return this._syncStateFromSession(session, {
      status: session ? 'authenticated' : 'signed_out'
    });
  }

  async initialize() {
    if (!this.isConfigured()) {
      return this._buildUnavailableStatus('');
    }

    try {
      const client = await this._ensureClient();
      if (!client) {
        return this._buildUnavailableStatus('');
      }

      const storedState = this._readState();
      const { data, error } = await client.auth.getSession();
      if (error) {
        return this._writeState({
          ...storedState,
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'session_error',
          lastError: error.message
        });
      }

      if (!data?.session && storedState?.status === 'pending_confirmation' && storedState?.account?.email) {
        return this._writeState({
          ...storedState,
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'pending_confirmation',
          accessTokenExpiresAt: null,
          lastError: ''
        });
      }

      return this._syncStateFromSession(data?.session || null, {
        status: data?.session ? 'authenticated' : 'signed_out'
      });
    } catch (error) {
      this.logger?.warn?.('Desktop account initialization failed', { error: error.message });
      return this._writeState({
        ...this._readState(),
        provider: 'supabase',
        configured: true,
        authenticated: false,
        status: 'session_error',
        lastError: error.message
      });
    }
  }

  async signInWithPassword({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return { error: 'Enter a valid email address.' };
    }

    if (!String(password || '')) {
      return { error: 'Password is required.' };
    }

    if (!this.isConfigured()) {
      return { error: 'Connected account services are not configured yet. Open Settings > Account & Sync to finish setup before signing in.' };
    }

    try {
      const client = await this._ensureClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (error) {
        this._writeState({
          ...this._readState(),
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'auth_error',
          lastError: error.message
        });
        return { error: error.message };
      }

      return {
        success: true,
        status: await this._syncStateFromSession(data?.session || null)
      };
    } catch (error) {
      this.logger?.warn?.('Desktop account sign-in failed', { error: error.message });
      return { error: error.message || 'Desktop sign-in failed.' };
    }
  }

  async signUpWithPassword({ fullName, workspaceName, email, password, planId }) {
    const normalizedFullName = String(fullName || '').trim();
    const normalizedWorkspaceName = String(workspaceName || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPlanId = normalizePlanId(planId || 'freemium');

    if (!normalizedFullName) {
      return { error: 'Full name is required.' };
    }

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return { error: 'Enter a valid email address.' };
    }

    if (!String(password || '')) {
      return { error: 'Password is required.' };
    }

    if (!this.isConfigured()) {
      return { error: 'Connected account services are not configured yet. Open Settings > Account & Sync to finish setup before creating an account.' };
    }

    try {
      const client = await this._ensureClient();
      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedFullName,
            workspace_name: normalizedWorkspaceName,
            plan_id: normalizedPlanId,
            bulky_plan: normalizedPlanId
          }
        }
      });

      if (error) {
        this._writeState({
          ...this._readState(),
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'auth_error',
          lastError: error.message
        });
        return { error: error.message };
      }

      if (data?.session) {
        return {
          success: true,
          pendingConfirmation: false,
          message: 'Desktop account created and connected.',
          status: await this._syncStateFromSession(data.session, { status: 'authenticated' })
        };
      }

      if (data?.user) {
        const validatedAt = new Date().toISOString();
        const status = this._writeState({
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'pending_confirmation',
          account: sanitizeAccount({
            id: data.user.id,
            email: normalizedEmail,
            fullName: normalizedFullName,
            workspaceName: normalizedWorkspaceName,
            providers: ['email']
          }),
          planId: normalizedPlanId,
          lastValidatedAt: validatedAt,
          accessTokenExpiresAt: null,
          lastError: ''
        });

        return {
          success: true,
          pendingConfirmation: true,
          message: 'Desktop account created. Check your email to confirm it, then sign in from Bulky.',
          status
        };
      }

      return { error: 'The account service did not return a user or session for this desktop sign-up request.' };
    } catch (error) {
      this.logger?.warn?.('Desktop account sign-up failed', { error: error.message });
      return { error: error.message || 'Desktop sign-up failed.' };
    }
  }

  async refreshSession() {
    if (!this.isConfigured()) {
      return { error: 'Connected account services are not configured yet. Open Settings > Account & Sync to finish setup before refreshing the session.' };
    }

    try {
      const client = await this._ensureClient();
      const { data, error } = await client.auth.refreshSession();
      if (error) {
        this._writeState({
          ...this._readState(),
          provider: 'supabase',
          configured: true,
          authenticated: false,
          status: 'session_error',
          lastError: error.message
        });
        return { error: error.message };
      }

      return {
        success: true,
        status: await this._syncStateFromSession(data?.session || null)
      };
    } catch (error) {
      this.logger?.warn?.('Desktop account session refresh failed', { error: error.message });
      return { error: error.message || 'Could not refresh the desktop session.' };
    }
  }

  async signOut() {
    if (!this.isConfigured()) {
      this.entitlementService?.resetToLocalLegacy?.();
      return {
        success: true,
        status: this._buildUnavailableStatus('')
      };
    }

    try {
      const client = await this._ensureClient();
      const { error } = await client.auth.signOut();
      if (error) {
        return { error: error.message };
      }

      this.storage.removeItem(this.storageKey);
      return {
        success: true,
        status: await this._syncStateFromSession(null, { status: 'signed_out' })
      };
    } catch (error) {
      this.logger?.warn?.('Desktop account sign-out failed', { error: error.message });
      return { error: error.message || 'Could not sign out of the desktop account.' };
    }
  }
}

module.exports = DesktopAccountService;
