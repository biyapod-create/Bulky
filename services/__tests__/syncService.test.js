const SyncService = require('../syncService');

describe('SyncService', () => {
  it('stays disabled when the desktop account is signed out', async () => {
    const service = new SyncService({
      desktopAccountService: {
        getStatus: () => ({
          configured: true,
          authenticated: false
        })
      },
      entitlementService: {
        getState: () => ({ plan: { id: 'freemium' } }),
        hasCapability: () => false
      }
    });

    const result = await service.refresh();

    expect(result).toMatchObject({
      available: true,
      enabled: false,
      connected: false,
      reason: 'signed_out'
    });
  });

  it('connects realtime sync for entitled authenticated accounts', async () => {
    const channel = {
      on: jest.fn(() => channel),
      subscribe: jest.fn((callback) => {
        callback('SUBSCRIBED');
        return channel;
      })
    };
    const client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => true)
    };
    const refreshRemoteState = jest.fn(async () => ({
      authenticated: true,
      account: { id: 'user-1' }
    }));

    const service = new SyncService({
      desktopAccountService: {
        getStatus: () => ({
          configured: true,
          authenticated: true,
          account: { id: 'user-1' }
        }),
        getSupabaseClient: jest.fn(async () => client),
        getCurrentSession: jest.fn(async () => ({
          user: { id: 'user-1' }
        })),
        refreshRemoteState
      },
      entitlementService: {
        getState: () => ({ plan: { id: 'pro' } }),
        hasCapability: () => true
      }
    });

    const result = await service.refresh();

    expect(client.channel).toHaveBeenCalledWith('bulky-sync-user-1');
    expect(refreshRemoteState).toHaveBeenCalled();
    expect(result).toMatchObject({
      available: true,
      enabled: true,
      connected: true,
      state: 'connected',
      reason: 'active',
      accountId: 'user-1',
      planId: 'pro'
    });
  });
});
