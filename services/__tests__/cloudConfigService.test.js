const CloudConfigService = require('../cloudConfigService');

function createDb(rawConfig = null) {
  let stored = rawConfig;
  return {
    getSetting: jest.fn(() => stored),
    setSetting: jest.fn((key, value) => {
      stored = value;
    })
  };
}

describe('CloudConfigService', () => {
  it('returns sanitized renderer config without leaking stored keys', () => {
    const db = createDb(JSON.stringify({
      apiBaseUrl: 'https://api.bulkyapp.com',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'enc:anon',
      paystackPublicKey: 'enc:paystack'
    }));
    const service = new CloudConfigService(db, {
      decryptValue: (value) => value === 'enc:anon' ? 'anon-key' : 'pk_live_123'
    });

    expect(service.getRendererConfig()).toEqual(expect.objectContaining({
      apiBaseUrl: 'https://api.bulkyapp.com',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: '',
      hasSupabaseAnonKey: true,
      paystackPublicKey: '',
      hasPaystackPublicKey: true
    }));
  });

  it('preserves saved keys when the renderer leaves masked values blank', () => {
    const db = createDb(JSON.stringify({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'enc:anon',
      paystackPublicKey: 'enc:paystack'
    }));
    const service = new CloudConfigService(db, {
      encryptValue: (value) => `enc:${value}`,
      decryptValue: (value) => value.replace(/^enc:/, '')
    });

    const saved = service.saveFromRenderer({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: '',
      clearSupabaseAnonKey: false,
      paystackPublicKey: '',
      clearPaystackPublicKey: false
    });

    expect(db.setSetting).toHaveBeenCalled();
    expect(saved.hasSupabaseAnonKey).toBe(true);
    expect(saved.hasPaystackPublicKey).toBe(true);
  });

  it('reports hybrid readiness only when all provider surfaces are configured', () => {
    const db = createDb(JSON.stringify({
      apiBaseUrl: 'https://api.bulkyapp.com',
      trackingBaseUrl: 'https://track.bulkyapp.com',
      updatesBaseUrl: 'https://updates.bulkyapp.com',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'enc:anon',
      paystackPublicKey: 'enc:paystack'
    }));
    const service = new CloudConfigService(db, {
      decryptValue: (value) => value.replace(/^enc:/, '')
    });

    expect(service.getStatus()).toEqual(expect.objectContaining({
      hybridReady: true
    }));
  });
});
