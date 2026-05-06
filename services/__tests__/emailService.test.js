const EmailService = require('../emailService');

describe('EmailService', () => {
  let emailService;

  beforeEach(() => {
    jest.useFakeTimers();
    emailService = new EmailService(null, 'test-secret');
  });

  afterEach(() => {
    emailService?.dispose();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should generate valid HMAC tokens', () => {
    const token = emailService.generateUnsubscribeToken('test@example.com', 'campaign-1');
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('should verify valid tokens', () => {
    const token = emailService.generateUnsubscribeToken('test@example.com', 'campaign-1');
    const valid = emailService.verifyUnsubscribeToken('test@example.com', 'campaign-1', token);
    expect(valid).toBe(true);
  });

  it('should reject invalid tokens', () => {
    const valid = emailService.verifyUnsubscribeToken('test@example.com', 'campaign-1', 'a'.repeat(64));
    expect(valid).toBe(false);
  });

  it('should personalize content with fallbacks', () => {
    const contact = { email: 'test@example.com', firstName: '' };
    const result = emailService.personalizeContent('Hello {{firstName | "Friend"}}', contact);
    expect(result).toBe('Hello Friend');
  });

  it('should normalize tracking domains without losing scheme or path', () => {
    emailService.setTrackingBaseUrl('track.example.com');
    expect(emailService.getTrackingBaseUrl()).toBe('http://track.example.com');

    emailService.setTrackingBaseUrl('https://track.example.com/links/');
    expect(emailService.getTrackingBaseUrl()).toBe('https://track.example.com/links');
  });

  it('should create signed unsubscribe links', () => {
    emailService.setTrackingBaseUrl('https://track.example.com');

    const html = emailService.addUnsubscribeLink(
      '<a href="{{unsubscribeLink}}">unsubscribe</a>',
      'campaign-1',
      'contact-1',
      'test@example.com'
    );

    const token = emailService.generateUnsubscribeToken('test@example.com', 'campaign-1');
    expect(html).toContain('email=test%40example.com');
    expect(html).toContain(`token=${token}`);
    expect(html).not.toContain('{{unsubscribeLink}}');
  });

  it('should attach the signed-in owner context to public tracking links', () => {
    emailService.setTrackingBaseUrl('https://track.example.com/base');
    emailService.setPublicTrackingContext({ ownerId: 'user-123' });

    const openTracked = emailService.addOpenTracking('<p>Hello</p>', 'track-1', 'campaign-1', 'contact-1');
    const clickTracked = emailService.addClickTracking('<a href="https://example.com/page">Link</a>', 'track-1', 'campaign-1', 'contact-1');
    const unsubscribeUrl = emailService.createUnsubscribeUrl('campaign-1', 'contact-1', 'test@example.com');

    expect(openTracked).toContain('ownerId=user-123');
    expect(clickTracked).toContain('ownerId=user-123');
    expect(unsubscribeUrl).toContain('ownerId=user-123');
  });

  it('should fall back to mailto unsubscribe links when no external tracking domain is configured', () => {
    const html = emailService.addUnsubscribeLink(
      '<a href="{{unsubscribeLink}}">unsubscribe</a>',
      'campaign-1',
      'contact-1',
      'test@example.com',
      { fromEmail: 'sender@example.com' }
    );

    expect(html).toContain('mailto:sender@example.com?subject=Unsubscribe');
    expect(html).not.toContain('{{unsubscribeLink}}');
  });

  it('should suppress tracking links for private network tracking hosts', () => {
    emailService.setTrackingBaseUrl('http://192.168.1.20:3847');

    expect(emailService.createUnsubscribeUrl('campaign-1', 'contact-1', 'test@example.com')).toBeNull();
    expect(emailService.addOpenTracking('<p>Hello</p>', 'track-1', 'campaign-1', 'contact-1')).toBe('<p>Hello</p>');
  });

  it('should stop a campaign when all active SMTP accounts hit their daily limit', async () => {
    const db = {
      isBlacklisted: jest.fn(() => false),
      isUnsubscribed: jest.fn(() => false),
      updateCampaign: jest.fn(),
      getActiveSmtpAccounts: jest.fn(() => [
        {
          id: 'smtp-1',
          sentToday: 1,
          dailyLimit: 1,
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'sender',
          password: 'secret',
          fromName: 'Sender',
          fromEmail: 'sender@example.com'
        }
      ]),
      incrementSmtpSentCount: jest.fn(),
      addCampaignLog: jest.fn(),
      incrementContactBounce: jest.fn(),
      addToBlacklist: jest.fn()
    };

    emailService.dispose();
    emailService = new EmailService(db, 'test-secret');
    emailService.createTransporter = jest.fn(() => ({ close: jest.fn() }));
    emailService.sendSingleEmail = jest.fn();
    emailService.sleep = jest.fn(() => Promise.resolve());
    emailService.getRandomDelay = jest.fn(() => 0);

    const result = await emailService.sendCampaign(
      {
        id: 'campaign-1',
        subject: 'Hello',
        content: '<p>World</p>',
        batchSize: 10,
        delayBetweenEmails: 0,
        delayMinutes: 0
      },
      [{ id: 'contact-1', email: 'test@example.com', bounceCount: 0 }],
      {
        id: 'legacy-1',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        fromName: 'Sender',
        fromEmail: 'sender@example.com'
      },
      jest.fn()
    );

    expect(emailService.sendSingleEmail).not.toHaveBeenCalled();
    expect(db.incrementSmtpSentCount).not.toHaveBeenCalled();
    expect(db.addCampaignLog).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      failureType: 'rate_limited'
    }));
    expect(result.status).toBe('stopped');
    expect(result.failed).toBe(1);
  });

  it('should interrupt pending waits when the service is stopped', async () => {
    const waitPromise = emailService.sleep(60000);

    emailService.stop();
    jest.advanceTimersByTime(1);
    await waitPromise;

    expect(emailService._pendingWaits.size).toBe(0);
    expect(emailService.isStopped).toBe(true);
  });

  it('should expose and restore state for service recovery', () => {
    emailService.isPaused = true;
    emailService.currentCampaignId = 'campaign-1';
    emailService.currentSmtpIndex = 2;
    emailService.setTrackingBaseUrl('https://track.example.com');
    emailService.sendingMode = 'personal';
    emailService.companyAddress = '12 Example Street';
    emailService.circuitBreaker.state = 'open';
    emailService.circuitBreaker.failures = 3;

    const saved = emailService.getState();

    const restored = new EmailService(null, 'test-secret');
    restored.setState(saved);

    expect(restored.getState()).toMatchObject({
      isPaused: true,
      currentCampaignId: 'campaign-1',
      currentSmtpIndex: 2,
      trackingBaseUrl: 'https://track.example.com',
      sendingMode: 'personal',
      companyAddress: '12 Example Street',
      circuitBreaker: expect.objectContaining({
        state: 'open',
        failures: 3
      })
    });

    restored.dispose();
  });
});
