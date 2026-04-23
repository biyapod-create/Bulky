const dns = require('dns');

class DomainHealthService {
  constructor(options = {}) {
    this.systemDns = options.systemDns || dns.promises;
    this.ResolverClass = options.ResolverClass || dns.promises.Resolver;
    this.publicDnsServers = options.publicDnsServers || ['1.1.1.1', '8.8.8.8'];
    this.recoverableDnsErrorCodes = new Set([
      'ECONNREFUSED',
      'EDESTRUCTION',
      'ETIMEOUT',
      'EAI_AGAIN',
      'ESERVFAIL',
      'EREFUSED',
      'SERVFAIL',
      'REFUSED'
    ]);
    this.fallbackDns = options.publicDns || this.createFallbackResolver();
  }

  createFallbackResolver() {
    try {
      const resolver = new this.ResolverClass();
      resolver.setServers(this.publicDnsServers);
      return resolver;
    } catch (error) {
      return null;
    }
  }

  normalizeDomain(domain) {
    return String(domain || '').trim().toLowerCase();
  }

  shouldFallback(error) {
    return !!error?.code && this.recoverableDnsErrorCodes.has(error.code);
  }

  async resolveWithFallback(method, ...args) {
    if (typeof this.systemDns?.[method] === 'function') {
      try {
        return await this.systemDns[method](...args);
      } catch (error) {
        if (!this.shouldFallback(error) || typeof this.fallbackDns?.[method] !== 'function') {
          throw error;
        }
      }
    }

    if (typeof this.fallbackDns?.[method] !== 'function') {
      throw new Error(`DNS resolver does not support ${method}`);
    }

    return this.fallbackDns[method](...args);
  }

  flattenTxt(records) {
    return Array.isArray(records)
      ? records.map((record) => Array.isArray(record) ? record.join('') : String(record))
      : [];
  }

  getRecommendedDkimSelectors(domain, selectors = []) {
    const normalized = this.normalizeDomain(domain);
    const unique = new Set(
      selectors
        .map((selector) => String(selector || '').trim().toLowerCase())
        .filter(Boolean)
    );

    for (const selector of ['default', 'google', 'dkim', 'mail', 'selector1', 'selector2', 's1', 's2', 'k1']) {
      unique.add(selector);
    }

    return Array.from(unique).filter((selector) => normalized && !selector.includes(`._domainkey.${normalized}`));
  }

  async checkDomain(domain, options = {}) {
    const normalizedDomain = this.normalizeDomain(domain);
    if (!normalizedDomain) {
      throw new Error('A valid domain is required');
    }

    const result = {
      domain: normalizedDomain,
      mx: { found: false, records: [] },
      spf: { found: false, records: [] },
      dkim: { found: false, checkedSelectors: [] },
      dmarc: { found: false, records: [] }
    };

    try {
      const mxRecords = await this.resolveWithFallback('resolveMx', normalizedDomain);
      const sortedRecords = Array.isArray(mxRecords)
        ? [...mxRecords].sort((a, b) => (a.priority || 0) - (b.priority || 0))
        : [];
      const hasNullMx = sortedRecords.length === 1 && sortedRecords[0]?.exchange === '' && sortedRecords[0]?.priority === 0;

      if (hasNullMx) {
        result.mx = {
          found: false,
          isNullMx: true,
          error: 'Domain does not accept email (null MX)',
          recommendation: `Use a sender address on a domain that accepts mail or publish working MX records for ${normalizedDomain}.`
        };
      } else {
        result.mx = {
          found: sortedRecords.length > 0,
          records: sortedRecords.map((record) => `${record.priority} ${record.exchange}`),
          recommendation: sortedRecords.length === 0
            ? `Add MX records for ${normalizedDomain} so replies and bounce handling can route correctly.`
            : null
        };
      }
    } catch (error) {
      result.mx = {
        found: false,
        records: [],
        error: error.message,
        recommendation: `Add MX records for ${normalizedDomain} so replies and bounce handling can route correctly.`
      };
    }

    try {
      const txtRecords = this.flattenTxt(await this.resolveWithFallback('resolveTxt', normalizedDomain));
      const spfRecords = txtRecords.filter((record) => /^v=spf1/i.test(record));
      result.spf = {
        found: spfRecords.length > 0,
        records: spfRecords,
        recommendation: spfRecords.length === 0
          ? `Add a TXT record for ${normalizedDomain}: v=spf1 include:YOUR_MAIL_PROVIDER ~all`
          : null
      };
    } catch (error) {
      result.spf = {
        found: false,
        records: [],
        error: error.message,
        recommendation: `Add a TXT record for ${normalizedDomain}: v=spf1 include:YOUR_MAIL_PROVIDER ~all`
      };
    }

    try {
      const dmarcRecords = this.flattenTxt(await this.resolveWithFallback('resolveTxt', `_dmarc.${normalizedDomain}`))
        .filter((record) => /^v=DMARC1/i.test(record));
      result.dmarc = {
        found: dmarcRecords.length > 0,
        records: dmarcRecords,
        recommendation: dmarcRecords.length === 0
          ? `Add a TXT record for _dmarc.${normalizedDomain}: v=DMARC1; p=none; rua=mailto:dmarc@${normalizedDomain}`
          : null
      };
    } catch (error) {
      result.dmarc = {
        found: false,
        records: [],
        error: error.message,
        recommendation: `Add a TXT record for _dmarc.${normalizedDomain}: v=DMARC1; p=none; rua=mailto:dmarc@${normalizedDomain}`
      };
    }

    const selectors = this.getRecommendedDkimSelectors(normalizedDomain, options.selectors || []);
    for (const selector of selectors) {
      result.dkim.checkedSelectors.push(selector);
      try {
        const dkimRecords = this.flattenTxt(
          await this.resolveWithFallback('resolveTxt', `${selector}._domainkey.${normalizedDomain}`)
        ).filter((record) => /v=DKIM1/i.test(record));

        if (dkimRecords.length > 0) {
          result.dkim = {
            found: true,
            selector,
            records: dkimRecords,
            checkedSelectors: result.dkim.checkedSelectors,
            recommendation: null
          };
          break;
        }
      } catch (error) {
        // Keep checking other selectors.
      }
    }

    if (!result.dkim.found) {
      result.dkim = {
        found: false,
        checkedSelectors: result.dkim.checkedSelectors,
        error: 'No DKIM record found (checked configured and common selectors)',
        recommendation: `Enable DKIM signing with your mail provider and publish the selector record for ${normalizedDomain}.`
      };
    }

    return result;
  }
}

module.exports = DomainHealthService;
