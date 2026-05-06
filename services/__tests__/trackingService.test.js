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

  it('should treat private tracking hosts as non-public surfaces', () => {
    expect(trackingService.isPrivateTrackingBaseUrl('http://127.0.0.1:3847')).toBe(true);
    expect(trackingService.isPrivateTrackingBaseUrl('http://192.168.1.15:3847')).toBe(true);
    expect(trackingService.isPrivateTrackingBaseUrl('https://track.example.com')).toBe(false);
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

  it('should normalize unsubscribe emails before validation and persistence', async () => {
    const db = {
      _get: jest.fn(() => ({ email: 'test@example.com' })),
      addUnsubscribe: jest.fn(),
      addToBlacklist: jest.fn()
    };

    trackingService = new TrackingService(db);
    trackingService.setHmacSecret('test-secret');

    const result = await trackingService.handleUnsubscribe(
      'campaign-1',
      'contact-1',
      '  TEST@example.com  ',
      '  Please stop  '
    );

    expect(result).toEqual({ success: true });
    expect(db.addUnsubscribe).toHaveBeenCalledWith('test@example.com', 'campaign-1', 'Please stop');
    expect(db.addToBlacklist).toHaveBeenCalledWith({
      email: 'test@example.com',
      reason: 'Unsubscribed',
      source: 'unsubscribe'
    });
  });

  it('should store bot opens without counting them as human opens', async () => {
    const db = {
      getCampaignLogByTracking: jest.fn(() => ({ email: 'test@example.com' })),
      _get: jest.fn(() => null),
      addTrackingEvent: jest.fn(),
      updateCampaignLogOpened: jest.fn()
    };

    trackingService = new TrackingService(db);

    const result = await trackingService.recordOpen('campaign-1', 'contact-1', 'tracking-1', {
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      headers: {}
    });

    expect(result).toMatchObject({
      success: true,
      isBot: true,
      counted: false
    });
    expect(db.addTrackingEvent).toHaveBeenCalled();
    expect(db.updateCampaignLogOpened).not.toHaveBeenCalled();
  });

  it('should fall back to email uniqueness when recipientId is missing', async () => {
    const db = {
      getCampaignLogByTracking: jest.fn(() => ({ email: 'test@example.com' })),
      _get: jest.fn()
        .mockReturnValueOnce({ id: 'existing-open' })
        .mockReturnValueOnce({ id: 'existing-click' }),
      addTrackingEvent: jest.fn(),
      updateCampaignLogOpened: jest.fn(),
      updateCampaignLogClicked: jest.fn()
    };

    trackingService = new TrackingService(db);

    const openResult = await trackingService.recordOpen('campaign-1', '', 'tracking-1', {
      userAgent: 'Mozilla/5.0',
      headers: {}
    });
    const clickResult = await trackingService.recordClick('campaign-1', '', 'tracking-1', 'https://example.com', {
      userAgent: 'Mozilla/5.0',
      headers: {}
    });

    expect(openResult).toMatchObject({ success: true, isUnique: false, counted: false });
    expect(clickResult).toMatchObject({ success: true, isUnique: false, counted: false });
    expect(db.addTrackingEvent).toHaveBeenCalledTimes(2);
    expect(db.updateCampaignLogOpened).not.toHaveBeenCalled();
    expect(db.updateCampaignLogClicked).not.toHaveBeenCalled();
  });

  it('should reject non-http redirects and exclude bot events from campaign stats and engagement scoring', () => {
    const db = {
      getCampaignLogByTracking: jest.fn(() => ({ email: 'test@example.com' })),
      _get: jest.fn(() => null),
      addTrackingEvent: jest.fn(),
      updateCampaignLogClicked: jest.fn(),
      getTrackingEvents: jest.fn(() => ([
        { contactId: 'contact-1', type: 'open', link: '', device: 'Desktop', client: 'Chrome', os: 'Windows', country: 'US', isBot: 0, createdAt: '2026-04-20T10:00:00.000Z' },
        { contactId: 'contact-1', type: 'click', link: 'https://example.com', device: 'Desktop', client: 'Chrome', os: 'Windows', country: 'US', isBot: 0, createdAt: '2026-04-20T10:05:00.000Z' },
        { contactId: 'contact-1', type: 'open', link: '', device: 'Desktop', client: 'Bot', os: 'Linux', country: 'US', isBot: 1, createdAt: '2026-04-20T10:10:00.000Z' },
        { contactId: 'contact-1', type: 'click', link: 'https://example.com', device: 'Desktop', client: 'Bot', os: 'Linux', country: 'US', isBot: 1, createdAt: '2026-04-20T10:15:00.000Z' }
      ]))
    };

    trackingService = new TrackingService(db);

    return trackingService.recordClick('campaign-1', 'contact-1', 'tracking-1', 'javascript:alert(1)', {
      userAgent: 'Mozilla/5.0',
      headers: {}
    }).then((result) => {
      expect(result.redirectUrl).toBe('');
      expect(db.addTrackingEvent).toHaveBeenCalledWith(expect.objectContaining({
        link: ''
      }));

      const stats = trackingService.getCampaignTrackingStats('campaign-1');
      expect(stats.totalOpens).toBe(1);
      expect(stats.totalClicks).toBe(1);
      expect(stats.botOpenEvents).toBe(1);
      expect(stats.botClickEvents).toBe(1);

      const score = trackingService.calculateEngagementScore('campaign-1', 'contact-1');
      expect(score.totalOpens).toBe(1);
      expect(score.totalClicks).toBe(1);
      expect(score.score).toBeGreaterThan(0);
    });
  });
});

