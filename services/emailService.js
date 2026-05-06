const nodemailer = require('nodemailer');
const crypto = require('crypto');
const net = require('net');
const { version: APP_VERSION } = require('../package.json');

class EmailService {
  constructor(db, hmacSecret) {
    this.db = db;
    this.transporters = new Map();
    this._pendingWaits = new Set();
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = null;
    this.currentSmtpIndex = 0;
    this.trackingBaseUrl = ''; // Empty by default - requires external domain configuration

    // Circuit breaker for SMTP failures with exponential backoff
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      state: 'closed', // closed, open, half-open
      threshold: 5, // failures before opening
      timeout: 60000, // 1 minute before trying again
      baseTimeout: 60000 // base timeout for reset
    };

    // Periodic transporter cleanup: close pooled connections for accounts that
    // haven't been used in > 30 minutes to prevent stale connection accumulation.
    this._cleanupInterval = setInterval(() => {
      if (this.currentCampaignId) return; // don't prune mid-campaign
      if (this.transporters.size > 0) {
        for (const t of this.transporters.values()) {
          try { t.close(); } catch (e) {}
        }
        this.transporters.clear();
      }
    }, 30 * 60 * 1000);
    if (typeof this._cleanupInterval.unref === 'function') {
      this._cleanupInterval.unref();
    }

    // HMAC secret shared with main.js tracking server -- must be the same value so tokens
    // embedded in outgoing emails can be validated when users click unsubscribe links.
    this.hmacSecret = hmacSecret || crypto.randomBytes(32).toString('hex');

    // Sending mode: 'bulk' (List-Unsubscribe header included -> Gmail Promotions/Inbox)
    //               'personal' (no List-Unsubscribe -> Gmail Inbox, personal-feel emails)
    this.sendingMode = 'bulk';

    // Physical company address appended to campaign emails (CAN-SPAM compliance).
    // Explicitly initialized so the footer conditional in sendSingleEmail never
    // evaluates `undefined` as truthy.
    this.companyAddress = '';

