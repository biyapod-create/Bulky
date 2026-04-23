const VerificationService = require('../verificationService');

describe('VerificationService', () => {
  it('should fall back to public DNS when the system resolver refuses MX lookups', async () => {
    const service = new VerificationService({
      systemDns: {
        resolveMx: jest.fn(async () => {
          const err = new Error('queryMx ECONNREFUSED gmail.com');
          err.code = 'ECONNREFUSED';
          throw err;
        }),
        resolve4: jest.fn(),
        resolve6: jest.fn(),
        resolveSoa: jest.fn(async () => ({
          serial: 2025010101,
          hostmaster: 'dns.example.com',
          refresh: 3600
        }))
      },
      publicDns: {
        resolveMx: jest.fn(async () => ([
          { exchange: 'gmail-smtp-in.l.google.com', priority: 5 },
          { exchange: 'alt1.gmail-smtp-in.l.google.com', priority: 10 }
        ])),
        resolve4: jest.fn(),
        resolve6: jest.fn(),
        resolveSoa: jest.fn(async () => ({
          serial: 2025010101,
          hostmaster: 'dns.example.com',
          refresh: 3600
        }))
      }
    });

    const result = await service.verifyEmail('test@gmail.com', { skipSmtpCheck: true });

    expect(result.status).toBe('valid');
    expect(result.checks.mxRecords).toBe(true);
    expect(result.details.inboxProvider).toBe('Gmail');
  });

  it('should mark disposable domains as risky before DNS checks', async () => {
    const service = new VerificationService();

    const result = await service.verifyEmail('temp@mailinator.com', { skipSmtpCheck: true });

    expect(result.status).toBe('risky');
    expect(result.reason).toBe('Disposable email domain');
    expect(result.details.method).toBe('disposable_check');
  });

  it('should reject domains that publish a null MX record', async () => {
    const service = new VerificationService({
      systemDns: {
        resolveMx: jest.fn(async () => ([
          { exchange: '', priority: 0 }
        ])),
        resolve4: jest.fn(),
        resolve6: jest.fn(),
        resolveSoa: jest.fn()
      }
    });

    const result = await service.verifyEmail('admin@example.com', { skipSmtpCheck: true });

    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('Domain does not accept email (null MX)');
  });

  it('should stop bulk verification and return a stopped summary', async () => {
    const service = new VerificationService();
    const processed = [];

    service.verifyEmail = jest.fn(async (email) => {
      processed.push(email);
      if (email === 'one@example.com') {
        service.stop();
      }
      return {
        email,
        status: 'valid',
        reason: 'ok',
        score: 90,
        checks: { syntax: true },
        details: { method: 'test' }
      };
    });

    const result = await service.verifyBulk(
      ['one@example.com', 'two@example.com', 'three@example.com'],
      null,
      { skipSmtpCheck: true, concurrency: 1 }
    );

    expect(processed).toEqual(['one@example.com']);
    expect(result.summary.stopped).toBe(true);
    expect(result.summary.completed).toBe(1);
    expect(result.results).toHaveLength(1);
  });

  it('should treat SMTP infrastructure timeouts as risky instead of invalid', async () => {
    const service = new VerificationService();

    service.checkMxRecords = jest.fn(async () => ({
      valid: true,
      mxRecords: ['gmail-smtp-in.l.google.com'],
      primaryMx: 'gmail-smtp-in.l.google.com'
    }));
    service.checkDomainAge = jest.fn(async () => ({
      hasSOA: true,
      serial: 2025010101,
      hostmaster: 'dns.example.com',
      refresh: 3600,
      isNewDomain: false
    }));
    service.verifyMailboxSMTP = jest.fn(async () => ({
      valid: false,
      status: 'timeout',
      reason: 'Connection timeout',
      smtpCode: null,
      smtpResponse: 'Connection timed out'
    }));

    const result = await service.verifyEmail('person@gmail.com', { skipSmtpCheck: false, checkCatchAll: false });

    expect(result.status).toBe('risky');
    expect(result.reason).toBe('SMTP verification unavailable; DNS checks passed');
    expect(result.checks.smtp).toBe('inconclusive');
  });
});
