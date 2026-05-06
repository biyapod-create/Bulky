function safeParseJson(rawValue) {
  if (!rawValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value, { defaultProtocol = 'https://' } = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${defaultProtocol}${trimmed}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

function decodeStoredSecret(value, decryptValue) {
  if (!value) {
    return '';
  }
  try {
    return typeof decryptValue === 'function' ? decryptValue(value) : value;
  } catch {
    return '';
  }
}

class CloudConfigService {
  constructor(db, options = {}) {
    this.db = db;
    this.settingKey = options.settingKey || 'cloudConfig';
    this.encryptValue = options.encryptValue;
    this.decryptValue = options.decryptValue;
    this.env = options.env || process.env;
  }

  _readStoredConfig() {
    return safeParseJson(this.db?.getSetting?.(this.settingKey));
  }

  _getDefaultConfig() {
    return {
      apiBaseUrl: normalizeBaseUrl(this.env.BULKY_API_BASE_URL || ''),
      trackingBaseUrl: normalizeBaseUrl(this.env.BULKY_TRACKING_PUBLIC_URL || ''),
      updatesBaseUrl: normalizeBaseUrl(this.env.BULKY_UPDATES_BASE_URL || ''),
      supabaseUrl: normalizeBaseUrl(this.env.BULKY_SUPABASE_URL || ''),
      supabaseAnonKey: this.env.BULKY_SUPABASE_ANON_KEY || '',
      paystackPublicKey: this.env.BULKY_PAYSTACK_PUBLIC_KEY || '',
      paystackCheckoutBaseUrl: normalizeBaseUrl(this.env.BULKY_PAYSTACK_CHECKOUT_BASE_URL || '')
    };
  }

  getInternalConfig() {
    const defaults = this._getDefaultConfig();
    const stored = this._readStoredConfig();

    return {
      apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl || defaults.apiBaseUrl || ''),
      trackingBaseUrl: normalizeBaseUrl(stored.trackingBaseUrl || defaults.trackingBaseUrl || ''),
      updatesBaseUrl: normalizeBaseUrl(stored.updatesBaseUrl || defaults.updatesBaseUrl || ''),
      supabaseUrl: normalizeBaseUrl(stored.supabaseUrl || defaults.supabaseUrl || ''),
      supabaseAnonKey: decodeStoredSecret(stored.supabaseAnonKey, this.decryptValue) || defaults.supabaseAnonKey || '',
      paystackPublicKey: decodeStoredSecret(stored.paystackPublicKey, this.decryptValue) || defaults.paystackPublicKey || '',
      paystackCheckoutBaseUrl: normalizeBaseUrl(stored.paystackCheckoutBaseUrl || defaults.paystackCheckoutBaseUrl || '')
    };
  }

  getRendererConfig() {
    const config = this.getInternalConfig();
    return {
      apiBaseUrl: config.apiBaseUrl,
      trackingBaseUrl: config.trackingBaseUrl,
      updatesBaseUrl: config.updatesBaseUrl,
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: '',
      hasSupabaseAnonKey: !!config.supabaseAnonKey,
      clearSupabaseAnonKey: false,
      paystackPublicKey: '',
      hasPaystackPublicKey: !!config.paystackPublicKey,
      clearPaystackPublicKey: false,
      paystackCheckoutBaseUrl: config.paystackCheckoutBaseUrl
    };
  }

  getStatus() {
    const config = this.getInternalConfig();
    const apiConfigured = !!config.apiBaseUrl;
    const trackingConfigured = !!config.trackingBaseUrl;
    const updatesConfigured = !!config.updatesBaseUrl;
    const supabaseConfigured = !!config.supabaseUrl && !!config.supabaseAnonKey;
    const paystackConfigured = !!config.paystackPublicKey;

    return {
      apiBaseUrl: config.apiBaseUrl,
      trackingBaseUrl: config.trackingBaseUrl,
      updatesBaseUrl: config.updatesBaseUrl,
      cloudflare: {
        apiConfigured,
        trackingConfigured,
        updatesConfigured
      },
      supabase: {
        configured: supabaseConfigured,
        url: config.supabaseUrl,
        hasAnonKey: !!config.supabaseAnonKey
      },
      paystack: {
        configured: paystackConfigured,
        hasPublicKey: !!config.paystackPublicKey,
        checkoutBaseUrl: config.paystackCheckoutBaseUrl
      },
      hybridReady: apiConfigured && trackingConfigured && updatesConfigured && supabaseConfigured && paystackConfigured
    };
  }

  saveFromRenderer(nextConfig = {}) {
    const stored = this._readStoredConfig();
    const internal = this.getInternalConfig();
    const resolvedSupabaseAnonKey = nextConfig.clearSupabaseAnonKey
      ? ''
      : (nextConfig.supabaseAnonKey || internal.supabaseAnonKey || '');
    const resolvedPaystackPublicKey = nextConfig.clearPaystackPublicKey
      ? ''
      : (nextConfig.paystackPublicKey || internal.paystackPublicKey || '');

    const toStore = {
      apiBaseUrl: normalizeBaseUrl(nextConfig.apiBaseUrl || ''),
      trackingBaseUrl: normalizeBaseUrl(nextConfig.trackingBaseUrl || ''),
      updatesBaseUrl: normalizeBaseUrl(nextConfig.updatesBaseUrl || ''),
      supabaseUrl: normalizeBaseUrl(nextConfig.supabaseUrl || ''),
      paystackCheckoutBaseUrl: normalizeBaseUrl(nextConfig.paystackCheckoutBaseUrl || ''),
      ...(stored || {})
    };

    if (resolvedSupabaseAnonKey) {
      toStore.supabaseAnonKey = typeof this.encryptValue === 'function'
        ? this.encryptValue(resolvedSupabaseAnonKey)
        : resolvedSupabaseAnonKey;
    } else {
      delete toStore.supabaseAnonKey;
    }

    if (resolvedPaystackPublicKey) {
      toStore.paystackPublicKey = typeof this.encryptValue === 'function'
        ? this.encryptValue(resolvedPaystackPublicKey)
        : resolvedPaystackPublicKey;
    } else {
      delete toStore.paystackPublicKey;
    }

    this.db?.setSetting?.(this.settingKey, JSON.stringify(toStore));
    return this.getRendererConfig();
  }
}

module.exports = CloudConfigService;
