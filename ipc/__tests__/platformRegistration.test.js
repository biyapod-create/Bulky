const registerAutomationHandlers = require('../registerAutomationHandlers');
const registerSupportHandlers = require('../registerSupportHandlers');

function createRegistry() {
  const handlers = {};
  return {
    handlers,
    safeHandler: (channel, handler) => {
      handlers[channel] = handler;
    }
  };
}

describe('platform handler registration', () => {
  it('registers the active AI, spam, and tracking namespaces in support handlers', () => {
    const registry = createRegistry();

    registerSupportHandlers({
      safeHandler: registry.safeHandler,
      db: {
        getSetting: jest.fn(),
        getAllAIMemories: jest.fn(() => []),
        getUnverifiedContacts: jest.fn(() => []),
        getDeliverabilitySnapshot: jest.fn(() => ({}))
      },
      spamService: {
        analyzeContent: jest.fn(),
        autoFix: jest.fn(),
        getSuggestions: jest.fn()
      },
      aiService: {
        setApiKey: jest.fn(),
        setModel: jest.fn(),
        setProvider: jest.fn(),
        setLmstudioBaseUrl: jest.fn()
      },
      verificationService: {
        verifyEmail: jest.fn(),
        verifyBulk: jest.fn()
      },
      domainHealthService: {
        checkDomain: jest.fn()
      },
      decryptPassword: (value) => value,
      encryptPassword: (value) => value
    });

    expect(registry.handlers['spam:check']).toBeDefined();
    expect(registry.handlers['spam:autoFix']).toBeDefined();
    expect(registry.handlers['tracking:addEvent']).toBeDefined();
    expect(registry.handlers['tracking:getEvents']).toBeDefined();
    expect(registry.handlers['ai:getSettings']).toBeDefined();
    expect(registry.handlers['ai:saveSettings']).toBeDefined();
    expect(registry.handlers['ai:getCapabilities']).toBeDefined();
    expect(registry.handlers['ai:getAppContext']).toBeDefined();
    expect(registry.handlers['ai:chat']).toBeDefined();
    expect(registry.handlers['ai:executeAction']).toBeDefined();
  });

  it('registers the automation, drip, form, abtest, and seed namespaces together', () => {
    const registry = createRegistry();

    registerAutomationHandlers({
      safeHandler: registry.safeHandler,
      db: {
        getAllAutomations: jest.fn(() => []),
        getAutomation: jest.fn(),
        addAutomation: jest.fn(),
        updateAutomation: jest.fn(),
        deleteAutomation: jest.fn(),
        getAutomationLogs: jest.fn(() => []),
        getAllDripSequences: jest.fn(() => []),
        getDripSequence: jest.fn(),
        addDripSequence: jest.fn(),
        updateDripSequence: jest.fn(),
        deleteDripSequence: jest.fn(),
        getAllSignupForms: jest.fn(() => []),
        getSignupForm: jest.fn(),
        addSignupForm: jest.fn(),
        updateSignupForm: jest.fn(),
        deleteSignupForm: jest.fn(),
        getFormSubmissions: jest.fn(() => []),
        getAllABTests: jest.fn(() => []),
        getABTest: jest.fn(),
        addABTest: jest.fn(),
        updateABTest: jest.fn(),
        deleteABTest: jest.fn(),
        calculateABSignificance: jest.fn(() => ({})),
        getAllSeedAccounts: jest.fn(() => []),
        getSeedAccount: jest.fn(),
        addSeedAccount: jest.fn(),
        updateSeedAccount: jest.fn(),
        deleteSeedAccount: jest.fn(),
        getActiveSeedAccounts: jest.fn(() => [])
      },
      emailService: {},
      trackingService: { getTrackingBaseUrl: jest.fn(() => 'http://127.0.0.1:3847') }
    });

    expect(registry.handlers['automation:getAll']).toBeDefined();
    expect(registry.handlers['drip:getAll']).toBeDefined();
    expect(registry.handlers['form:getAll']).toBeDefined();
    expect(registry.handlers['abtest:getAll']).toBeDefined();
    expect(registry.handlers['seed:getAll']).toBeDefined();
    expect(registry.handlers['automation:processTrigger']).toBeDefined();
  });
});
