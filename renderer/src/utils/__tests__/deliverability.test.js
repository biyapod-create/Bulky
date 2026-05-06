const {
  getApexDomain,
  isPrivateTrackingSurface,
  buildInboxReadinessGuardrails
} = require('../deliverability');

describe('deliverability utilities', () => {
  test('detects apex domains including common ccTLD patterns', () => {
    expect(getApexDomain('mail.example.com')).toBe('example.com');
    expect(getApexDomain('news.mail.example.co.uk')).toBe('example.co.uk');
  });

  test('flags private and public tracking surfaces correctly', () => {
    expect(isPrivateTrackingSurface('localhost:3847')).toBe(true);
    expect(isPrivateTrackingSurface('http://192.168.1.20:3847')).toBe(true);
    expect(isPrivateTrackingSurface('track.example.com')).toBe(false);
  });

  test('builds actionable guardrails for a healthy bulk sender', () => {
    const guardrails = buildInboxReadinessGuardrails({
      deliverabilityInfo: {
        trackingDomain: 'track.example.com',
        spfConfigured: true,
        dkimConfigured: true,
        dmarcConfigured: true,
        sendingMode: 'bulk',
        companyAddress: '123 Main St'
      },
      smtpSettings: {
        fromEmail: 'hello@example.com'
      },
      smtpAccounts: [
        {
          id: 'smtp-1',
          isActive: true,
          isDefault: true,
          fromEmail: 'hello@example.com',
          replyTo: 'reply@example.com',
          unsubscribeEmail: 'unsubscribe@example.com',
          dkimDomain: 'mail.example.com',
          dailyLimit: 100
        },
        {
          id: 'smtp-2',
          isActive: true,
          fromEmail: 'team@example.com',
          dailyLimit: 100
        }
      ],
      smtpHealth: [
        { id: 'smtp-1', sentToday: 10, dailyLimit: 100 },
        { id: 'smtp-2', sentToday: 20, dailyLimit: 100 }
      ]
    });

    expect(guardrails.find((item) => item.id === 'auth-stack').status).toBe('pass');
    expect(guardrails.find((item) => item.id === 'tracking-surface').status).toBe('pass');
    expect(guardrails.find((item) => item.id === 'rotation-health').status).toBe('pass');
  });

  test('surfaces blocking issues for local-only bulk delivery setup', () => {
    const guardrails = buildInboxReadinessGuardrails({
      deliverabilityInfo: {
        trackingDomain: 'localhost:3847',
        spfConfigured: false,
        dkimConfigured: true,
        dmarcConfigured: false,
        sendingMode: 'bulk',
        companyAddress: ''
      },
      smtpSettings: {
        fromEmail: 'hello@example.com',
        replyTo: ''
      },
      smtpAccounts: [
        {
          id: 'smtp-1',
          isActive: true,
          isDefault: true,
          fromEmail: 'hello@example.com',
          dailyLimit: 100,
          sentToday: 100
        }
      ],
      smtpHealth: [
        { id: 'smtp-1', sentToday: 100, dailyLimit: 100 }
      ]
    });

    expect(guardrails.find((item) => item.id === 'auth-stack').status).toBe('fail');
    expect(guardrails.find((item) => item.id === 'tracking-surface').status).toBe('fail');
    expect(guardrails.find((item) => item.id === 'unsubscribe-path').status).toBe('fail');
    expect(guardrails.find((item) => item.id === 'rotation-health').status).toBe('fail');
  });
});
