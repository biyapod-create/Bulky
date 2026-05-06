const registerBackupHandlers = require('../registerBackupHandlers');
const registerCampaignHandlers = require('../registerCampaignHandlers');
const registerCloudHandlers = require('../registerCloudHandlers');
const registerContactsHandlers = require('../registerContactsHandlers');
const registerContentHandlers = require('../registerContentHandlers');
const registerDataHandlers = require('../registerDataHandlers');
const registerMessagingHandlers = require('../registerMessagingHandlers');
const registerAutomationHandlers = require('../registerAutomationHandlers');
const registerOperationsHandlers = require('../registerOperationsHandlers');
const registerAccountHandlers = require('../registerAccountHandlers');
const registerEntitlementHandlers = require('../registerEntitlementHandlers');
const registerSettingsHandlers = require('../registerSettingsHandlers');
const registerSmtpHandlers = require('../registerSmtpHandlers');
const registerSupportHandlers = require('../registerSupportHandlers');

function createHandlerRegistry() {
  const handlers = {};
  return {
    handlers,
    safeHandler: (channel, handler) => {
      handlers[channel] = handler;
    },
    rateLimitedHandler: (channel, handler) => {
      handlers[channel] = handler;
    }
  };
}

describe('IPC payload validation', () => {
  it('rejects invalid SMTP account payloads before saving', async () => {
    const registry = createHandlerRegistry();
    const db = { addSmtpAccount: jest.fn(), getAllSmtpAccounts: jest.fn(() => []), getActiveSmtpAccounts: jest.fn(() => []) };

    registerSmtpHandlers({
      safeHandler: registry.safeHandler,
      db,
      emailService: { testConnection: jest.fn() },
      decryptSmtpAccount: (account) => account,
      encryptPassword: (password) => `enc:${password}`,
      validateRequired: jest.fn(() => null),
      getPrimarySmtpAccount: jest.fn(() => null)
    });

    const result = await registry.handlers['smtpAccounts:add'](null, {
      host: 'smtp.example.com',
      port: 70000,
      username: 'sender@example.com',
      password: 'secret'
    });

    expect(result).toEqual({ error: 'Invalid port: must be at most 65535' });
    expect(db.addSmtpAccount).not.toHaveBeenCalled();
  });

  it('does not return stored SMTP passwords to the renderer payloads', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllSmtpAccounts: jest.fn(() => [{
        id: 'smtp-1',
        host: 'smtp.example.com',
        username: 'sender@example.com',
        password: 'enc:secret',
        fromEmail: 'sender@example.com'
      }]),
      getActiveSmtpAccounts: jest.fn(() => [{
        id: 'smtp-1',
        host: 'smtp.example.com',
        username: 'sender@example.com',
        password: 'enc:secret',
        fromEmail: 'sender@example.com'
      }])
    };

    registerSmtpHandlers({
      safeHandler: registry.safeHandler,
      db,
      emailService: { testConnection: jest.fn() },
      decryptSmtpAccount: (account) => ({ ...account, password: 'secret' }),
      encryptPassword: (password) => `enc:${password}`,
      validateRequired: jest.fn(() => null),
      getPrimarySmtpAccount: jest.fn(() => ({
        id: 'smtp-1',
        host: 'smtp.example.com',
        username: 'sender@example.com',
        password: 'enc:secret',
        fromEmail: 'sender@example.com'
      }))
    });

    const legacy = await registry.handlers['smtp:get']();
    const allAccounts = await registry.handlers['smtpAccounts:getAll']();

    expect(legacy).toMatchObject({
      id: 'smtp-1',
      password: '',
      hasStoredPassword: true
    });
    expect(allAccounts[0]).toMatchObject({
      id: 'smtp-1',
      password: '',
      hasStoredPassword: true
    });
  });

  it('returns the normalized entitlement state through the read-only IPC bridge', async () => {
    const registry = createHandlerRegistry();
    const entitlementState = {
      plan: { id: 'legacy', name: 'Local Build' },
      capabilities: { aiAssistant: true }
    };

    registerEntitlementHandlers({
      safeHandler: registry.safeHandler,
      entitlementService: {
        getState: jest.fn(() => entitlementState)
      }
    });

    expect(registry.handlers['entitlement:getState']()).toEqual(entitlementState);
  });

  it('returns sanitized cloud configuration without exposing stored public keys to the renderer', () => {
    const registry = createHandlerRegistry();
    const cloudConfigService = {
      getRendererConfig: jest.fn(() => ({
        apiBaseUrl: 'https://api.bulkyapp.com',
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: '',
        hasSupabaseAnonKey: true,
        paystackPublicKey: '',
        hasPaystackPublicKey: true
      })),
      getStatus: jest.fn(() => ({
        hybridReady: false
      }))
    };

    registerCloudHandlers({
      safeHandler: registry.safeHandler,
      cloudConfigService
    });

    expect(registry.handlers['cloud:getConfig']()).toEqual({
      apiBaseUrl: 'https://api.bulkyapp.com',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: '',
      hasSupabaseAnonKey: true,
      paystackPublicKey: '',
      hasPaystackPublicKey: true
    });
  });

  it('preserves saved cloud keys when masked renderer fields are submitted blank', async () => {
    const registry = createHandlerRegistry();
    const syncTrackingBaseUrl = jest.fn();
    const cloudConfigService = {
      saveFromRenderer: jest.fn(() => ({
        apiBaseUrl: 'https://api.bulkyapp.com',
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: '',
        hasSupabaseAnonKey: true,
        clearSupabaseAnonKey: false,
        paystackPublicKey: '',
        hasPaystackPublicKey: true,
        clearPaystackPublicKey: false
      })),
      getStatus: jest.fn(() => ({
        cloudflare: {
          apiConfigured: true,
          trackingConfigured: false,
          updatesConfigured: false
        },
        supabase: {
          configured: true,
          url: 'https://project.supabase.co',
          hasAnonKey: true
        },
        paystack: {
          configured: true,
          hasPublicKey: true,
          checkoutBaseUrl: ''
        },
        hybridReady: false
      }))
    };
    const desktopAccountService = {
      initialize: jest.fn(async () => ({
        configured: true,
        authenticated: false,
        status: 'signed_out'
      }))
    };
    const syncService = {
      refresh: jest.fn(async () => null),
      getStatus: jest.fn(() => ({
        available: true,
        enabled: false,
        connected: false,
        state: 'disabled'
      }))
    };

    registerCloudHandlers({
      safeHandler: registry.safeHandler,
      cloudConfigService,
      syncTrackingBaseUrl,
      desktopAccountService,
      syncService
    });

    const result = await registry.handlers['cloud:saveConfig'](null, {
      apiBaseUrl: 'api.bulkyapp.com',
      trackingBaseUrl: '',
      updatesBaseUrl: '',
      supabaseUrl: 'project.supabase.co',
      supabaseAnonKey: '',
      clearSupabaseAnonKey: false,
      paystackPublicKey: '',
      clearPaystackPublicKey: false,
      paystackCheckoutBaseUrl: ''
    });

    expect(cloudConfigService.saveFromRenderer).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'api.bulkyapp.com',
      supabaseAnonKey: '',
      clearSupabaseAnonKey: false,
      paystackPublicKey: '',
      clearPaystackPublicKey: false
    }));
    expect(syncTrackingBaseUrl).toHaveBeenCalled();
    expect(desktopAccountService.initialize).toHaveBeenCalled();
    expect(syncService.refresh).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      config: {
        apiBaseUrl: 'https://api.bulkyapp.com',
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: '',
        hasSupabaseAnonKey: true,
        clearSupabaseAnonKey: false,
        paystackPublicKey: '',
        hasPaystackPublicKey: true,
        clearPaystackPublicKey: false
      },
      status: {
        cloudflare: {
          apiConfigured: true,
          trackingConfigured: false,
          updatesConfigured: false
        },
        supabase: {
          configured: true,
          url: 'https://project.supabase.co',
          hasAnonKey: true
        },
        paystack: {
          configured: true,
          hasPublicKey: true,
          checkoutBaseUrl: ''
        },
        hybridReady: false
      },
      accountStatus: {
        configured: true,
        authenticated: false,
        status: 'signed_out'
      },
      syncStatus: {
        available: true,
        enabled: false,
        connected: false,
        state: 'disabled'
      }
    });
  });

  it('returns a hosted checkout URL and opens it through the shell bridge', async () => {
    const registry = createHandlerRegistry();
    const shell = { openExternal: jest.fn(async () => true) };
    const hybridCloudService = {
      buildCheckoutUrl: jest.fn(() => ({
        url: 'https://checkout.bulkyapp.com/?plan=pro',
        planId: 'pro'
      }))
    };

    registerCloudHandlers({
      safeHandler: registry.safeHandler,
      cloudConfigService: { getRendererConfig: jest.fn(), getStatus: jest.fn(), saveFromRenderer: jest.fn() },
      hybridCloudService,
      shell
    });

    const lookup = registry.handlers['cloud:getCheckoutUrl'](null, {
      planId: 'pro',
      email: 'owner@example.com'
    });
    const opened = await registry.handlers['cloud:openCheckout'](null, {
      planId: 'pro',
      email: 'owner@example.com'
    });

    expect(hybridCloudService.buildCheckoutUrl).toHaveBeenCalledWith({
      planId: 'pro',
      email: 'owner@example.com',
      workspaceName: '',
      source: 'desktop-settings'
    });
    expect(lookup).toEqual({
      url: 'https://checkout.bulkyapp.com/?plan=pro',
      planId: 'pro'
    });
    expect(shell.openExternal).toHaveBeenCalledWith('https://checkout.bulkyapp.com/?plan=pro');
    expect(opened).toEqual({
      success: true,
      url: 'https://checkout.bulkyapp.com/?plan=pro',
      planId: 'pro'
    });
  });

  it('rejects invalid desktop sign-in payloads before hitting the account service', async () => {
    const registry = createHandlerRegistry();
    const desktopAccountService = {
      signUpWithPassword: jest.fn(),
      signInWithPassword: jest.fn()
    };

    registerAccountHandlers({
      safeHandler: registry.safeHandler,
      desktopAccountService
    });

    const result = await registry.handlers['account:signIn'](null, {
      email: 'not-an-email',
      password: 'secret'
    });

    expect(result).toEqual({ error: 'Invalid email' });
    expect(desktopAccountService.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects invalid desktop sign-up payloads before hitting the account service', async () => {
    const registry = createHandlerRegistry();
    const desktopAccountService = {
      signUpWithPassword: jest.fn(),
      signInWithPassword: jest.fn()
    };

    registerAccountHandlers({
      safeHandler: registry.safeHandler,
      desktopAccountService
    });

    const result = await registry.handlers['account:signUp'](null, {
      fullName: 'Owner',
      workspaceName: 'Bulky',
      email: 'owner@example.com',
      password: 'short'
    });

    expect(result).toEqual({ error: 'Invalid password: must be at least 8 characters' });
    expect(desktopAccountService.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('passes normalized desktop sign-in payloads to the account service and exposes account status', async () => {
    const registry = createHandlerRegistry();
    const desktopAccountService = {
      getStatus: jest.fn(() => ({
        configured: true,
        authenticated: true,
        account: {
          email: 'owner@example.com'
        }
      })),
      signUpWithPassword: jest.fn(async () => ({
        success: true,
        pendingConfirmation: true,
        status: {
          configured: true,
          authenticated: false,
          status: 'pending_confirmation',
          account: {
            email: 'owner@example.com',
            fullName: 'Owner',
            workspaceName: 'Bulky'
          }
        }
      })),
      signInWithPassword: jest.fn(async () => ({
        success: true,
        status: {
          configured: true,
          authenticated: true,
          account: {
            email: 'owner@example.com'
          }
        }
      })),
      refreshSession: jest.fn(async () => ({ success: true })),
      signOut: jest.fn(async () => ({ success: true }))
    };

    registerAccountHandlers({
      safeHandler: registry.safeHandler,
      desktopAccountService
    });

    const status = await registry.handlers['account:getStatus']();
    const signUpResult = await registry.handlers['account:signUp'](null, {
      fullName: 'Owner',
      workspaceName: 'Bulky',
      email: ' owner@example.com ',
      password: 'super-secret'
    });
    const result = await registry.handlers['account:signIn'](null, {
      email: ' Owner@Example.com ',
      password: 'secret'
    });

    expect(status).toEqual({
      configured: true,
      authenticated: true,
      account: {
        email: 'owner@example.com'
      }
    });
    expect(desktopAccountService.signUpWithPassword).toHaveBeenCalledWith({
      fullName: 'Owner',
      workspaceName: 'Bulky',
      email: 'owner@example.com',
      password: 'super-secret',
      planId: 'freemium'
    });
    expect(desktopAccountService.signInWithPassword).toHaveBeenCalledWith({
      email: 'Owner@Example.com',
      password: 'secret'
    });
    expect(signUpResult).toEqual({
      success: true,
      pendingConfirmation: true,
      status: {
        configured: true,
        authenticated: false,
        status: 'pending_confirmation',
        account: {
          email: 'owner@example.com',
          fullName: 'Owner',
          workspaceName: 'Bulky'
        }
      }
    });
    expect(result).toEqual({
      success: true,
      status: {
        configured: true,
        authenticated: true,
        account: {
          email: 'owner@example.com'
        }
      }
    });
  });

  it('preserves an existing SMTP password when an account update leaves the password field blank', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllSmtpAccounts: jest.fn(() => [{
        id: 'smtp-1',
        host: 'smtp.example.com',
        username: 'sender@example.com',
        password: 'enc:secret',
        fromEmail: 'sender@example.com'
      }]),
      getActiveSmtpAccounts: jest.fn(() => []),
      updateSmtpAccount: jest.fn()
    };

    registerSmtpHandlers({
      safeHandler: registry.safeHandler,
      db,
      emailService: { testConnection: jest.fn() },
      decryptSmtpAccount: (account) => ({ ...account, password: 'secret' }),
      encryptPassword: (password) => `enc:${password}`,
      validateRequired: jest.fn(() => null),
      getPrimarySmtpAccount: jest.fn(() => null)
    });

    const result = await registry.handlers['smtpAccounts:update'](null, {
      id: 'smtp-1',
      host: 'smtp.example.com',
      username: 'sender@example.com',
      password: '',
      fromEmail: 'sender@example.com'
    });

    expect(result).toEqual({ success: true });
    expect(db.updateSmtpAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'smtp-1',
      password: 'enc:secret'
    }));
  });

  it('blocks freemium SMTP account creation after the local cap is reached', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllSmtpAccounts: jest.fn(() => [
        { id: 'smtp-1', host: 'smtp.example.com', username: 'sender@example.com', password: 'enc:one', fromEmail: 'sender@example.com' },
        { id: 'smtp-2', host: 'smtp.example.com', username: 'sender2@example.com', password: 'enc:two', fromEmail: 'sender2@example.com' }
      ]),
      addSmtpAccount: jest.fn()
    };

    registerSmtpHandlers({
      safeHandler: registry.safeHandler,
      db,
      emailService: { testConnection: jest.fn() },
      decryptSmtpAccount: (account) => ({ ...account, password: 'secret' }),
      encryptPassword: (password) => `enc:${password}`,
      entitlementService: {
        canAddSmtpAccount: jest.fn(() => ({
          allowed: false,
          error: 'Your current plan allows up to 2 SMTP accounts. Upgrade to Pro or One-off to add more.',
          code: 'smtp_account_limit_reached',
          maxSmtpAccounts: 2
        }))
      },
      validateRequired: jest.fn(() => null),
      getPrimarySmtpAccount: jest.fn(() => null)
    });

    const result = await registry.handlers['smtpAccounts:add'](null, {
      host: 'smtp.example.com',
      username: 'sender3@example.com',
      password: 'secret'
    });

    expect(result).toEqual({
      error: 'Your current plan allows up to 2 SMTP accounts. Upgrade to Pro or One-off to add more.',
      code: 'smtp_account_limit_reached',
      maxSmtpAccounts: 2
    });
    expect(db.addSmtpAccount).not.toHaveBeenCalled();
  });

  it('reuses the stored SMTP password for detailed SMTP tests when the renderer payload leaves password blank', async () => {
    const registry = createHandlerRegistry();
    const verify = jest.fn(async () => true);

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({
        verify,
        close: jest.fn()
      }))
    }));

    const db = {
      getAllSmtpAccounts: jest.fn(() => [{
        id: 'smtp-1',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'sender@example.com',
        password: 'enc:secret',
        fromEmail: 'sender@example.com'
      }])
    };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: () => 'secret',
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['smtp:testDetailed'](null, {
      id: 'smtp-1',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'sender@example.com',
      password: '',
      fromEmail: 'sender@example.com'
    });

    expect(result.success).toBe(true);

    jest.dontMock('nodemailer');
  });

  it('blocks analytics IPC on plans without analytics access', async () => {
    const registry = createHandlerRegistry();

    registerCampaignHandlers({
      safeHandler: registry.safeHandler,
      db: { getCampaignAnalytics: jest.fn() },
      validateRequired: jest.fn(() => null),
      entitlementService: {
        requireCapability: jest.fn(() => ({
          error: 'Advanced statistics are available on Pro and One-off plans.',
          code: 'capability_locked',
          capability: 'analytics',
          currentPlan: 'freemium'
        }))
      },
      scheduledCampaignTimers: new Map(),
      scheduleNextCampaign: jest.fn()
    });

    const result = await registry.handlers['campaigns:getAnalytics'](null, 'campaign-1');

    expect(result).toEqual({
      error: 'Advanced statistics are available on Pro and One-off plans.',
      code: 'capability_locked',
      capability: 'analytics',
      currentPlan: 'freemium'
    });
  });

  it('rejects invalid A/B campaign payloads before saving', async () => {
    const registry = createHandlerRegistry();
    const db = { addCampaign: jest.fn() };

    registerCampaignHandlers({
      safeHandler: registry.safeHandler,
      db,
      validateRequired: jest.fn(() => null),
      scheduledCampaignTimers: new Map(),
      scheduleNextCampaign: jest.fn()
    });

    const result = await registry.handlers['campaigns:add'](null, {
      name: 'Spring Launch',
      subject: 'Variant A',
      isABTest: true,
      subjectB: ''
    });

    expect(result).toEqual({ error: 'Variant B subject is required for A/B tests' });
    expect(db.addCampaign).not.toHaveBeenCalled();
  });

  it('rejects invalid campaign schedule timestamps', async () => {
    const registry = createHandlerRegistry();
    const db = { _get: jest.fn(), updateCampaign: jest.fn() };

    registerCampaignHandlers({
      safeHandler: registry.safeHandler,
      db,
      validateRequired: jest.fn(() => null),
      scheduledCampaignTimers: new Map(),
      scheduleNextCampaign: jest.fn()
    });

    const result = await registry.handlers['campaigns:schedule'](null, {
      campaignId: 'campaign-1',
      scheduledAt: 'not-a-date'
    });

    expect(result).toEqual({ error: 'Invalid scheduledAt: expected a valid date/time' });
    expect(db._get).not.toHaveBeenCalled();
  });

  it('rejects malformed email send payloads before calling the service', async () => {
    const registry = createHandlerRegistry();
    const emailService = { sendCampaign: jest.fn(), createTransporter: jest.fn(), sendSingleEmail: jest.fn() };

    registerMessagingHandlers({
      safeHandler: registry.safeHandler,
      rateLimitedHandler: registry.rateLimitedHandler,
      db: { _get: jest.fn(), getContactsForCampaign: jest.fn(), getActiveSmtpAccounts: jest.fn(() => []) },
      emailService,
      verificationService: { verifyEmail: jest.fn(), verifyBulk: jest.fn(), pause: jest.fn(), resume: jest.fn(), stop: jest.fn() },
      decryptSmtpAccount: (account) => account,
      logger: { logCampaign: jest.fn(), error: jest.fn() },
      getMainWindow: () => null
    });

    const result = await registry.handlers['email:send'](null, {
      campaign: { id: 'campaign-1', name: 'Launch', subject: 'Hello' },
      contacts: 'not-an-array',
      settings: { host: 'smtp.example.com' }
    });

    expect(result).toEqual({ error: 'Invalid contacts: expected an array' });
    expect(emailService.sendCampaign).not.toHaveBeenCalled();
  });

  it('normalizes bulk verification input before invoking the verification service', async () => {
    const registry = createHandlerRegistry();
    const verifyBulk = jest.fn(async () => ({
      results: [{ email: 'test@example.com', status: 'valid', score: 100, details: {} }]
    }));

    registerMessagingHandlers({
      safeHandler: registry.safeHandler,
      rateLimitedHandler: registry.rateLimitedHandler,
      db: { _get: jest.fn(() => null), _run: jest.fn() },
      emailService: { sendCampaign: jest.fn(), createTransporter: jest.fn(), sendSingleEmail: jest.fn() },
      verificationService: {
        verifyEmail: jest.fn(),
        verifyBulk,
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn()
      },
      decryptSmtpAccount: (account) => account,
      logger: { logCampaign: jest.fn(), error: jest.fn() },
      getMainWindow: () => null
    });

    const result = await registry.handlers['verify:bulk'](null, ['  test@example.com  ', '']);

    expect(verifyBulk).toHaveBeenCalledWith(
      ['test@example.com'],
      expect.any(Function),
      { skipSmtpCheck: true, timeout: undefined, checkCatchAll: true }
    );
    expect(result.results).toHaveLength(1);
  });

  it('normalizes single verification input and supports smtpCheck payloads', async () => {
    const registry = createHandlerRegistry();
    const verifyEmail = jest.fn(async () => ({
      email: 'test@example.com',
      status: 'valid',
      score: 100,
      details: {}
    }));

    registerMessagingHandlers({
      safeHandler: registry.safeHandler,
      rateLimitedHandler: registry.rateLimitedHandler,
      db: { _get: jest.fn(() => null), _run: jest.fn() },
      emailService: { sendCampaign: jest.fn(), createTransporter: jest.fn(), sendSingleEmail: jest.fn() },
      verificationService: {
        verifyEmail,
        verifyBulk: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn()
      },
      decryptSmtpAccount: (account) => account,
      logger: { logCampaign: jest.fn(), error: jest.fn() },
      getMainWindow: () => null
    });

    await registry.handlers['verify:email'](null, {
      email: '  test@example.com  ',
      smtpCheck: true,
      timeout: 7000,
      checkCatchAll: false
    });

    expect(verifyEmail).toHaveBeenCalledWith('test@example.com', {
      skipSmtpCheck: false,
      timeout: 7000,
      checkCatchAll: false
    });
  });

  it('persists single verification results back to matching contacts', async () => {
    const registry = createHandlerRegistry();
    const verifyEmail = jest.fn(async () => ({
      email: 'test@example.com',
      status: 'valid',
      score: 97,
      details: { method: 'smtp' }
    }));
    const db = {
      _get: jest.fn(() => ({ id: 'contact-1', email: 'test@example.com' })),
      _run: jest.fn()
    };

    registerMessagingHandlers({
      safeHandler: registry.safeHandler,
      rateLimitedHandler: registry.rateLimitedHandler,
      db,
      emailService: { sendCampaign: jest.fn(), createTransporter: jest.fn(), sendSingleEmail: jest.fn() },
      verificationService: {
        verifyEmail,
        verifyBulk: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn()
      },
      decryptSmtpAccount: (account) => account,
      logger: { logCampaign: jest.fn(), error: jest.fn() },
      getMainWindow: () => null
    });

    const result = await registry.handlers['verify:email'](null, {
      email: 'test@example.com',
      smtpCheck: false
    });

    expect(result.status).toBe('valid');
    expect(db._run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE contacts SET verificationStatus = ?'),
      ['valid', 97, JSON.stringify({ method: 'smtp' }), 'contact-1']
    );
  });

  it('saves only supported application settings keys', async () => {
    const registry = createHandlerRegistry();
    const db = { saveAllSettings: jest.fn(), getSetting: jest.fn(), getAllSettings: jest.fn() };

    registerSettingsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
      fs: { writeFileSync: jest.fn(), readFileSync: jest.fn() },
      encryptPassword: jest.fn(),
      decryptSmtpAccount: (account) => account,
      syncTrackingBaseUrl: jest.fn(),
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => []),
      getMainWindow: () => null
    });

    const result = await registry.handlers['settings:save'](null, {
      theme: 'light',
      defaultBatchSize: 75,
      unexpectedKey: 'ignore-me'
    });

    expect(result).toEqual({ success: true });
    expect(db.saveAllSettings).toHaveBeenCalledWith({
      theme: 'light',
      defaultBatchSize: 75
    });
  });

  it('rejects invalid warmup settings before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = { setSetting: jest.fn(), getSetting: jest.fn(), getAllSettings: jest.fn() };

    registerSettingsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
      fs: { writeFileSync: jest.fn(), readFileSync: jest.fn() },
      encryptPassword: jest.fn(),
      decryptSmtpAccount: (account) => account,
      syncTrackingBaseUrl: jest.fn(),
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => []),
      getMainWindow: () => null
    });

    const result = await registry.handlers['settings:saveWarmup'](null, {
      enabled: true,
      startVolume: 0,
      dailyIncrease: 5,
      maxVolume: 500,
      warmupDays: 14
    });

    expect(result).toEqual({ error: 'Invalid startVolume: must be at least 1' });
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it('returns system diagnostics with version, tracking, smtp, and ai state', async () => {
    const registry = createHandlerRegistry();
    const db = {
      setSetting: jest.fn(),
      getSetting: jest.fn((key) => {
        if (key === 'deliverability') {
          return JSON.stringify({
            trackingDomain: 'https://track.example.com',
            sendingMode: 'bulk',
            companyAddress: '123 Main Street',
            spfConfigured: true,
            dkimConfigured: true,
            dmarcConfigured: false
          });
        }
        if (key === 'ai') {
          return JSON.stringify({
            enabled: true,
            provider: 'openrouter',
            model: 'gpt-4o-mini',
            apiKey: 'enc:key'
          });
        }
        return null;
      }),
      getAllSettings: jest.fn(),
      getAllSmtpAccounts: jest.fn(() => [{
        id: 'smtp-1',
        name: 'Primary',
        fromEmail: 'sender@example.com',
        replyTo: 'reply@example.com',
        isActive: 1
      }]),
      getBackupHistory: jest.fn(() => [{ id: 'backup-1' }])
    };

    registerSettingsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
      fs: { writeFileSync: jest.fn(), readFileSync: jest.fn(), existsSync: jest.fn(() => true), statSync: jest.fn(() => ({ size: 4096 })) },
      encryptPassword: jest.fn(),
      decryptSmtpAccount: (account) => account,
      syncTrackingBaseUrl: jest.fn(),
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => []),
      appVersion: '6.1.0',
      dbPath: 'C:\\bulky\\bulky.db',
      userDataPath: 'C:\\bulky',
      getTrackingBaseUrl: jest.fn(() => 'https://track.example.com'),
      getTrackingHealth: jest.fn(() => ({ listening: true, localBaseUrl: 'http://127.0.0.1:3847', port: 3847 })),
      getPrimarySmtpAccount: jest.fn(() => ({ id: 'smtp-1', name: 'Primary', fromEmail: 'sender@example.com', replyTo: 'reply@example.com', isActive: 1 })),
      getMainWindow: () => null
    });

    const result = await registry.handlers['settings:getDiagnostics']();

    expect(result).toMatchObject({
      version: '6.1.0',
      tracking: {
        baseUrl: 'https://track.example.com',
        listening: true,
        port: 3847
      },
      smtp: {
        totalAccounts: 1,
        activeAccounts: 1,
        primaryFromEmail: 'sender@example.com'
      },
      ai: {
        enabled: true,
        provider: 'openrouter',
        model: 'gpt-4o-mini',
        hasApiKey: true
      }
    });
  });

  it('rejects invalid AI generation payloads before invoking the AI service', async () => {
    const registry = createHandlerRegistry();
    const aiService = { generateContent: jest.fn() };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db: { getSetting: jest.fn() },
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService,
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['ai:generateContent'](null, { prompt: '   ', tone: 'professional' });

    expect(result).toEqual({ error: 'Invalid prompt: value is required' });
    expect(aiService.generateContent).not.toHaveBeenCalled();
  });

  it('passes normalized structured AI generation payloads to the AI service', async () => {
    const registry = createHandlerRegistry();
    const aiService = { generateContent: jest.fn(() => ({ subject: 'Hello', html: '<p>Hi</p>' })) };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db: { getSetting: jest.fn() },
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService,
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const payload = {
      prompt: 'Welcome email for new customers',
      tone: 'friendly',
      objective: 'Drive first purchase',
      audience: 'New customers',
      cta: 'Shop now',
      offer: '10% off',
      brandVoice: 'Warm and direct',
      format: 'welcome',
      keywords: ['welcome', 'discount'],
      includePersonalization: false
    };

    await registry.handlers['ai:generateContent'](null, payload);

    expect(aiService.generateContent).toHaveBeenCalledWith(payload);
  });

  it('saves LM Studio AI settings and applies provider-specific fields', async () => {
    const registry = createHandlerRegistry();
    const db = { setSetting: jest.fn(), getSetting: jest.fn() };
    const aiService = {
      setApiKey: jest.fn(),
      setModel: jest.fn(),
      setProvider: jest.fn(),
      setLmstudioBaseUrl: jest.fn()
    };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService,
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['ai:saveSettings'](null, {
      provider: 'lmstudio',
      model: 'local-model',
      lmstudioBaseUrl: 'http://localhost:1234/v1'
    });

    expect(result).toEqual({ success: true, hasApiKey: false });
    expect(aiService.setProvider).toHaveBeenCalledWith('lmstudio');
    expect(aiService.setModel).toHaveBeenCalledWith('local-model');
    expect(aiService.setLmstudioBaseUrl).toHaveBeenCalledWith('http://localhost:1234/v1');
  });

  it('returns AI diagnostics for an LM Studio setup', async () => {
    const registry = createHandlerRegistry();

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db: {
        getSetting: jest.fn(() => JSON.stringify({
          enabled: true,
          provider: 'lmstudio',
          model: 'local-model',
          lmstudioBaseUrl: 'http://localhost:1234/v1'
        }))
      },
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService: {
        getLMStudioModels: jest.fn(async () => ({
          models: [{ id: 'local-model', label: 'local-model' }]
        }))
      },
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['ai:getDiagnostics']();

    expect(result).toMatchObject({
      enabled: true,
      provider: 'lmstudio',
      model: 'local-model',
      connection: {
        ok: true
      }
    });
    expect(result.availableModels).toHaveLength(1);
  });

  it('does not return a decrypted AI apiKey to the renderer settings payload', async () => {
    const registry = createHandlerRegistry();

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db: {
        getSetting: jest.fn(() => JSON.stringify({
          enabled: true,
          provider: 'openrouter',
          model: 'gpt-4o-mini',
          apiKey: 'enc:secret-key'
        }))
      },
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService: {
        setApiKey: jest.fn(),
        setModel: jest.fn(),
        setProvider: jest.fn(),
        setLmstudioBaseUrl: jest.fn()
      },
      decryptPassword: () => 'secret-key',
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['ai:getSettings']();

    expect(result).toMatchObject({
      enabled: true,
      provider: 'openrouter',
      model: 'gpt-4o-mini',
      apiKey: '',
      hasApiKey: true
    });
  });

  it('preserves an existing saved AI apiKey when settings are saved with a blank apiKey field', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getSetting: jest.fn(() => JSON.stringify({
        provider: 'openrouter',
        model: 'gpt-4o-mini',
        apiKey: 'enc:existing-key'
      })),
      setSetting: jest.fn()
    };
    const aiService = {
      setApiKey: jest.fn(),
      setModel: jest.fn(),
      setProvider: jest.fn(),
      setLmstudioBaseUrl: jest.fn()
    };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService,
      decryptPassword: () => 'existing-key',
      encryptPassword: (value) => `enc:${value}`
    });

    const result = await registry.handlers['ai:saveSettings'](null, {
      provider: 'openrouter',
      model: 'gpt-4o',
      apiKey: ''
    });

    expect(result).toEqual({ success: true, hasApiKey: true });
    expect(db.setSetting).toHaveBeenCalledWith('ai', JSON.stringify({
      provider: 'openrouter',
      model: 'gpt-4o',
      apiKey: 'enc:existing-key'
    }));
    expect(aiService.setApiKey).toHaveBeenCalledWith('existing-key');
  });

  it('clears a saved AI apiKey only when explicitly requested', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getSetting: jest.fn(() => JSON.stringify({
        provider: 'openrouter',
        model: 'gpt-4o-mini',
        apiKey: 'enc:existing-key'
      })),
      setSetting: jest.fn()
    };
    const aiService = {
      setApiKey: jest.fn(),
      setModel: jest.fn(),
      setProvider: jest.fn(),
      setLmstudioBaseUrl: jest.fn()
    };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService,
      decryptPassword: () => 'existing-key',
      encryptPassword: (value) => `enc:${value}`
    });

    const result = await registry.handlers['ai:saveSettings'](null, {
      provider: 'openrouter',
      model: 'gpt-4o-mini',
      apiKey: '',
      clearApiKey: true
    });

    expect(result).toEqual({ success: true, hasApiKey: false });
    expect(db.setSetting).toHaveBeenCalledWith('ai', JSON.stringify({
      provider: 'openrouter',
      model: 'gpt-4o-mini'
    }));
    expect(aiService.setApiKey).toHaveBeenCalledWith('');
  });

  it('executes AI verify-contact actions through the backend action handler', async () => {
    const registry = createHandlerRegistry();
    const verifyEmail = jest.fn(async () => ({
      status: 'valid',
      score: 98,
      reason: 'Mailbox exists',
      details: { method: 'smtp' }
    }));
    const db = {
      getSetting: jest.fn(),
      getAllContacts: jest.fn(() => [{ id: 'contact-1', email: 'person@example.com' }]),
      updateContact: jest.fn()
    };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService: { generateContent: jest.fn(), generateTemplateBlocks: jest.fn() },
      verificationService: { verifyEmail },
      domainHealthService: { checkDomain: jest.fn() },
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['ai:executeAction'](null, {
      type: 'verifyContact',
      email: 'person@example.com'
    });

    expect(verifyEmail).toHaveBeenCalledWith('person@example.com', {
      skipSmtpCheck: false,
      checkCatchAll: true,
      timeout: 15000
    });
    expect(db.updateContact).toHaveBeenCalledWith(expect.objectContaining({
      id: 'contact-1',
      verificationStatus: 'valid',
      verificationScore: 98
    }));
    expect(result.success).toBe(true);
  });

  it('rejects invalid spam replacement payloads before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = { addSpamReplacement: jest.fn(), getSetting: jest.fn() };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService: null,
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['spam:addReplacement'](null, { replacement: 'offer' });

    expect(result).toEqual({ error: 'Missing required field: spamWord' });
    expect(db.addSpamReplacement).not.toHaveBeenCalled();
  });

  it('rejects malformed tracking events before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = { addTrackingEvent: jest.fn(), getTrackingEvents: jest.fn(), getSetting: jest.fn() };

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db,
      spamService: { analyzeContent: jest.fn(), autoFix: jest.fn(), getSuggestions: jest.fn() },
      aiService: null,
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    const result = await registry.handlers['tracking:addEvent'](null, { type: 'open' });

    expect(result).toEqual({ error: 'Missing required field: campaignId' });
    expect(db.addTrackingEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid auto-backup config before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = { setSetting: jest.fn(), getBackupInfo: jest.fn(), getBackupHistory: jest.fn(), getSetting: jest.fn() };

    registerBackupHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn(), showMessageBox: jest.fn() },
      fs: { existsSync: jest.fn(), unlinkSync: jest.fn(), rmSync: jest.fn() },
      app: { relaunch: jest.fn(), exit: jest.fn() },
      logger: { info: jest.fn(), error: jest.fn() },
      emailService: { stop: jest.fn() },
      cleanup: jest.fn(),
      dbPath: 'C:\\db\\bulky.db',
      logDir: 'C:\\logs',
      getMainWindow: () => null
    });

    const result = await registry.handlers['backup:autoConfig'](null, { enabled: true, intervalHours: 0 });

    expect(result).toEqual({ error: 'Invalid intervalHours: must be at least 1' });
    expect(db.setSetting).not.toHaveBeenCalled();
  });

  it('rejects warmup schedule creation without an SMTP account id', async () => {
    const registry = createHandlerRegistry();
    const db = { createWarmupSchedule: jest.fn(), getDashboardStats: jest.fn(), getRetryQueueStats: jest.fn(), getAllSmtpAccounts: jest.fn() };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: (value) => value,
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['warmup:create'](null, {
      schedule: [{ day: 1, volume: 10 }]
    });

    expect(result).toEqual({ error: 'Missing required field: smtpAccountId' });
    expect(db.createWarmupSchedule).not.toHaveBeenCalled();
  });

  it('rejects invalid warmup auto-generate ranges', async () => {
    const registry = createHandlerRegistry();
    const db = {
      createWarmupSchedule: jest.fn(),
      getDashboardStats: jest.fn(),
      getRetryQueueStats: jest.fn(),
      getAllSmtpAccounts: jest.fn()
    };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: (value) => value,
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['warmup:autoGenerate'](null, {
      smtpAccountId: 'smtp-1',
      startVolume: 100,
      targetVolume: 50,
      daysToTarget: 14
    });

    expect(result).toEqual({ error: 'Invalid targetVolume: must be at least startVolume' });
    expect(db.createWarmupSchedule).not.toHaveBeenCalled();
  });

  it('rejects malformed segment filters before saving', async () => {
    const registry = createHandlerRegistry();
    const db = {
      addSegment: jest.fn(),
      getDashboardStats: jest.fn(),
      getRetryQueueStats: jest.fn(),
      getAllSmtpAccounts: jest.fn()
    };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: (value) => value,
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['segments:add'](null, {
      name: 'High Bounce',
      filters: '{bad json}'
    });

    expect(result).toEqual({ error: 'Invalid segment filters: expected valid JSON' });
    expect(db.addSegment).not.toHaveBeenCalled();
  });

  it('rejects non-string global search queries', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getDashboardStats: jest.fn(),
      getRetryQueueStats: jest.fn(),
      getAllSmtpAccounts: jest.fn(),
      globalSearch: jest.fn()
    };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: (value) => value,
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['search:global'](null, 12345);

    expect(result).toEqual({ error: 'Invalid query: expected a string' });
    expect(db.globalSearch).not.toHaveBeenCalled();
  });

  it('rejects invalid detailed SMTP test payloads before opening a transporter', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getDashboardStats: jest.fn(),
      getRetryQueueStats: jest.fn(),
      getAllSmtpAccounts: jest.fn()
    };

    registerOperationsHandlers({
      safeHandler: registry.safeHandler,
      db,
      decryptPassword: (value) => value,
      domainHealthService: { checkDomain: jest.fn() },
      getConfiguredDkimSelectors: jest.fn(() => [])
    });

    const result = await registry.handlers['smtp:testDetailed'](null, {
      host: 'smtp.example.com',
      port: 70000,
      username: 'sender@example.com',
      password: 'secret'
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid port: must be at most 65535',
      steps: []
    });
  });

  it('rejects malformed contact page queries before hitting the database', async () => {
    const registry = createHandlerRegistry();
    const db = { getContactsPage: jest.fn() };

    registerContactsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['contacts:getPage'](null, {
      sortBy: 'DROP TABLE contacts',
      page: 1,
      perPage: 50
    });

    expect(result).toEqual({ error: 'Invalid sortBy' });
    expect(db.getContactsPage).not.toHaveBeenCalled();
  });

  it('rejects bulk contact payloads with malformed entries before import', async () => {
    const registry = createHandlerRegistry();
    const db = { addBulkContacts: jest.fn() };

    registerContactsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['contacts:addBulk'](null, [
      { email: 'valid@example.com' },
      'not-an-object'
    ]);

    expect(result).toEqual({ error: 'Invalid contact in bulk request' });
    expect(db.addBulkContacts).not.toHaveBeenCalled();
  });

  it('prepares contact imports with dedupe and invalid-email summaries before commit', async () => {
    const registry = createHandlerRegistry();
    const db = {
      _all: jest.fn(() => [{ email: 'existing@example.com' }]),
      _get: jest.fn(() => ({ id: 'list-1', name: 'Newsletter' }))
    };

    registerContactsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['contacts:prepareImport'](null, {
      rows: [
        { Email: 'ready@example.com', First: 'Ready' },
        { Email: 'existing@example.com', First: 'Existing' },
        { Email: 'READY@example.com', First: 'Duplicate' },
        { Email: 'not-an-email', First: 'Invalid' },
        { Email: '', First: 'Blank' }
      ],
      mapping: {
        Email: 'email',
        First: 'firstName'
      },
      listId: 'list-1'
    });

    expect(result).toMatchObject({
      success: true,
      contacts: [{ email: 'ready@example.com', firstName: 'Ready' }],
      summary: {
        readyToImport: 1,
        existingDuplicates: 1,
        duplicateInFile: 1,
        invalidEmails: 1,
        blankEmailRows: 1,
        listId: 'list-1',
        listName: 'Newsletter'
      }
    });
  });

  it('rejects invalid import preview mappings before preparing contacts', async () => {
    const registry = createHandlerRegistry();

    registerContactsHandlers({
      safeHandler: registry.safeHandler,
      db: {},
      dialog: { showOpenDialog: jest.fn() },
      fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['contacts:prepareImport'](null, {
      rows: [{ Email: 'test@example.com' }],
      mapping: { Email: 'firstName' },
      listId: ''
    });

    expect(result).toEqual({
      success: false,
      error: 'Import mapping must include an email column'
    });
  });

  it('validates bulk list assignment targets before updating contacts', async () => {
    const registry = createHandlerRegistry();
    const db = {
      _get: jest.fn((query, values) => {
        if (query.includes('FROM lists')) {
          return values[0] === 'list-1' ? { id: 'list-1', name: 'Customers' } : null;
        }
        if (query.includes('FROM contacts')) {
          if (values[0] === 'contact-1') return { id: 'contact-1', listId: '' };
          if (values[0] === 'contact-2') return { id: 'contact-2', listId: 'list-1' };
          return null;
        }
        return null;
      }),
      addContactToList: jest.fn(),
      flushSave: jest.fn()
    };

    registerContactsHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['contacts:addToListBulk'](null, ['contact-1', 'contact-2', 'contact-3'], 'list-1');

    expect(result).toEqual({ success: true, updated: 1, skipped: 2 });
    expect(db.addContactToList).toHaveBeenCalledTimes(1);
    expect(db.addContactToList).toHaveBeenCalledWith('contact-1', 'list-1');
  });

  it('normalizes blacklist domain entries before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllTags: jest.fn(),
      addToBlacklist: jest.fn(),
      getAllLists: jest.fn(),
      getAllBlacklist: jest.fn(),
      getAllUnsubscribes: jest.fn()
    };

    registerDataHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { readFileSync: jest.fn() },
      getMainWindow: () => null
    });

    const result = await registry.handlers['blacklist:add'](null, {
      domain: ' Example.COM ',
      reason: 'Manual block',
      source: 'manual'
    });

    expect(db.addToBlacklist).toHaveBeenCalledWith({
      domain: 'example.com',
      email: '',
      reason: 'Manual block',
      source: 'manual'
    });
    expect(result).toBeUndefined();
  });

  it('rejects invalid unsubscribe payloads before persistence', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllTags: jest.fn(),
      getAllLists: jest.fn(),
      getAllBlacklist: jest.fn(),
      getAllUnsubscribes: jest.fn(),
      addUnsubscribe: jest.fn()
    };

    registerDataHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn() },
      fs: { readFileSync: jest.fn() },
      getMainWindow: () => null
    });

    const result = await registry.handlers['unsubscribes:add'](null, {
      email: 'not-an-email'
    });

    expect(result).toEqual({ error: 'Invalid email' });
    expect(db.addUnsubscribe).not.toHaveBeenCalled();
  });

  it('parses template block JSON before saving templates', async () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllTemplates: jest.fn(),
      addTemplate: jest.fn(() => 'template-1')
    };

    registerContentHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() },
      fs: { readFileSync: jest.fn(), writeFileSync: jest.fn() },
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['templates:add'](null, {
      name: 'Builder Template',
      subject: 'Hello',
      content: '<p>Hello</p>',
      blocks: JSON.stringify([{ type: 'hero' }])
    });

    expect(db.addTemplate).toHaveBeenCalledWith({
      name: 'Builder Template',
      subject: 'Hello',
      content: '<p>Hello</p>',
      category: 'general',
      blocks: [{ type: 'hero' }]
    });
    expect(result).toBe('template-1');
  });

  it('rejects malformed export payloads before writing files', async () => {
    const registry = createHandlerRegistry();
    const db = { getAllTemplates: jest.fn(), getAllContacts: jest.fn() };
    const fs = { readFileSync: jest.fn(), writeFileSync: jest.fn() };

    registerContentHandlers({
      safeHandler: registry.safeHandler,
      db,
      dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() },
      fs,
      path: require('path'),
      getMainWindow: () => null
    });

    const result = await registry.handlers['export:contacts'](null, { bad: true });

    expect(result).toEqual({ error: 'Invalid contacts export payload: expected an array' });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('registers consolidated automation, drip, form, and seed handlers and generates embed code with the tracking base URL', () => {
    const registry = createHandlerRegistry();
    const db = {
      getAllAutomations: jest.fn(() => []),
      getAutomation: jest.fn(() => null),
      addAutomation: jest.fn(),
      updateAutomation: jest.fn(),
      deleteAutomation: jest.fn(),
      getAutomationLogs: jest.fn(() => []),
      getAllDripSequences: jest.fn(() => []),
      getDripSequence: jest.fn(() => null),
      addDripSequence: jest.fn(),
      updateDripSequence: jest.fn(),
      deleteDripSequence: jest.fn(),
      getAllSignupForms: jest.fn(() => []),
      getSignupForm: jest.fn(() => ({
        id: 'form-1',
        fields: JSON.stringify([{ name: 'email', label: 'Email', type: 'email', required: true }]),
        successMessage: 'Thanks for joining!'
      })),
      addSignupForm: jest.fn(),
      updateSignupForm: jest.fn(),
      deleteSignupForm: jest.fn(),
      getFormSubmissions: jest.fn(() => []),
      getAllABTests: jest.fn(() => []),
      getABTest: jest.fn(() => null),
      addABTest: jest.fn(),
      updateABTest: jest.fn(),
      deleteABTest: jest.fn(),
      calculateABSignificance: jest.fn(() => ({ winner: '', confidence: 0 })),
      getAllSeedAccounts: jest.fn(() => []),
      getSeedAccount: jest.fn(() => null),
      addSeedAccount: jest.fn(),
      updateSeedAccount: jest.fn(),
      deleteSeedAccount: jest.fn(),
      getActiveSeedAccounts: jest.fn(() => [])
    };

    registerAutomationHandlers({
      safeHandler: registry.safeHandler,
      db,
      emailService: {},
      trackingService: { getTrackingBaseUrl: jest.fn(() => 'https://track.example.com') }
    });

    expect(registry.handlers['automation:getAll']).toBeDefined();
    expect(registry.handlers['drip:getAll']).toBeDefined();
    expect(registry.handlers['form:getAll']).toBeDefined();
    expect(registry.handlers['seed:getAll']).toBeDefined();

    const result = registry.handlers['form:getEmbedCode'](null, 'form-1');

    expect(result.embedCode).toContain('https://track.example.com/api/form/submit/form-1');
    expect(result.embedCode).toContain('Thanks for joining!');
  });
});
