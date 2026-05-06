const DesktopAccountService = require('../desktopAccountService');

function createDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getSetting: jest.fn((key) => store.get(key) ?? null),
    setSetting: jest.fn((key, value) => {
      store.set(key, value);
    })
  };
}

function createEntitlementService() {
  let state = {
    plan: {
      id: 'legacy',
      name: 'Local Build',
      description: 'Local-only desktop build'
    },
    mode: 'local',
    status: 'active'
  };

  return {
    getState: jest.fn(() => state),
    applyCloudState: jest.fn((payload) => {
      state = {
        ...state,
        plan: {
          id: payload.planId,
          name: payload.planId,
          description: 'Cloud-backed plan'
        },
        mode: payload.mode || 'hybrid',
        status: payload.status || 'active'
      };
    }),
    resetToLocalLegacy: jest.fn(() => {
      state = {
        plan: {
          id: 'legacy',
          name: 'Local Build',
          description: 'Local-only desktop build'
        },
        mode: 'local',
        status: 'active'
      };
    })
  };
}

function createAuthClient(overrides = {}) {
  const signUp = jest.fn(async () => ({
    data: {
      user: {
        id: 'user-2',
        email: 'new@example.com'
      },
      session: null
    },
    error: null
  }));
  const signInWithPassword = jest.fn(async () => ({
    data: {
      session: {
        expires_at: 1893456000,
        user: {
          id: 'user-1',
          email: 'owner@example.com',
          user_metadata: {
            full_name: 'Owner',
            workspace_name: 'Bulky HQ'
          },
          app_metadata: {
            bulky_plan: 'pro'
          },
          identities: [{ provider: 'email' }]
        }
      }
    },
    error: null
  }));
  const getSession = jest.fn(async () => ({ data: { session: null }, error: null }));
  const refreshSession = jest.fn(async () => ({ data: { session: null }, error: null }));
  const signOut = jest.fn(async () => ({ error: null }));
  const unsubscribe = jest.fn();

  return {
    auth: {
      signUp,
      signInWithPassword,
      getSession,
      refreshSession,
      signOut,
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: { unsubscribe }
        }
      })),
      ...overrides
    }
  };
}

describe('DesktopAccountService', () => {
  it('reports that desktop login needs configuration until Supabase values are saved', async () => {
    const db = createDb();
    const service = new DesktopAccountService({
      db,
      cloudConfigService: {
        getInternalConfig: () => ({})
      },
      entitlementService: createEntitlementService(),
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, '')
    });

    const status = await service.initialize();

    expect(status).toMatchObject({
      provider: 'supabase',
      configured: false,
      authenticated: false,
      status: 'needs_configuration'
    });
  });

  it('signs in with email/password and syncs the desktop profile into local entitlement state', async () => {
    const db = createDb();
    const entitlementService = createEntitlementService();
    const authClient = createAuthClient();
    const service = new DesktopAccountService({
      db,
      cloudConfigService: {
        getInternalConfig: () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabaseAnonKey: 'anon-key'
        })
      },
      entitlementService,
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, ''),
      createSupabaseClient: jest.fn(() => authClient)
    });

    const result = await service.signInWithPassword({
      email: 'owner@example.com',
      password: 'super-secret'
    });

    expect(authClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'super-secret'
    });
    expect(entitlementService.applyCloudState).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'pro',
      source: 'cloud-supabase',
      account: {
        email: 'owner@example.com',
        workspaceName: 'Bulky HQ'
      }
    }));
    expect(result.success).toBe(true);
    expect(result.status).toMatchObject({
      configured: true,
      authenticated: true,
      account: {
        email: 'owner@example.com',
        fullName: 'Owner',
        workspaceName: 'Bulky HQ'
      },
      plan: {
        id: 'pro'
      }
    });
  });

  it('signs out and returns the desktop app to the local legacy entitlement state', async () => {
    const db = createDb({
      desktopAccountState: JSON.stringify({
        provider: 'supabase',
        configured: true,
        authenticated: true,
        status: 'authenticated',
        account: {
          email: 'owner@example.com'
        },
        planId: 'pro'
      })
    });
    const entitlementService = createEntitlementService();
    entitlementService.applyCloudState({ planId: 'pro', mode: 'hybrid', status: 'active', account: { email: 'owner@example.com' } });
    const authClient = createAuthClient();
    const service = new DesktopAccountService({
      db,
      cloudConfigService: {
        getInternalConfig: () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabaseAnonKey: 'anon-key'
        })
      },
      entitlementService,
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, ''),
      createSupabaseClient: jest.fn(() => authClient)
    });

    const result = await service.signOut();

    expect(authClient.auth.signOut).toHaveBeenCalled();
    expect(entitlementService.resetToLocalLegacy).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      status: {
        authenticated: false,
        plan: {
          id: 'legacy'
        }
      }
    });
  });

  it('creates a desktop account and keeps the UI in pending confirmation mode until a session exists', async () => {
    const db = createDb();
    const entitlementService = createEntitlementService();
    const authClient = createAuthClient();
    const service = new DesktopAccountService({
      db,
      cloudConfigService: {
        getInternalConfig: () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabaseAnonKey: 'anon-key'
        })
      },
      entitlementService,
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, ''),
      createSupabaseClient: jest.fn(() => authClient)
    });

    const result = await service.signUpWithPassword({
      fullName: 'New Owner',
      workspaceName: 'Bulky Ops',
      email: 'new@example.com',
      password: 'super-secret'
    });

    expect(authClient.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'super-secret',
      options: {
        data: {
          full_name: 'New Owner',
          workspace_name: 'Bulky Ops',
          plan_id: 'freemium',
          bulky_plan: 'freemium'
        }
      }
    });
    expect(entitlementService.applyCloudState).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      pendingConfirmation: true,
      status: {
        configured: true,
        authenticated: false,
        status: 'pending_confirmation',
        account: {
          email: 'new@example.com',
          fullName: 'New Owner',
          workspaceName: 'Bulky Ops'
        }
      }
    });
  });
});
