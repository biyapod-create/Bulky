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

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
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
    this.trackingSyncStateKey = options.trackingSyncStateKey || 'desktopAccountTrackingSyncState';
    this.trackingWorkspaceSettingKey = options.trackingWorkspaceSettingKey || 'desktopAccountTrackingWorkspace';
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

  _readTrackingSyncState() {
    return safeParseJson(this.db?.getSetting?.(this.trackingSyncStateKey));
  }

  _writeTrackingSyncState(nextState = {}) {
    this.db?.setSetting?.(this.trackingSyncStateKey, JSON.stringify(nextState));
    return nextState;
  }

  _readTrackingWorkspace() {
    return safeParseJson(this.db?.getSetting?.(this.trackingWorkspaceSettingKey));
  }

  _writeTrackingWorkspace(nextState = {}) {
    this.db?.setSetting?.(this.trackingWorkspaceSettingKey, JSON.stringify(nextState));
    return nextState;
  }

  _clearTrackingWorkspace() {
    this.db?.setSetting?.(this.trackingWorkspaceSettingKey, JSON.stringify({}));
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

  dispose() {
    try {
      this.client?.auth?.stopAutoRefresh?.();
    } catch (error) {
      this.logger?.warn?.('Desktop account auto-refresh shutdown failed', { error: error.message });
    }

    this.statusListener = null;
    this._disposeClient();
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
      remoteSubscription?.provider_plan_code ||
      remoteSubscription?.plan_code ||
      this._extractPlanId(sessionUser)
    );
  }

  _mapRemoteCapabilities(remoteEntitlement = {}) {
    const jsonCapabilities = remoteEntitlement?.capabilities && typeof remoteEntitlement.capabilities === 'object'
      ? remoteEntitlement.capabilities
      : {};
    const capabilityMap = {
      analytics: remoteEntitlement.can_use_statistics ?? jsonCapabilities.analytics,
      aiAssistant: remoteEntitlement.can_use_cloud_ai ?? jsonCapabilities.aiAssistant,
      desktopLogin: remoteEntitlement.can_use_desktop_login ?? jsonCapabilities.desktopLogin,
      hostedTracking: remoteEntitlement.can_use_cloud_tracking ?? jsonCapabilities.hostedTracking,
      hostedForms: remoteEntitlement.can_use_hosted_forms ?? jsonCapabilities.hostedForms,
      realtimeSync: remoteEntitlement.can_use_multi_device_sync ?? jsonCapabilities.realtimeSync,
      automaticUpdates: remoteEntitlement.can_use_auto_updates ?? jsonCapabilities.automaticUpdates,
      cloudAiUsage: remoteEntitlement.can_use_cloud_ai ?? jsonCapabilities.cloudAiUsage
    };

    return Object.fromEntries(
      Object.entries(capabilityMap).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  _mapRemoteLimits(remoteEntitlement = {}) {
    const jsonLimits = remoteEntitlement?.limits && typeof remoteEntitlement.limits === 'object'
      ? remoteEntitlement.limits
      : {};
    const toNumberOrNull = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return Object.fromEntries(
      Object.entries({
        maxSmtpAccounts: remoteEntitlement.max_smtp_accounts ?? jsonLimits.maxSmtpAccounts,
        maxEmailsPerCycle: remoteEntitlement.max_monthly_sent_emails ?? jsonLimits.maxEmailsPerCycle
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

  _hasLocalCloudTrackingEvent(cloudEventId) {
    if (!cloudEventId || !this.db || typeof this.db._get !== 'function') {
      return false;
    }

    try {
      return !!this.db._get(
        'SELECT id FROM tracking_events WHERE cloudEventId = ? LIMIT 1',
        [cloudEventId]
      );
    } catch {
      return false;
    }
  }

  _hasLocalTrackingEvent(campaignId, contactId, email, type) {
    if (!campaignId || !type || !this.db || typeof this.db._get !== 'function') {
      return false;
    }

    try {
      if (contactId) {
        const existingByContact = this.db._get(
          'SELECT id FROM tracking_events WHERE campaignId = ? AND contactId = ? AND type = ? LIMIT 1',
          [campaignId, contactId, type]
        );
        if (existingByContact) {
          return true;
        }
      }

      const normalizedEmail = normalizeEmailAddress(email);
      if (normalizedEmail) {
        return !!this.db._get(
          'SELECT id FROM tracking_events WHERE campaignId = ? AND lower(email) = ? AND type = ? LIMIT 1',
          [campaignId, normalizedEmail, type]
        );
      }
    } catch {
      return false;
    }

    return false;
  }

  async _fetchRemoteState(client, sessionUser) {
    if (!client || !sessionUser?.id) {
      return {
        profile: null,
        entitlement: null,
        subscription: null,
        devices: [],
        trackingWorkspace: null
      };
    }

    const userId = sessionUser.id;
    const profile = await this._fetchMaybeSingle(() => client.from('profiles').select('*').eq('id', userId));
    const profileByUserId = profile || await this._fetchMaybeSingle(() => client.from('profiles').select('*').eq('user_id', userId));
    const entitlement = await this._fetchMaybeSingle(() => client.from('entitlements').select('*').eq('user_id', userId).order('updated_at', { ascending: false }));
    const subscription = await this._fetchMaybeSingle(() => client.from('subscriptions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }));
    const trackingWorkspace = await this._fetchMaybeSingle(() => client.from('tracking_workspaces').select('*').eq('user_id', userId));

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
      devices,
      trackingWorkspace
    };
  }

  async _syncStateFromSession(session, { status = 'authenticated' } = {}) {
    if (!session?.user) {
      this.entitlementService?.resetToLocalLegacy?.();
      this._clearTrackingWorkspace();
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
    const trackingWorkspaceRow = remoteState.trackingWorkspace || {};
    const signingSecret = String(trackingWorkspaceRow.signing_secret || '').trim();
    if (signingSecret) {
      this._writeTrackingWorkspace({
        userId: session.user.id,
        signingSecret,
        updatedAt: new Date().toISOString()
      });
    }

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
        reference: subscriptionRow.reference || subscriptionRow.subscription_code || subscriptionRow.provider_subscription_id || '',
        customerCode: subscriptionRow.customer_code || subscriptionRow.provider_customer_id || '',
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

  getTrackingWorkspaceSecret() {
    const workspace = this._readTrackingWorkspace();
    return String(workspace?.signingSecret || '').trim();
  }

  async refreshRemoteState() {
    const session = await this.getCurrentSession();
    return this._syncStateFromSession(session, {
      status: session ? 'authenticated' : 'signed_out'
    });
  }

  async syncCloudTrackingEvents() {
    const summary = {
      available: this.isConfigured(),
      enabled: false,
      applied: 0,
      skipped: 0,
      imported: {
        open: 0,
        click: 0,
        unsubscribe: 0
      },
      lastCreatedAt: null,
      lastError: '',
      reason: 'not_started'
    };

    if (!summary.available) {
      return { ...summary, reason: 'cloud_not_configured' };
    }

    const accountStatus = this.getStatus();
    if (!accountStatus.authenticated) {
      return { ...summary, reason: 'signed_out' };
    }

    if (!this.entitlementService?.hasCapability?.('hostedTracking')) {
      return { ...summary, reason: 'plan_locked' };
    }

    if (!this.db || typeof this.db.addTrackingEvent !== 'function') {
      return { ...summary, reason: 'local_tracking_unavailable' };
    }

    const client = await this._ensureClient();
    const session = await this.getCurrentSession();
    const userId = session?.user?.id || accountStatus?.account?.id || '';
    if (!client || !userId) {
      return { ...summary, reason: 'session_unavailable' };
    }

    const previousState = this._readTrackingSyncState();
    const fallbackSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since = String(previousState.lastCreatedAt || fallbackSince);

    try {
      const { data, error } = await client
        .from('tracking_events')
        .select('*')
        .eq('workspace_user_id', userId)
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) {
        return {
          ...summary,
          reason: 'query_failed',
          lastError: error.message
        };
      }

      const events = Array.isArray(data) ? data : [];
      if (events.length === 0) {
        return {
          ...summary,
          enabled: true,
          reason: 'active',
          lastCreatedAt: previousState.lastCreatedAt || null
        };
      }

      for (const event of events) {
        const cloudEventId = String(event?.id || '').trim();
        const campaignId = String(event?.campaign_external_id || '').trim();
        const contactId = String(event?.contact_external_id || '').trim();
        const trackingId = String(event?.tracking_id || '').trim();
        const eventType = String(event?.event_type || '').trim().toLowerCase();
        const email = normalizeEmailAddress(event?.recipient_email || '');
        const eventData = event?.event_data && typeof event.event_data === 'object'
          ? event.event_data
          : {};

        summary.lastCreatedAt = event?.created_at || summary.lastCreatedAt;

        if (!cloudEventId || this._hasLocalCloudTrackingEvent(cloudEventId)) {
          summary.skipped += 1;
          continue;
        }

        if (!campaignId || !trackingId || !['open', 'click', 'unsubscribe'].includes(eventType)) {
          summary.skipped += 1;
          continue;
        }

        if (eventType === 'unsubscribe') {
          if (email && !this.db.isUnsubscribed?.(email)) {
            this.db.addUnsubscribe?.(email, campaignId, 'Cloud unsubscribe');
          }
          if (email) {
            this.db.addToBlacklist?.({
              email,
              reason: 'Cloud unsubscribe',
              source: 'cloud_tracking'
            });
          }
        }

        const isUnique = !this._hasLocalTrackingEvent(campaignId, contactId, email, eventType);
        const isBot = !!(eventData.isBot || eventData.is_bot);

        this.db.addTrackingEvent({
          campaignId,
          contactId,
          trackingId,
          cloudEventId,
          email,
          type: eventType,
          link: String(event?.link_url || '').trim(),
          userAgent: String(event?.user_agent || '').trim(),
          ipAddress: String(event?.ip_address || '').trim(),
          client: String(eventData.client || '').trim(),
          device: String(eventData.device || '').trim(),
          os: String(eventData.os || '').trim(),
          isBot,
          country: String(event?.country || '').trim(),
          region: String(event?.region || '').trim()
        });

        if (!isBot && isUnique) {
          if (eventType === 'open' && typeof this.db.updateCampaignLogOpened === 'function') {
            this.db.updateCampaignLogOpened(campaignId, trackingId);
          }
          if (eventType === 'click' && typeof this.db.updateCampaignLogClicked === 'function') {
            this.db.updateCampaignLogClicked(campaignId, trackingId);
          }
        }

        summary.applied += 1;
        summary.imported[eventType] += 1;
      }

      this._writeTrackingSyncState({
        lastCreatedAt: summary.lastCreatedAt || previousState.lastCreatedAt || null,
        lastSyncedAt: new Date().toISOString()
      });

      return {
        ...summary,
        enabled: true,
        reason: 'active'
      };
    } catch (error) {
      this.logger?.warn?.('Cloud tracking sync failed', { error: error.message });
      return {
        ...summary,
        enabled: true,
        reason: 'error',
        lastError: error.message || 'Cloud tracking sync failed'
      };
    }
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
