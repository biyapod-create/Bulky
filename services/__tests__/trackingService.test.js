const TrackingService = require('../trackingService');

describe('TrackingService', () => {
  let trackingService;

  beforeEach(() => {
    trackingService = new TrackingService(null);
  });

  it('should update tracking base URL when setting a valid port', () => {
    trackingService.setTrackingPort(9999);
    expect(trackingService.getTrackingBaseUrl()).toBe('http://127.0.0.1:9999');
  });

  it('should ignore invalid port values', () => {
    trackingService.setTrackingPort(0);
    expect(trackingService.getTrackingBaseUrl()).toBe('http://127.0.0.1:3847');
  });

  it('should normalize custom tracking domains', () => {
    trackingService.setTrackingBaseUrl('track.example.com');
    expect(trackingService.getTrackingBaseUrl()).toBe('http://track.example.com');

    trackingService.setTrackingBaseUrl('https://track.example.com/links/');
    expect(trackingService.getTrackingBaseUrl()).toBe('https://track.example.com/links');
  });

  it('should create signed unsubscribe links', () => {
    trackingService.setHmacSecret('test-secret');
    const link = trackingService.createUnsubscribeLink('campaign-1', 'contact-1', 'test@example.com');

    expect(link).toContain('/unsubscribe/campaign-1/contact-1?');
    expect(link).toContain('email=test%40example.com');
    expect(link).toContain('token=');
  });

  it('should allow unsigned unsubscribe requests only for known campaign recipients', async () => {
    const db = {
      _get: jest.fn(() => ({ email: 'test@example.com' })),
      addUnsubscribe: jest.fn(),
      addToBlacklist: jest.fn()
    };

    trackingService = new TrackingService(db);
    trackingService.setHmacSecret('test-secret');

    const result = await trackingService.handleUnsubscribe('campaign-1', 'contact-1', 'test@example.com');

    expect(result).toEqual({ success: true });
    expect(db.addUnsubscribe).toHaveBeenCalledWith('test@example.com', 'campaign-1', 'User unsubscribed');
    expect(db.addToBlacklist).toHaveBeenCalledWith({
      email: 'test@example.com',
      reason: 'Unsubscribed',
      source: 'unsubscribe'
    });
  });

  it('should reject unsigned unsubscribe requests for unknown recipients', async () => {
    const db = {
      _get: jest.fn(() => null),
      addUnsubscribe: jest.fn(),
      addToBlacklist: jest.fn()
    };

    trackingService = new TrackingService(db);
    trackingService.setHmacSecret('test-secret');

    const result = await trackingService.handleUnsubscribe('campaign-1', 'contact-1', 'test@example.com');

    expect(result).toEqual({
      success: false,
      error: 'Unable to validate unsubscribe request'
    });
    expect(db.addUnsubscribe).not.toHaveBeenCalled();
  });
});