    // SMTP response codes and their meanings
    this.smtpResponseCodes = {
      // Success codes
      250: { type: 'success', category: 'sent', message: 'Message accepted' },
      251: { type: 'success', category: 'sent', message: 'User not local, will forward' },
      
      // Temporary failures (soft bounces - retry)
      421: { type: 'soft_bounce', category: 'temporary', message: 'Service unavailable, try again later' },
      450: { type: 'soft_bounce', category: 'temporary', message: 'Mailbox busy or temporarily blocked' },
      451: { type: 'soft_bounce', category: 'temporary', message: 'Local error in processing' },
      452: { type: 'soft_bounce', category: 'temporary', message: 'Insufficient system storage' },
      
      // Permanent failures (hard bounces - don't retry)
      550: { type: 'hard_bounce', category: 'invalid_recipient', message: 'User not found / Mailbox unavailable' },
      551: { type: 'hard_bounce', category: 'invalid_recipient', message: 'User not local' },
      552: { type: 'soft_bounce', category: 'mailbox_full', message: 'Mailbox storage exceeded' },
      553: { type: 'hard_bounce', category: 'invalid_address', message: 'Mailbox name not allowed' },
      554: { type: 'hard_bounce', category: 'rejected', message: 'Transaction failed / Message rejected' },
      
      // Policy/security rejections
      571: { type: 'hard_bounce', category: 'blocked', message: 'Message refused by policy' },
      572: { type: 'hard_bounce', category: 'blocked', message: 'Spam message rejected' }
    };
  }

  createTransporter(settings) {
    const transportOptions = {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: settings.password
      },
      tls: { rejectUnauthorized: settings.rejectUnauthorized !== false && settings.rejectUnauthorized !== 0 },
      pool: true,
      maxConnections: 2,
      maxMessages: 100
    };

    // Apply DKIM signing if all required fields are present
    if (settings.dkimPrivateKey && settings.dkimDomain && settings.dkimSelector) {
      transportOptions.dkim = {
        domainName: settings.dkimDomain,
        keySelector: settings.dkimSelector,
        privateKey: settings.dkimPrivateKey
      };
    }

    return nodemailer.createTransport(transportOptions);
  }

  async testConnection(settings) {
    let transporter = null;
    try {
      transporter = this.createTransporter(settings);
      await transporter.verify();
      return { success: true, message: 'Connection successful!' };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      try { transporter?.close(); } catch (e) {}
    }
  }

  generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
  }

  setPasswordDecryptor(decryptor) {
    if (typeof decryptor === 'function') {
      this.decryptPassword = decryptor;
    }
  }

  dispose() {
    this._resolvePendingWaits();
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    for (const transporter of this.transporters.values()) {
      try { transporter.close(); } catch (e) {}
    }
    this.transporters.clear();
  }

  // Parse SMTP error to extract code and determine bounce type
  parseSmtpError(error) {
    const errorString = error.message || error.toString();
    
    // Try to extract SMTP code from error message
    const codeMatch = errorString.match(/\b([245]\d{2})\b/);
    const smtpCode = codeMatch ? parseInt(codeMatch[1], 10) : null;
    
    // Get code info or default
    const codeInfo = smtpCode ? this.smtpResponseCodes[smtpCode] : null;
    
    // Determine failure type based on error content
    let failureType = 'unknown';
    let failureReason = errorString;
    
    if (codeInfo) {
      failureType = codeInfo.type;
      failureReason = codeInfo.message;
    } else {
      // Parse common error patterns
      const errorLower = errorString.toLowerCase();
      
      if (errorLower.includes('user unknown') || errorLower.includes('user not found') || 
          errorLower.includes('does not exist') || errorLower.includes('no such user') ||
          errorLower.includes('invalid recipient') || errorLower.includes('recipient rejected')) {
        failureType = 'hard_bounce';
        failureReason = 'Recipient does not exist';
      } else if (errorLower.includes('mailbox full') || errorLower.includes('over quota') ||
                 errorLower.includes('storage exceeded')) {
        failureType = 'soft_bounce';
        failureReason = 'Mailbox full';
      } else if (errorLower.includes('blocked') || errorLower.includes('blacklisted') ||
                 errorLower.includes('rejected') || errorLower.includes('denied')) {
        failureType = 'hard_bounce';
        failureReason = 'Message blocked or rejected';
      } else if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
        failureType = 'soft_bounce';
        failureReason = 'Connection timeout';
      } else if (errorLower.includes('connection') || errorLower.includes('socket')) {
        failureType = 'soft_bounce';
        failureReason = 'Connection error';
      } else if (errorLower.includes('spam') || errorLower.includes('spf') || 
                 errorLower.includes('dkim') || errorLower.includes('dmarc')) {
        failureType = 'hard_bounce';
        failureReason = 'Rejected as spam or authentication failure';
      }
    }
    
    return {
      smtpCode,
      smtpResponse: errorString.substring(0, 500), // Limit length
      failureType,
      failureReason
    };
  }

  // Process spintax: {option1|option2|option3} -> randomly picks one
  processSpintax(text, contact) {
    if (!text) return text;
    return text.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  // Advanced personalization with conditionals and fallbacks
  personalizeContent(content, contact, campaign = null) {
    let personalized = content;

    // Process spintax FIRST (before other replacements)
    personalized = this.processSpintax(personalized, contact);
    
    // Basic fields
    personalized = personalized.replace(/\{\{email\}\}/gi, contact.email || '');
    personalized = personalized.replace(/\{\{firstName\}\}/gi, contact.firstName || '');
    personalized = personalized.replace(/\{\{lastName\}\}/gi, contact.lastName || '');
    personalized = personalized.replace(/\{\{fullName\}\}/gi, 
      `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email.split('@')[0]);
    
    // Extended fields
    personalized = personalized.replace(/\{\{company\}\}/gi, contact.company || '');
    personalized = personalized.replace(/\{\{phone\}\}/gi, contact.phone || '');
    personalized = personalized.replace(/\{\{customField1\}\}/gi, contact.customField1 || '');
    personalized = personalized.replace(/\{\{customField2\}\}/gi, contact.customField2 || '');
    personalized = personalized.replace(/\{\{custom1\}\}/gi, contact.customField1 || '');
    personalized = personalized.replace(/\{\{custom2\}\}/gi, contact.customField2 || '');
    
    // Email domain extraction
    const emailDomain = contact.email.split('@')[1] || '';
    personalized = personalized.replace(/\{\{emailDomain\}\}/gi, emailDomain);
    
    // Date/Time placeholders
    const now = new Date();
    personalized = personalized.replace(/\{\{date\}\}/gi, now.toLocaleDateString());
    personalized = personalized.replace(/\{\{time\}\}/gi, now.toLocaleTimeString());
    personalized = personalized.replace(/\{\{year\}\}/gi, now.getFullYear().toString());
    personalized = personalized.replace(/\{\{month\}\}/gi, now.toLocaleString('default', { month: 'long' }));
    personalized = personalized.replace(/\{\{day\}\}/gi, now.getDate().toString());
    personalized = personalized.replace(/\{\{dayOfWeek\}\}/gi, now.toLocaleString('default', { weekday: 'long' }));
    
    // Random number (for unique offers, etc.)
    personalized = personalized.replace(/\{\{randomNumber\}\}/gi, () => Math.floor(Math.random() * 10000).toString());
    personalized = personalized.replace(/\{\{uniqueCode\}\}/gi, () => crypto.randomBytes(4).toString('hex').toUpperCase());

    // Fallback syntax: {{firstName | "Friend"}} or {{firstName | Friend}}
    personalized = personalized.replace(/\{\{(\w+)\s*\|\s*"?([^}"]+)"?\}\}/gi, (match, field, fallback) => {
      const fieldLower = field.toLowerCase();
      const value = contact[fieldLower] || contact[field];
      return (value && value.trim()) ? value : fallback.trim();
    });

    // Conditional content: {{#if fieldName}}content{{/if}}
    personalized = personalized.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gi, (match, field, content) => {
      const fieldLower = field.toLowerCase();
      const value = contact[fieldLower] || contact[field];
      return (value && value.trim()) ? content : '';
    });

    // Conditional with else: {{#if fieldName}}content{{else}}other{{/if}}
    personalized = personalized.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/gi, (match, field, ifContent, elseContent) => {
      const fieldLower = field.toLowerCase();
      const value = contact[fieldLower] || contact[field];
      return (value && value.trim()) ? ifContent : elseContent;
    });

    // Unless (inverse of if): {{#unless fieldName}}content{{/unless}}
    personalized = personalized.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/gi, (match, field, content) => {
      const fieldLower = field.toLowerCase();
      const value = contact[fieldLower] || contact[field];
      return (!value || !value.trim()) ? content : '';
    });

    // Uppercase/Lowercase modifiers
    personalized = personalized.replace(/\{\{(\w+):upper\}\}/gi, (match, field) => {
      const value = contact[field.toLowerCase()] || contact[field] || '';
      return value.toUpperCase();
    });
    personalized = personalized.replace(/\{\{(\w+):lower\}\}/gi, (match, field) => {
      const value = contact[field.toLowerCase()] || contact[field] || '';
      return value.toLowerCase();
    });
    personalized = personalized.replace(/\{\{(\w+):capitalize\}\}/gi, (match, field) => {
      const value = contact[field.toLowerCase()] || contact[field] || '';
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    });

    // Unsubscribe link placeholders -- createUnsubscribeUrl returns null when no
    // external tracking domain is set; replace with '' so the literal token or
    // 'null' string never appears in the sent email.
    if (campaign && campaign.id) {
      const unsubLink = this.createUnsubscribeUrl(campaign.id, contact.id || 'unknown', contact.email) || '';
      personalized = personalized.replace(/\{\{unsubscribeLink\}\}/gi, unsubLink);
      personalized = personalized.replace(/\{\{unsubscribeUrl\}\}/gi, unsubLink);
    }

    return personalized;
  }

  htmlToPlainText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  generateMessageId(domain) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `<${timestamp}.${random}@${domain}>`;
  }

  // Tracking server base URL
  getTrackingBaseUrl() {
    return this.trackingBaseUrl;
  }

  normalizeTrackingBaseUrl(baseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') return null;

    let candidate = baseUrl.trim();
    if (!candidate) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }

    const parsed = new URL(candidate);
    const pathname = parsed.pathname && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/+$/, '')
      : '';
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  }

  // sendingMode: 'bulk' (default) or 'personal'.
  // In personal mode List-Unsubscribe is omitted so Gmail routes to Primary inbox.
  setSendingMode(mode) {
    this.sendingMode = (mode === 'personal') ? 'personal' : 'bulk';
  }

  // Physical address appended to every bulk email footer (CAN-SPAM / GDPR).
  setCompanyAddress(address) {
    this.companyAddress = typeof address === 'string' ? address.trim() : '';
  }

  setTrackingBaseUrl(baseUrl) {
    if (baseUrl && typeof baseUrl === 'string') {
      try {
        const normalized = this.normalizeTrackingBaseUrl(baseUrl);
        if (normalized) {
          this.trackingBaseUrl = normalized;
        }
      } catch (e) {}
    }
  }

  isPrivateTrackingBaseUrl(baseUrl = this.trackingBaseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') return true;

    try {
      const parsed = new URL(baseUrl);
      const hostname = String(parsed.hostname || '').toLowerCase();
      if (!hostname) return true;

      if (
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.')
      ) {
        return true;
      }

      const ipVersion = net.isIP(hostname);
      if (ipVersion === 6 && hostname === '::1') {
        return true;
      }

      const private172Match = hostname.match(/^172\.(\d+)\./);
      if (private172Match) {
        const octet = Number(private172Match[1]);
        if (octet >= 16 && octet <= 31) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return true;
    }
  }

  createUnsubscribeUrl(campaignId, contactId, email) {
    // SPAM FIX #1: never embed a loopback/private-IP URL in outbound mail.
    // When no external tracking domain is set return null so callers
    // fall back to a mailto: unsubscribe link instead.
    const baseUrl = this.getTrackingBaseUrl();
    if (this.isPrivateTrackingBaseUrl(baseUrl)) return null;

    const params = new URLSearchParams({ email: email || '' });
    const token = this.generateUnsubscribeToken(email, campaignId);
    if (token) params.set('token', token);
    return `${baseUrl}/unsubscribe/${campaignId}/${contactId || 'unknown'}?${params.toString()}`;
  }

  addOpenTracking(html, trackingId, campaignId, contactId) {
    // Never embed a localhost/127.0.0.1 URL in outbound email -- same rule as click tracking.
    // Skip open-tracking pixel when no external domain is configured.
    const baseUrl = this.getTrackingBaseUrl();
    if (this.isPrivateTrackingBaseUrl(baseUrl)) return html;

    const trackingUrl = `${baseUrl}/track/open/${campaignId}/${contactId || 'unknown'}/${trackingId}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;
    if (html.toLowerCase().includes('</body>')) {
      return html.replace(/<\/body>/i, `${trackingPixel}</body>`);
    }
    return html + trackingPixel;
  }

  addClickTracking(html, trackingId, campaignId, contactId) {
    const baseUrl = this.getTrackingBaseUrl();

    // CRITICAL: never embed a localhost / private-IP URL in outbound emails.
    // If no external tracking domain is configured the click-tracking is
    // silently skipped -- private IPs in links are an automatic spam trigger.
    const isLocalTracking = this.isPrivateTrackingBaseUrl(baseUrl);
    if (isLocalTracking) return html;

    return html.replace(/<a\s+([^>]*href=")([^"]+)(")/gi, (match, before, url, after) => {
      // Skip certain links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#') ||
          url.toLowerCase().includes('unsubscribe') || url.toLowerCase().includes('optout')) {
        return match;
      }
      const encodedUrl = encodeURIComponent(url);
      const trackedUrl = `${baseUrl}/track/click/${campaignId}/${contactId || 'unknown'}/${trackingId}?url=${encodedUrl}`;
      return `<a ${before}${trackedUrl}${after}`;
    });
  }

  addUnsubscribeLink(html, campaignId, contactId, email, settings = null) {
    // SPAM FIX #1/#6: when no external tracking domain, fall back to a mailto:
    // unsubscribe so the plain-text part also gets a valid, non-localhost link.
    const trackingUrl = this.createUnsubscribeUrl(campaignId, contactId, email);
    const mailtoFallback = (() => {
      const addr = settings?.unsubscribeEmail || settings?.fromEmail;
      return addr ? `mailto:${addr}?subject=Unsubscribe` : null;
    })();
    const unsubUrl = trackingUrl || mailtoFallback || '';
    if (!unsubUrl) return html; // nothing to inject
    let processed = html.replace(/\{\{unsubscribeLink\}\}/gi, unsubUrl);
    processed = processed.replace(/\{\{unsubscribeUrl\}\}/gi, unsubUrl);
    return processed;
  }

  async getNextSmtpAccount() {
    try {
      const accounts = this.db?.getActiveSmtpAccounts?.();
      if (!accounts || accounts.length === 0) {
        return { account: null, exhausted: false };
      }
      
      for (let i = 0; i < accounts.length; i++) {
        const idx = (this.currentSmtpIndex + i) % accounts.length;
        const account = accounts[idx];
        if (account.sentToday < account.dailyLimit) {
          this.currentSmtpIndex = (idx + 1) % accounts.length;
          // Decrypt password so SMTP rotation uses correct credentials
          if (this.decryptPassword && typeof this.decryptPassword === 'function' && account.password) {
            return {
              account: { ...account, password: this.decryptPassword(account.password) },
              exhausted: false
            };
          }
          return { account, exhausted: false };
        }
      }
      return { account: null, exhausted: true };
    } catch (e) {
      return { account: null, exhausted: false };
    }
  }

  getTransporter(account) {
    if (!this.transporters.has(account.id)) {
      this.transporters.set(account.id, this.createTransporter(account));
    }
    return this.transporters.get(account.id);
  }

  sleep(ms) {
    const waitMs = Math.max(0, Number(ms) || 0);
    if (waitMs === 0 || this.isStopped) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        this._pendingWaits.delete(finish);
        resolve();
      };

      timer = setTimeout(finish, waitMs);
      this._pendingWaits.add(finish);
    });
  }

  _resolvePendingWaits() {
    for (const finish of [...this._pendingWaits]) {
      try { finish(); } catch {}
    }
    this._pendingWaits.clear();
  }

  getRandomDelay(baseMs) {
    const variance = baseMs * 0.25;
    return baseMs + (Math.random() * variance * 2 - variance);
  }

  async sendSingleEmail(transporter, settings, contact, subject, content, campaign = null, variant = 'A') {
    const personalizedSubject = this.personalizeContent(subject, contact, campaign);
    let personalizedContent = this.personalizeContent(content, contact, campaign);
    
    const trackingId = this.generateTrackingId();
    const contactId = contact.id || 'unknown';
    
    // FIX #6: plain text derived from the pre-tracking personalised content
    // so HTML and text/plain carry identical tokens (divergence raises spam score).
    const plainTextContent = this.htmlToPlainText(personalizedContent);

    // CAN-SPAM / GDPR physical address footer
    if (campaign && this.companyAddress) {
      const footerHtml = `<div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;">${this.companyAddress}</div>`;
      if (personalizedContent.toLowerCase().includes('</body>')) {
        personalizedContent = personalizedContent.replace(/<\/body>/i, `${footerHtml}</body>`);
      } else {
        personalizedContent += footerHtml;
      }
    }

    if (campaign && campaign.id) {
      // Open-tracking pixel: embed only when an external tracking domain is set.
      // addOpenTracking() skips when the base URL is localhost/private-IP so
      // that no private-network URLs appear in outbound emails.
      personalizedContent = this.addOpenTracking(personalizedContent, trackingId, campaign.id, contactId);

      // Click-tracking redirect links: only when an external domain is configured.
      // A 127.0.0.1 redirect URL inside an outbound email is an instant spam flag.
      const isLocalTracking = this.isPrivateTrackingBaseUrl(this.getTrackingBaseUrl());
      if (!isLocalTracking) {
        personalizedContent = this.addClickTracking(personalizedContent, trackingId, campaign.id, contactId);
      }
      // Pass settings so addUnsubscribeLink can use mailto: when no external domain.
      personalizedContent = this.addUnsubscribeLink(personalizedContent, campaign.id, contactId, contact.email, settings);
    }

    // FIX #4: use SMTP host as Message-ID domain fallback -- '@localhost' in
    // Message-ID is a textbook spam indicator recognised by every major filter.
    const domain = (settings.fromEmail && settings.fromEmail.includes('@'))
      ? settings.fromEmail.split('@')[1]
      : (settings.host ? settings.host.split(':')[0] : 'mail.invalid');

    const isLocalTracking = this.isPrivateTrackingBaseUrl(this.getTrackingBaseUrl());

    // Minimal, clean header set.
    // -- X-Priority / Importance removed: they flag bulk mail in SpamAssassin.
    // -- X-Mailer / Precedence removed: fingerprint bulk senders.
    // -- MIME-Version: nodemailer adds this automatically; duplicate causes warnings.
    const headers = {
      'Message-ID': this.generateMessageId(domain),
    };

    // Sender: header -- removes Gmail 'sent via relay.com' banner when
    // the SMTP auth address differs from the From: address.
    const _authDomain = settings.username ? (settings.username.split('@')[1] || '') : '';
    const _fromDomainH = settings.fromEmail ? (settings.fromEmail.split('@')[1] || '') : '';
    if (_authDomain && _fromDomainH && _authDomain.toLowerCase() !== _fromDomainH.toLowerCase()) {
      headers['Sender'] = settings.username;
    }

    // List-Unsubscribe:
    //   * NEVER include a localhost/127.0.0.1 URL -- private-IP in header = instant spam flag.
    //   * Always prefer a real external tracking URL when available.
    //   * Fall back to mailto: so the header is valid and Gmail shows the one-click button.
    //   * In 'personal' sending mode, omit entirely so Gmail routes to Inbox, not Promotions.
    const sendingMode = this.sendingMode || 'bulk';
    if (sendingMode !== 'personal') {
      const externalUnsubUrl = (!isLocalTracking && campaign)
        ? this.createUnsubscribeUrl(campaign.id, contactId, contact.email)
        : null;
      const mailtoUnsub = (() => {
        const addr = settings.unsubscribeEmail || settings.replyTo || settings.fromEmail;
        return addr ? `mailto:${addr}?subject=Unsubscribe` : null;
      })();
      const listUnsubValue = externalUnsubUrl || mailtoUnsub;
      if (listUnsubValue) {
        headers['List-Unsubscribe'] = `<${listUnsubValue}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    }

    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: contact.email,
      replyTo: settings.replyTo || settings.fromEmail,
      subject: personalizedSubject,
      // Both text and HTML are required -- missing text/plain is a strong spam signal.
      text: plainTextContent || this.htmlToPlainText(personalizedContent),
      html: personalizedContent,
      headers: headers,
      // NOTE: 'envelope' removed -- explicit envelope overrides cause SMTP rejection
      // on many providers (SendGrid, AWS SES, Mailgun) when the envelope sender
      // doesn't match the authenticated username.
    };

    const result = await transporter.sendMail(mailOptions);
    return { 
      ...result, 
      trackingId, 
      variant,
      smtpCode: 250,
      smtpResponse: result.response || 'Message accepted',
      status: 'sent'
    };
  }

  async sendCampaign(campaign, contacts, smtpSettings, onProgress) {
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = campaign.id;
    const reportProgress = typeof onProgress === 'function' ? onProgress : () => {};

    // Filter out blacklisted, unsubscribed, and previously bounced contacts
    const validContacts = [];
    const skippedReasons = { blacklisted: 0, unsubscribed: 0, bounced: 0 };
    
    for (const contact of contacts) {
      if (this.db.isBlacklisted(contact.email)) {
        skippedReasons.blacklisted++;
        continue;
      }
      if (this.db.isUnsubscribed(contact.email)) {
        skippedReasons.unsubscribed++;
        continue;
      }
      // Skip contacts that have hard bounced before
      if (contact.bounceCount >= 2) {
        skippedReasons.bounced++;
        continue;
      }
      validContacts.push(contact);
    }

    // FIX #3: SPF alignment warning
    if (smtpSettings.fromEmail && smtpSettings.host) {
      const fromDomain = (smtpSettings.fromEmail.split('@')[1] || '').toLowerCase().trim();
      const smtpHost   = smtpSettings.host.toLowerCase().trim().replace(/:\d+$/, '');
      const apexOf = (h) => h.split('.').slice(-2).join('.');
      if (fromDomain && smtpHost && apexOf(fromDomain) !== apexOf(smtpHost)) {
        console.warn(
          `[SPF Alignment] fromEmail domain "${fromDomain}" differs from SMTP host "${smtpHost}". ` +
          'SPF alignment may fail — use a fromEmail on the same domain as your SMTP server.'
        );
      }
    }

    // FIX #8: Warmup enforcement -- ramp send volume for new accounts.
    if (smtpSettings.warmUpEnabled && smtpSettings.warmUpStartDate) {
      const startMs   = Date.parse(smtpSettings.warmUpStartDate);
      const daysSince = isNaN(startMs) ? 0 : Math.floor((Date.now() - startMs) / 86400000);
      const configuredMax = smtpSettings.dailyLimit || 500;
      const rampSteps = [50, 100, 200, 400]; // doubles each 7 days
      const stepIndex = Math.min(Math.floor(daysSince / 7), rampSteps.length - 1);
      const warmupLimit = daysSince >= rampSteps.length * 7
        ? configuredMax
        : Math.min(rampSteps[stepIndex], configuredMax);
      console.info(`[Warmup] "${smtpSettings.fromEmail}" day ${daysSince}, effective limit: ${warmupLimit}`);
      if (validContacts.length > warmupLimit) validContacts.splice(warmupLimit);
    }

    const transporter = this.createTransporter(smtpSettings);
    const batchSize = campaign.batchSize || 50;
    const delayMinutes = campaign.delayMinutes || 10;
    const delayBetweenEmails = campaign.delayBetweenEmails || 2000;
    const delayBetweenBatches = delayMinutes * 60 * 1000;

    let sentCount = 0;
    let failedCount = 0;
    let bouncedCount = 0;
    const totalContacts = validContacts.length;
    const skippedCount = contacts.length - validContacts.length;

    try {
    let abTestContacts = { A: [], B: [] };
    if (campaign.isABTest && campaign.subjectB) {
      const testSize = Math.ceil(totalContacts * (campaign.abTestPercent || 10) / 100);
      const shuffled = [...validContacts].sort(() => Math.random() - 0.5);
      abTestContacts.A = shuffled.slice(0, testSize);
      abTestContacts.B = shuffled.slice(testSize, testSize * 2);
    }

    // Update campaign status
    campaign.status = 'running';
    campaign.startedAt = new Date().toISOString();
    campaign.totalEmails = totalContacts;
    this.db.updateCampaign(campaign);

    reportProgress({
      status: 'running',
      total: totalContacts,
      sent: 0,
      failed: 0,
      bounced: 0,
      skipped: skippedCount,
      skippedReasons,
      currentBatch: 1,
      totalBatches: Math.ceil(totalContacts / batchSize)
    });

    // Process contacts
    for (let i = 0; i < totalContacts; i += batchSize) {
      if (this.isStopped) break;

      const batch = validContacts.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(totalContacts / batchSize);

      for (const contact of batch) {
        if (this.isStopped) break;

        while (this.isPaused && !this.isStopped) {
          await this.sleep(1000);
        }

        if (this.isStopped) break;

        // Determine A/B variant
        let subject = campaign.subject;
        let content = campaign.content;
        let variant = 'A';
        
        if (campaign.isABTest) {
          if (abTestContacts.B.some(c => c.id === contact.id)) {
            subject = campaign.subjectB || campaign.subject;
            content = campaign.contentB || campaign.content;
            variant = 'B';
          }
        }

        // Send email and handle result
        let sendResult = {
          status: 'pending',
          smtpCode: null,
          smtpResponse: null,
          failureType: null,
          failureReason: null
        };

        try {
          // Circuit breaker check -- throws if SMTP is in a prolonged failure state
          this._circuitCheck();

          let activeTransporter = transporter;
          let activeSettings = smtpSettings;
          
          const rotation = await this.getNextSmtpAccount();
          if (rotation.account) {
            activeTransporter = this.getTransporter(rotation.account);
            activeSettings = rotation.account;
            this.db.incrementSmtpSentCount(rotation.account.id);
          } else if (rotation.exhausted) {
            const rateLimitError = new Error('All active SMTP accounts have reached their daily limits');
            rateLimitError.code = 'SMTP_DAILY_LIMIT_REACHED';
            throw rateLimitError;
          } else {
            // Rotation unavailable in legacy single-account mode; use the provided settings
            const primaryId = smtpSettings?.id;
            if (primaryId) this.db.incrementSmtpSentCount(primaryId);
          }

          const result = await this.sendSingleEmail(activeTransporter, activeSettings, contact, subject, content, campaign, variant);
          
          // Success -- close the circuit if it was probing
          this._circuitSuccess();

          sentCount++;
          sendResult = {
            status: 'sent',
            smtpCode: result.smtpCode || 250,
            smtpResponse: result.smtpResponse || 'Message accepted',
            failureType: null,
            failureReason: null,
            trackingId: result.trackingId
          };

        } catch (error) {
          // Circuit breaker open -- skip this contact without counting as an SMTP bounce
          if (error.code === 'SMTP_DAILY_LIMIT_REACHED') {
            failedCount++;
            this.isStopped = true;
            sendResult.status = 'failed';
            sendResult.failureType = 'rate_limited';
            sendResult.failureReason = error.message;
            sendResult.smtpResponse = error.message;
          } else if (error.message && error.message.startsWith('Circuit breaker open')) {
            failedCount++;
            sendResult.status = 'failed';
            sendResult.failureType = 'circuit_open';
            sendResult.failureReason = error.message;
          } else {
            // Record the SMTP failure in the circuit breaker
            this._circuitFailure();

            // Parse the error to determine bounce type
            const errorInfo = this.parseSmtpError(error);

            if (errorInfo.failureType === 'hard_bounce') {
              bouncedCount++;
              sendResult.status = 'bounced';
              
              // Update contact bounce count and add to blacklist after 2 hard bounces
              this.db.incrementContactBounce(contact.id, errorInfo.failureReason);
              if (contact.bounceCount >= 1) {
                this.db.addToBlacklist({ 
                  email: contact.email, 
                  reason: `Hard bounce: ${errorInfo.failureReason}`, 
                  source: 'auto_bounce' 
                });
              }
            } else if (errorInfo.failureType === 'soft_bounce') {
              failedCount++;
              sendResult.status = 'soft_bounce';
            } else {
              failedCount++;
              sendResult.status = 'failed';
            }

            sendResult.smtpCode = errorInfo.smtpCode;
            sendResult.smtpResponse = errorInfo.smtpResponse;
            sendResult.failureType = errorInfo.failureType;
            sendResult.failureReason = errorInfo.failureReason;
          }
        }

        // Log the result with full details
        this.db.addCampaignLog({
          campaignId: campaign.id,
          contactId: contact.id,
          email: contact.email,
          status: sendResult.status,
          variant,
          smtpCode: sendResult.smtpCode,
          smtpResponse: sendResult.smtpResponse,
          failureType: sendResult.failureType,
          failureReason: sendResult.failureReason,
          trackingId: sendResult.trackingId,
          error: sendResult.failureReason
        });

        // Update campaign stats
        campaign.sentEmails = sentCount;
        campaign.failedEmails = failedCount;
        campaign.bouncedEmails = bouncedCount;
        this.db.updateCampaign(campaign);

        reportProgress({
          status: this.isPaused ? 'paused' : 'running',
          total: totalContacts,
          sent: sentCount,
          failed: failedCount,
          bounced: bouncedCount,
          skipped: skippedCount,
          currentBatch,
          totalBatches,
          currentEmail: contact.email,
          lastResult: sendResult
        });

        if (!this.isStopped) {
          await this.sleep(this.getRandomDelay(delayBetweenEmails));
        }
      }

      // Batch delay
      if (i + batchSize < totalContacts && !this.isStopped) {
        reportProgress({
          status: 'waiting',
          total: totalContacts,
          sent: sentCount,
          failed: failedCount,
          bounced: bouncedCount,
          currentBatch,
          totalBatches,
          nextBatchIn: delayMinutes
        });
        await this.sleep(delayBetweenBatches);
      }
    }

    // Finalize campaign
    campaign.status = this.isStopped ? 'stopped' : 'completed';
    campaign.completedAt = new Date().toISOString();
    campaign.sentEmails = sentCount;
    campaign.failedEmails = failedCount;
    campaign.bouncedEmails = bouncedCount;
    this.db.updateCampaign(campaign);

    reportProgress({
      status: campaign.status,
      total: totalContacts,
      sent: sentCount,
      failed: failedCount,
      bounced: bouncedCount,
      skipped: skippedCount,
      skippedReasons,
      currentBatch: Math.ceil(totalContacts / batchSize),
      totalBatches: Math.ceil(totalContacts / batchSize)
    });

    this.currentCampaignId = null;

    return { 
      success: true, 
      status: campaign.status, 
      sent: sentCount, 
      failed: failedCount, 
      bounced: bouncedCount,
      total: totalContacts, 
      skipped: skippedCount,
      skippedReasons
    };
    } finally {
      try { transporter.close(); } catch (e) {}

      // Always close transporter pool, even if an unexpected exception was thrown
      this.currentCampaignId = null;
      for (const t of this.transporters.values()) {
        try { t.close(); } catch (e) {}
      }
      this.transporters.clear();
    }
  }

  pause() { this.isPaused = true; return { success: true }; }
  resume() { this.isPaused = false; return { success: true }; }
  stop() {
    this.isStopped = true;
    this.isPaused = false;
    this._resolvePendingWaits();
    return { success: true };
  }

  getState() {
    return {
      isPaused: this.isPaused,
      isStopped: this.isStopped,
      currentCampaignId: this.currentCampaignId,
      currentSmtpIndex: this.currentSmtpIndex,
      trackingBaseUrl: this.trackingBaseUrl,
      sendingMode: this.sendingMode,
      companyAddress: this.companyAddress,
      circuitBreaker: { ...this.circuitBreaker }
    };
  }

  setState(state = {}) {
    if (!state || typeof state !== 'object') {
      return { success: false };
    }

    this.isPaused = !!state.isPaused;
    this.isStopped = !!state.isStopped;
    this.currentCampaignId = state.currentCampaignId || null;
    this.currentSmtpIndex = Number.isInteger(state.currentSmtpIndex) ? state.currentSmtpIndex : 0;
    if (typeof state.trackingBaseUrl === 'string' && state.trackingBaseUrl.trim()) {
      this.trackingBaseUrl = state.trackingBaseUrl.trim();
    }
    if (typeof state.sendingMode === 'string' && state.sendingMode.trim()) {
      this.sendingMode = state.sendingMode.trim();
    }
    if (typeof state.companyAddress === 'string') {
      this.companyAddress = state.companyAddress;
    }
    if (state.circuitBreaker && typeof state.circuitBreaker === 'object') {
      this.circuitBreaker = {
        ...this.circuitBreaker,
        ...state.circuitBreaker
      };
    }

    return { success: true };
  }

  // ============================================================
  // Circuit Breaker -- protects against cascading SMTP failures
  // States: closed (normal) -> open (failing) -> half-open (probe)
  // ============================================================

  _circuitCheck() {
    const cb = this.circuitBreaker;
    if (cb.state === 'closed') return; // fast path

    if (cb.state === 'open') {
      const elapsed = Date.now() - cb.lastFailure;
      if (elapsed >= cb.timeout) {
        cb.state = 'half-open'; // allow one probe
      } else {
        const remainSecs = Math.ceil((cb.timeout - elapsed) / 1000);
        throw new Error(`Circuit breaker open — SMTP failures exceeded threshold. Retry in ${remainSecs}s`);
      }
    }
    // half-open: fall through and allow the send attempt
  }

  _circuitSuccess() {
    const cb = this.circuitBreaker;
    if (cb.state !== 'closed') {
      cb.state = 'closed';
      cb.failures = 0;
      cb.lastFailure = 0;
      cb.timeout = cb.baseTimeout; // reset backoff
    }
  }

  _circuitFailure() {
    const cb = this.circuitBreaker;
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.state === 'half-open' || cb.failures >= cb.threshold) {
      cb.state = 'open';
      // Exponential backoff capped at 10 minutes.
      // trips starts at 1 on the first opening so backoff increases immediately.
      const trips = Math.floor(cb.failures / cb.threshold);
      cb.timeout = Math.min(cb.baseTimeout * Math.pow(2, trips), 10 * 60 * 1000);
    }
  }

  getCircuitBreakerState() {
    return { ...this.circuitBreaker };
  }

  // Generate HMAC token for unsubscribe link security
  generateUnsubscribeToken(email, campaignId) {
    const data = `${email}:${campaignId}`;
    return crypto.createHmac('sha256', this.hmacSecret).update(data).digest('hex');
  }

  // Verify HMAC token on unsubscribe
  verifyUnsubscribeToken(email, campaignId, token) {
    try {
      if (!token) return false;
      const expected = this.generateUnsubscribeToken(email, campaignId);
      if (expected.length !== token.length) return false;
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch (e) {
      return false;
    }
  }

  // Validate email address format
  validateEmail(email) {
    if (!email) return false;
    // RFC 5322 compliant regex for email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return emailRegex.test(email.trim());
  }

  // Validate contact object
  validateContact(contact) {
    if (!contact || typeof contact !== 'object') {
      return { valid: false, error: 'Invalid contact data' };
    }
    if (!contact.email || typeof contact.email !== 'string' || !this.validateEmail(contact.email)) {
      return { valid: false, error: 'Invalid email address' };
    }
    if (contact.firstName && (typeof contact.firstName !== 'string' || contact.firstName.length > 100)) {
      return { valid: false, error: 'Invalid first name' };
    }
    if (contact.lastName && (typeof contact.lastName !== 'string' || contact.lastName.length > 100)) {
      return { valid: false, error: 'Invalid last name' };
    }
    if (contact.company && (typeof contact.company !== 'string' || contact.company.length > 100)) {
      return { valid: false, error: 'Invalid company' };
    }
    if (contact.phone && (typeof contact.phone !== 'string' || contact.phone.length > 20)) {
      return { valid: false, error: 'Invalid phone' };
    }
    return { valid: true };
  }
}

module.exports = EmailService;
