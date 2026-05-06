const DesktopAccountService = require('../desktopAccountService');

function createDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const trackingEvents = [];
  const unsubscribes = new Set();
  return {
    getSetting: jest.fn((key) => store.get(key) ?? null),
    setSetting: jest.fn((key, value) => {
      store.set(key, value);
    }),
    _get: jest.fn((sql, params = []) => {
      if (sql.includes('FROM tracking_events WHERE cloudEventId = ?')) {
        const match = trackingEvents.find((event) => event.cloudEventId === params[0]);
        return match ? { id: match.id || 'event-1' } : null;
      }
      if (sql.includes('FROM tracking_events WHERE campaignId = ? AND contactId = ? AND type = ?')) {
        const match = trackingEvents.find((event) => event.campaignId === params[0] && event.contactId === params[1] && event.type === params[2]);
        return match ? { id: match.id || 'event-1' } : null;
      }
      if (sql.includes('FROM tracking_events WHERE campaignId = ? AND lower(email) = ? AND type = ?')) {
        const match = trackingEvents.find((event) => event.campaignId === params[0] && String(event.email || '').toLowerCase() === params[1] && event.type === params[2]);
        return match ? { id: match.id || 'event-1' } : null;
      }
      return null;
    }),
    addTrackingEvent: jest.fn((event) => {
      trackingEvents.push({
        id: event.id || `local-${trackingEvents.length + 1}`,
        ...event
      });
    }),
    isUnsubscribed: jest.fn((email) => unsubscribes.has(String(email || '').toLowerCase())),
    addUnsubscribe: jest.fn((email) => {
      unsubscribes.add(String(email || '').toLowerCase());
    }),
    addToBlacklist: jest.fn(),
    updateCampaignLogOpened: jest.fn(),
    updateCampaignLogClicked: jest.fn()
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
    hasCapability: jest.fn((capability) => !!state.capabilities?.[capability]),
    applyCloudState: jest.fn((payload) => {
      state = {
        ...state,
        plan: {
          id: payload.planId,
          name: payload.planId,
          description: 'Cloud-backed plan'
        },
        mode: payload.mode || 'hybrid',
        status: payload.status || 'active',
        capabilities: {
          ...(payload.capabilities || {})
        }
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
  const session = {
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
  };
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
      session
    },
    error: null
  }));
  const getSession = jest.fn(async () => ({ data: { session }, error: null }));
  const refreshSession = jest.fn(async () => ({ data: { session }, error: null }));
  const signOut = jest.fn(async () => ({ error: null }));
  const unsubscribe = jest.fn();
  const stopAutoRefresh = jest.fn();

  return {
    __unsubscribe: unsubscribe,
    __stopAutoRefresh: stopAutoRefresh,
    auth: {
      signUp,
      signInWithPassword,
      getSession,
      refreshSession,
      signOut,
      stopAutoRefresh,
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: { unsubscribe }
        }
      })),
      ...overrides
    }
  };
}

