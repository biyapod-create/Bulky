const { registerAllHandlers, registerWindowHandlers, validateContact } = require('../handlerRegistry');

describe('main-process handler registry', () => {
  it('registers and executes the window control handlers against the active window', async () => {
    const handlers = {};
    const cleanup = jest.fn();
    const mainWindow = {
      minimize: jest.fn(),
      isMaximized: jest.fn(() => false),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      close: jest.fn(),
      hide: jest.fn(),
      show: jest.fn(),
      focus: jest.fn()
    };
    const app = {
      isQuitting: false,
      quit: jest.fn()
    };

    registerWindowHandlers({
      safeHandler: (channel, handler) => {
        handlers[channel] = handler;
      },
      app,
      appVersion: '6.1.0',
      cleanup,
      getMainWindow: () => mainWindow
    });

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'app:getVersion',
      'window:minimize',
      'window:maximize',
      'window:close',
      'window:hide',
      'window:show',
      'window:quit'
    ]));

    expect(await handlers['app:getVersion']()).toBe('6.1.0');

    await handlers['window:minimize']();
    expect(mainWindow.minimize).toHaveBeenCalled();

    await handlers['window:maximize']();
    expect(mainWindow.maximize).toHaveBeenCalled();

    mainWindow.isMaximized.mockReturnValue(true);
    await handlers['window:maximize']();
    expect(mainWindow.unmaximize).toHaveBeenCalled();

    await handlers['window:hide']();
    expect(mainWindow.hide).toHaveBeenCalled();

    await handlers['window:show']();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(mainWindow.focus).toHaveBeenCalled();

    await handlers['window:close']();
    expect(mainWindow.close).toHaveBeenCalled();

    await handlers['window:quit']();
    expect(app.isQuitting).toBe(true);
    expect(cleanup).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
  });

  it('keeps the legacy contact validator behavior for handler modules', () => {
    expect(validateContact({ email: 'ok@example.com', firstName: 'Ok' })).toEqual({ valid: true });
    expect(validateContact({ email: 'bad-email' })).toEqual({
      valid: false,
      error: 'Invalid email address'
    });
  });

  it('registers grouped handler modules without missing service dependencies', () => {
    const handlers = {};
    expect(() => registerAllHandlers({
      safeHandler: (channel, handler) => {
        handlers[channel] = handler;
      },
      rateLimitedHandler: (channel, handler) => {
        handlers[channel] = handler;
      },
      app: {
        isQuitting: false,
        quit: jest.fn()
      },
      appVersion: '6.1.0',
      cleanup: jest.fn(),
      db: {},
      dialog: {},
      fs: {},
      shell: { openExternal: jest.fn() },
      path: require('path'),
      emailService: {},
      verificationService: {},
      decryptSmtpAccount: jest.fn(),
      encryptPassword: jest.fn((value) => value),
      entitlementService: {
        getState: jest.fn(() => ({
          plan: { id: 'freemium', name: 'Freemium', description: '' },
          mode: 'local',
          status: 'active'
        })),
        hasCapability: jest.fn(() => false)
      },
      cloudConfigService: {
        getRendererConfig: jest.fn(() => ({})),
        getStatus: jest.fn(() => ({}))
      },
      desktopAccountService: {
        getStatus: jest.fn(() => ({
          configured: false,
          authenticated: false,
          account: {}
        }))
      },
      hybridCloudService: {
        getDiagnostics: jest.fn(async () => ({})),
        buildCheckoutUrl: jest.fn(() => ({ url: 'https://example.com', planId: 'pro' }))
      },
      syncService: {
        getStatus: jest.fn(() => ({
          available: false,
          enabled: false,
          connected: false
        })),
        manualSync: jest.fn(async () => ({}))
      },
      validateRequired: jest.fn(),
      getPrimarySmtpAccount: jest.fn(),
      scheduledCampaignTimers: new Map(),
      scheduleNextCampaign: jest.fn(),
      logger: {},
      getMainWindow: jest.fn(() => null),
      spamService: {},
      aiService: {},
      domainHealthService: {},
      decryptPassword: jest.fn((value) => value),
      syncTrackingBaseUrl: jest.fn(),
      getConfiguredDkimSelectors: jest.fn(() => []),
      trackingService: {},
      dbPath: 'C:/temp/bulky.db',
      userDataPath: 'C:/temp',
      getTrackingBaseUrl: jest.fn(() => 'http://127.0.0.1:3847'),
      getTrackingHealth: jest.fn(() => ({ listening: true })),
      logDir: 'C:/temp/logs'
    })).not.toThrow();

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'account:getStatus',
      'cloud:getStatus',
      'cloud:testConnections'
    ]));
  });
});
