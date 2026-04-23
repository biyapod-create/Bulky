const DomainHealthService = require('../domainHealthService');

describe('DomainHealthService', () => {
  it('should include DKIM results when a configured selector is available', async () => {
    const resolver = {
      resolveMx: jest.fn(async () => [
        { exchange: 'mx1.example.com', priority: 10 }
      ]),
      resolveTxt: jest.fn(async (name) => {
        if (name === 'example.com') {
          return [['v=spf1 include:_spf.example.com ~all']];
        }
        if (name === '_dmarc.example.com') {
          return [['v=DMARC1; p=quarantine']];
        }
        if (name === 'newsletter._domainkey.example.com') {
          return [['v=DKIM1; k=rsa; p=abc123']];
        }
        const error = new Error(`ENOTFOUND ${name}`);
        error.code = 'ENOTFOUND';
        throw error;
      })
    };

    const service = new DomainHealthService({ systemDns: resolver, publicDns: resolver });
    const result = await service.checkDomain('example.com', { selectors: ['newsletter'] });

    expect(result.mx.found).toBe(true);
    expect(result.spf.found).toBe(true);
    expect(result.dmarc.found).toBe(true);
    expect(result.dkim.found).toBe(true);
    expect(result.dkim.selector).toBe('newsletter');
  });

  it('should treat null MX as a deliverability problem', async () => {
    const resolver = {
      resolveMx: jest.fn(async () => [
        { exchange: '', priority: 0 }
      ]),
      resolveTxt: jest.fn(async () => [])
    };

    const service = new DomainHealthService({ systemDns: resolver, publicDns: resolver });
    const result = await service.checkDomain('example.com');

    expect(result.mx.found).toBe(false);
    expect(result.mx.isNullMx).toBe(true);
    expect(result.mx.error).toBe('Domain does not accept email (null MX)');
  });

  it('should fall back to public DNS on recoverable resolver failures', async () => {
    const resolverError = new Error('queryMx ECONNREFUSED gmail.com');
    resolverError.code = 'ECONNREFUSED';

    const service = new DomainHealthService({
      systemDns: {
        resolveMx: jest.fn(async () => { throw resolverError; }),
        resolveTxt: jest.fn(async () => { throw resolverError; })
      },
      publicDns: {
        resolveMx: jest.fn(async () => [
          { exchange: 'gmail-smtp-in.l.google.com', priority: 5 }
        ]),
        resolveTxt: jest.fn(async (name) => {
          if (name === 'gmail.com') {
            return [['v=spf1 redirect=_spf.google.com']];
          }
          if (name === '_dmarc.gmail.com') {
            return [['v=DMARC1; p=none']];
          }
          const error = new Error(`ENOTFOUND ${name}`);
          error.code = 'ENOTFOUND';
          throw error;
        })
      }
    });

    const result = await service.checkDomain('gmail.com');

    expect(result.mx.found).toBe(true);
    expect(result.spf.found).toBe(true);
    expect(result.dmarc.found).toBe(true);
  });

  it('should return generic recommendations instead of provider-specific SPF advice', async () => {
    const resolver = {
      resolveMx: jest.fn(async () => []),
      resolveTxt: jest.fn(async () => [])
    };

    const service = new DomainHealthService({ systemDns: resolver, publicDns: resolver });
    const result = await service.checkDomain('mydomain.test');

    expect(result.spf.recommendation).toContain('YOUR_MAIL_PROVIDER');
    expect(result.dkim.recommendation).toContain('Enable DKIM signing');
    expect(result.dmarc.recommendation).toContain('_dmarc.mydomain.test');
  });
});
