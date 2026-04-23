const registerBackupHandlers = require('../registerBackupHandlers');
const registerCampaignHandlers = require('../registerCampaignHandlers');
const registerContactsHandlers = require('../registerContactsHandlers');
const registerContentHandlers = require('../registerContentHandlers');
const registerDataHandlers = require('../registerDataHandlers');
const registerMessagingHandlers = require('../registerMessagingHandlers');
const registerOperationsHandlers = require('../registerOperationsHandlers');
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
      { skipSmtpCheck: true }
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

    await registry.handlers['verify:email'](null, { email: '  test@example.com  ', smtpCheck: true });

    expect(verifyEmail).toHaveBeenCalledWith('test@example.com', { skipSmtpCheck: false });
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
});
