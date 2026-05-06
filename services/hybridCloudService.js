const { createClient } = require('@supabase/supabase-js');
const { normalizePlanId } = require('./entitlementService');

function withTimeout(promiseFactory, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    Promise.resolve()
      .then(promiseFactory)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

class HybridCloudService {
  constructor(options = {}) {
    this.cloudConfigService = options.cloudConfigService;
    this.desktopAccountService = options.desktopAccountService;
    this.entitlementService = options.entitlementService;
    this.syncService = options.syncService;
    this.logger = options.logger;
    this.appVersion = options.appVersion || '';
    this.createSupabaseClient = options.createSupabaseClient || createClient;
  }

  _getConfig() {
    return this.cloudConfigService?.getInternalConfig?.() || {};
  }

  async _probeUrl(url, { method = 'GET', headers = {}, timeoutMs = 8000 } = {}) {
    if (!url) {
      return { ok: false, url: '', status: null, error: 'Not configured' };
    }

    try {
      const response = await withTimeout(() => fetch(url, {
        method,
        headers,
        redirect: 'follow'
      }), timeoutMs, `Timed out while requesting ${url}`);

      return {
        ok: response.ok,
        url,
        status: response.status,
        statusText: response.statusText
      };
    } catch (error) {
      return {
        ok: false,
        url,
        status: null,
        error: error.message
      };
    }
  }

  async _probeCandidates(candidates = [], options = {}) {
    for (const candidate of candidates.filter(Boolean)) {
      const result = await this._probeUrl(candidate, options);
      if (result.ok) {
        return result;
      }
      if (result.status && result.status < 500) {
        return result;
      }
    }

    return {
      ok: false,
      url: candidates.find(Boolean) || '',
      status: null,
      error: 'No reachable endpoint responded'
    };
  }

  async testSupabaseConnection() {
    const config = this._getConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      return {
        configured: false,
        ok: false,
        error: 'Account service URL and public client key are required'
      };
    }

    const authSettingsUrl = `${config.supabaseUrl}/auth/v1/settings`;
    const authProbe = await this._probeUrl(authSettingsUrl, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      }
    });

    const realtime = await this._testSupabaseRealtime(config);

    return {
      configured: true,
      ok: !!authProbe.ok && !!realtime.ok,
      projectUrl: config.supabaseUrl,
      auth: authProbe,
      realtime
    };
  }

  async _testSupabaseRealtime(config) {
    try {
      const client = this.createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            'X-Client-Info': `bulky-cloud-health/${this.appVersion || 'dev'}`
          }
        }
      });

      const channel = client.channel(`bulky-health-${Date.now()}`);

      return await withTimeout(() => new Promise((resolve) => {
        let settled = false;
        const finish = async (payload) => {
          if (settled) return;
          settled = true;
          try {
            await client.removeChannel(channel);
          } catch {}
          resolve(payload);
        };

        channel.subscribe(async (status, error) => {
          if (status === 'SUBSCRIBED') {
            await finish({ ok: true, status });
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            await finish({
              ok: false,
              status,
              error: error?.message || status
            });
          }
        });
      }), 10000, 'Timed out while connecting to Supabase realtime');
    } catch (error) {
      return {
        ok: false,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  async testCloudflareEndpoints() {
    const config = this._getConfig();
    const api = await this._probeCandidates([
      config.apiBaseUrl ? `${config.apiBaseUrl}/health` : '',
      config.apiBaseUrl
    ]);
    const tracking = await this._probeCandidates([
      config.trackingBaseUrl ? `${config.trackingBaseUrl}/health` : '',
      config.trackingBaseUrl
    ]);
    const updates = await this._probeCandidates([
      config.updatesBaseUrl ? `${config.updatesBaseUrl}/latest.yml` : '',
      config.updatesBaseUrl
    ], { method: 'HEAD' });

    return {
      configured: !!config.apiBaseUrl || !!config.trackingBaseUrl || !!config.updatesBaseUrl,
      ok: !!api.ok && !!tracking.ok && !!updates.ok,
      api,
      tracking,
      updates
    };
  }

  buildCheckoutUrl({ planId, email = '', workspaceName = '', source = 'desktop-settings' } = {}) {
    const config = this._getConfig();
    const normalizedPlanId = normalizePlanId(planId || '');
    if (!config.paystackCheckoutBaseUrl) {
      return { error: 'Hosted billing checkout is not configured yet.' };
    }

    if (!['pro', 'one_off'].includes(normalizedPlanId)) {
      return { error: 'Only Pro and One-off plans can be opened in hosted checkout.' };
    }

    const status = this.desktopAccountService?.getStatus?.() || {};
    const accountEmail = email || status?.account?.email || '';
    const workspace = workspaceName || status?.account?.workspaceName || '';
    const url = new URL(config.paystackCheckoutBaseUrl);
    url.searchParams.set('plan', normalizedPlanId);
    if (accountEmail) url.searchParams.set('email', accountEmail);
    if (workspace) url.searchParams.set('workspace', workspace);
    url.searchParams.set('source', source);
    url.searchParams.set('app', 'bulky-desktop');
    url.searchParams.set('version', this.appVersion || 'dev');

    return { url: url.toString(), planId: normalizedPlanId };
  }

  async testPaystackConfig() {
    const config = this._getConfig();
    if (!config.paystackPublicKey && !config.paystackCheckoutBaseUrl) {
      return {
        configured: false,
        ok: false,
        error: 'Billing public key and hosted checkout URL are not configured'
      };
    }

    const checkout = config.paystackCheckoutBaseUrl
      ? await this._probeCandidates([
          `${config.paystackCheckoutBaseUrl}/health`,
          config.paystackCheckoutBaseUrl
        ])
      : { ok: false, url: '', status: null, error: 'Checkout URL not configured' };

    return {
      configured: !!config.paystackPublicKey,
      ok: !!config.paystackPublicKey && (checkout.ok || !config.paystackCheckoutBaseUrl),
      hasPublicKey: !!config.paystackPublicKey,
      checkout
    };
  }

  async getDiagnostics() {
    const [supabase, cloudflare, paystack] = await Promise.all([
      this.testSupabaseConnection(),
      this.testCloudflareEndpoints(),
      this.testPaystackConfig()
    ]);

    return {
      generatedAt: new Date().toISOString(),
      account: this.desktopAccountService?.getStatus?.() || null,
      entitlement: this.entitlementService?.getState?.() || null,
      sync: this.syncService?.getStatus?.() || null,
      supabase,
      cloudflare,
      paystack
    };
  }
}

module.exports = HybridCloudService;