function createRemoteStateClient(remoteState = {}) {
  const authClient = createAuthClient();

  return {
    ...authClient,
    from: jest.fn((table) => {
      if (table === 'devices') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({
              data: remoteState.devices || [],
              error: null
            }))
          }))
        };
      }

      if (table === 'tracking_events') {
        const chain = {
          eq: jest.fn(() => chain),
          gt: jest.fn(() => chain),
          order: jest.fn(() => chain),
          limit: jest.fn(async () => ({
            data: remoteState.tracking_events || [],
            error: null
          }))
        };

        return {
          select: jest.fn(() => chain)
        };
      }

      const row = remoteState[table] || null;
      const chain = {
        eq: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(async () => ({
          data: row ? [row] : [],
          error: null
        }))
      };

      return {
        select: jest.fn(() => chain)
      };
    })
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

  it('maps JSON entitlement capabilities and limits from the live cloud schema', async () => {
    const db = createDb();
    const entitlementService = createEntitlementService();
    const authClient = createRemoteStateClient({
      profiles: {
        id: 'user-1',
        full_name: 'Owner',
        workspace_name: 'Bulky HQ'
      },
      entitlements: {
        user_id: 'user-1',
        plan_id: 'freemium',
        status: 'active',
        capabilities: {
          analytics: false,
          aiAssistant: false,
          desktopLogin: true,
          hostedTracking: false,
          hostedForms: false,
          realtimeSync: false,
          automaticUpdates: false,
          cloudAiUsage: false
        },
        limits: {
          maxSmtpAccounts: 2,
          maxEmailsPerCycle: 2000
        }
      },
      subscriptions: {
        user_id: 'user-1',
        provider: 'paystack',
        provider_customer_id: 'CUS_test',
        provider_subscription_id: 'SUB_test',
        plan_id: 'freemium',
        status: 'active'
      },
      tracking_workspaces: {
        user_id: 'user-1',
        signing_secret: 'workspace-secret-1'
      },
      devices: [
        { id: 'device-1', user_id: 'user-1' }
      ]
    });

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

    expect(entitlementService.applyCloudState).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'freemium',
      capabilities: expect.objectContaining({
        analytics: false,
        aiAssistant: false,
        desktopLogin: true
      }),
      limits: expect.objectContaining({
        maxSmtpAccounts: 2,
        maxEmailsPerCycle: 2000
      })
    }));
    expect(result.status).toMatchObject({
      subscription: {
        provider: 'paystack',
        reference: 'SUB_test',
        customerCode: 'CUS_test'
      },
      devices: {
        total: 1
      }
    });
    expect(service.getTrackingWorkspaceSecret()).toBe('workspace-secret-1');
  });

  it('pulls hosted tracking events back into the local desktop store for pro accounts', async () => {
    const db = createDb();
    const entitlementService = createEntitlementService();
    const authClient = createRemoteStateClient({
      profiles: {
        id: 'user-1',
        full_name: 'Owner',
        workspace_name: 'Bulky HQ'
      },
      entitlements: {
        user_id: 'user-1',
        plan_id: 'pro',
        status: 'active',
        capabilities: {
          analytics: true,
          aiAssistant: true,
          desktopLogin: true,
          hostedTracking: true,
          hostedForms: true,
          realtimeSync: true,
          automaticUpdates: true,
          cloudAiUsage: true
        },
        limits: {}
      },
      subscriptions: {
        user_id: 'user-1',
        provider: 'paystack',
        provider_subscription_id: 'SUB_live',
        plan_id: 'pro',
        status: 'active'
      },
      devices: [],
      tracking_events: [
        {
          id: 'cloud-open-1',
          workspace_user_id: 'user-1',
          campaign_external_id: 'campaign-1',
          contact_external_id: 'contact-1',
          tracking_id: 'track-1',
          recipient_email: 'owner@example.com',
          event_type: 'open',
          user_agent: 'Mozilla/5.0',
          event_data: {
            client: 'Chrome',
            device: 'Desktop',
            os: 'Windows',
            isBot: false
          },
          country: 'NG',
          region: 'LA',
          created_at: '2026-05-06T10:00:00.000Z'
        },
        {
          id: 'cloud-unsub-1',
          workspace_user_id: 'user-1',
          campaign_external_id: 'campaign-1',
          contact_external_id: 'contact-1',
          tracking_id: 'track-1',
          recipient_email: 'owner@example.com',
          event_type: 'unsubscribe',
          event_data: {},
          created_at: '2026-05-06T10:05:00.000Z'
        }
      ]
    });

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

    await service.signInWithPassword({
      email: 'owner@example.com',
      password: 'super-secret'
    });

    const result = await service.syncCloudTrackingEvents();

    expect(result).toMatchObject({
      enabled: true,
      applied: 2,
      imported: {
        open: 1,
        click: 0,
        unsubscribe: 1
      }
    });
    expect(db.addTrackingEvent).toHaveBeenCalledTimes(2);
    expect(db.updateCampaignLogOpened).toHaveBeenCalledWith('campaign-1', 'track-1');
    expect(db.addUnsubscribe).toHaveBeenCalledWith('owner@example.com', 'campaign-1', 'Cloud unsubscribe');
    expect(db.addToBlacklist).toHaveBeenCalledWith(expect.objectContaining({
      email: 'owner@example.com',
      source: 'cloud_tracking'
    }));
  });

  it('stops Supabase auto refresh and unsubscribes auth listeners during dispose', async () => {
    const db = createDb();
    const authClient = createAuthClient();
    const service = new DesktopAccountService({
      db,
      cloudConfigService: {
        getInternalConfig: () => ({
          supabaseUrl: 'https://project.supabase.co',
          supabaseAnonKey: 'anon-key'
        })
      },
      entitlementService: createEntitlementService(),
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, ''),
      createSupabaseClient: jest.fn(() => authClient)
    });

    await service.getSupabaseClient();
    service.dispose();

    expect(authClient.__stopAutoRefresh).toHaveBeenCalled();
    expect(authClient.__unsubscribe).toHaveBeenCalled();
  });
});
