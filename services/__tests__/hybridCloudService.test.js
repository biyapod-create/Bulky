const HybridCloudService = require('../hybridCloudService');

describe('HybridCloudService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('builds a hosted checkout URL for supported paid plans', () => {
    const service = new HybridCloudService({
      cloudConfigService: {
        getInternalConfig: () => ({
          paystackCheckoutBaseUrl: 'https://checkout.bulkyapp.com/start'
        })
      },
      desktopAccountService: {
        getStatus: () => ({
          account: {
            email: 'owner@example.com',
            workspaceName: 'Bulky'
          }
        })
      },
      appVersion: '6.1.0'
    });

    const result = service.buildCheckoutUrl({ planId: 'pro' });

    expect(result.planId).toBe('pro');
    expect(result.url).toContain('https://checkout.bulkyapp.com/start?');
    expect(result.url).toContain('plan=pro');
    expect(result.url).toContain('email=owner%40example.com');
    expect(result.url).toContain('workspace=Bulky');
  });

  it('tests Supabase auth and realtime connectivity', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK'
    }));

    const channel = {
      subscribe: jest.fn((callback) => {
        callback('SUBSCRIBED');
        return channel;
      })
    };
    const client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => true)
    };

    const service = new HybridCloudService({
      cloudConfigService: {
        getInternalConfig: () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabaseAnonKey: 'anon-key'
        })
      },
      createSupabaseClient: jest.fn(() => client),
      appVersion: '6.1.0'
    });

    const result = await service.testSupabaseConnection();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/settings',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer anon-key'
        })
      })
    );
    expect(result.ok).toBe(true);
    expect(result.auth.ok).toBe(true);
    expect(result.realtime.ok).toBe(true);
  });
});
