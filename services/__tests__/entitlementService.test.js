const { EntitlementService } = require('../entitlementService');

function createDb(overrides = {}) {
  return {
    getSetting: jest.fn(() => null),
    _get: jest.fn(() => ({ count: 0 })),
    getAllSmtpAccounts: jest.fn(() => []),
    getContactStats: jest.fn(() => ({ total: 0 })),
    ...overrides
  };
}

describe('EntitlementService', () => {
  it('returns a legacy local state by default without stored entitlement data', () => {
    const db = createDb();
    const service = new EntitlementService(db, { appVersion: '6.1.0' });

    const state = service.getState();

    expect(state.plan).toEqual(expect.objectContaining({
      id: 'legacy',
      name: 'Local Build'
    }));
    expect(state.capabilities.aiAssistant).toBe(true);
    expect(state.capabilities.hostedTracking).toBe(false);
    expect(state.limits.maxSmtpAccounts).toBeNull();
  });

  it('normalizes a freemium state and computes lifetime usage from the local database', () => {
    const db = createDb({
      getSetting: jest.fn(() => JSON.stringify({
        planId: 'freemium',
        status: 'active',
        cycle: {
          startsAt: '2026-05-01T00:00:00.000Z',
          endsAt: '2026-05-31T23:59:59.999Z'
        }
      })),
      _get: jest
        .fn()
        .mockReturnValueOnce({ count: 3200 })
        .mockReturnValueOnce({ count: 1200 }),
      getAllSmtpAccounts: jest.fn(() => [{ id: 'smtp-1', isActive: 1 }, { id: 'smtp-2', isActive: 0 }]),
      getContactStats: jest.fn(() => ({ total: 42 }))
    });
    const service = new EntitlementService(db, { appVersion: '6.1.0' });

    const state = service.getState();

    expect(state.plan.id).toBe('freemium');
    expect(state.limits.maxSmtpAccounts).toBe(2);
    expect(state.limits.maxEmailsPerCycle).toBe(2000);
    expect(state.capabilities.aiAssistant).toBe(false);
    expect(state.usage).toEqual(expect.objectContaining({
      emailsSentLifetime: 3200,
      emailsSentInCycle: 1200,
      emailsRemainingInCycle: 800,
      smtpAccountsConfigured: 2,
      activeSmtpAccounts: 1,
      contacts: 42
    }));
  });

  it('blocks SMTP account creation when the current plan limit is reached', () => {
    const db = createDb({
      getSetting: jest.fn(() => JSON.stringify({
        planId: 'freemium',
        status: 'active'
      }))
    });
    const service = new EntitlementService(db, { appVersion: '6.1.0' });

    expect(service.canAddSmtpAccount(1)).toEqual({ allowed: true });
    expect(service.canAddSmtpAccount(2)).toEqual(expect.objectContaining({
      allowed: false,
      code: 'smtp_account_limit_reached',
      maxSmtpAccounts: 2
    }));
  });

  it('returns structured capability lock metadata for unavailable features', () => {
    const db = createDb({
      getSetting: jest.fn(() => JSON.stringify({ planId: 'freemium' }))
    });
    const service = new EntitlementService(db, { appVersion: '6.1.0' });

    expect(service.requireCapability('aiAssistant')).toEqual(expect.objectContaining({
      code: 'capability_locked',
      capability: 'aiAssistant',
      currentPlan: 'freemium'
    }));
  });
});
