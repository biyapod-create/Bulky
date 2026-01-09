const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor(db) {
    this.db = db;
    this.transporters = new Map();
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = null;
    this.currentSmtpIndex = 0;

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
    return nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: settings.password
      },
      tls: { rejectUnauthorized: false },
      pool: true,
      maxConnections: 5,
      maxMessages: 100
    });
  }

  async testConnection(settings) {
    try {
      const transporter = this.createTransporter(settings);
      await transporter.verify();
      return { success: true, message: 'Connection successful!' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
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
  processSpintax(text) {
    if (!text) return text;
    return text.replace(/\{([^{}]+)\}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  // Advanced personalization with conditionals and fallbacks
  personalizeContent(content, contact, campaign = null) {
    let personalized = content;
    
    // Process spintax FIRST (before other replacements)
    personalized = this.processSpintax(personalized);
    
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

    // Unsubscribe link placeholder
    if (campaign && campaign.id) {
      const unsubLink = `{{unsubscribeUrl}}?email=${encodeURIComponent(contact.email)}&cid=${campaign.id}`;
      personalized = personalized.replace(/\{\{unsubscribeLink\}\}/gi, unsubLink);
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
    return 'http://127.0.0.1:3847';
  }

  addOpenTracking(html, trackingId, campaignId, contactId) {
    const trackingUrl = `${this.getTrackingBaseUrl()}/track/open/${campaignId}/${contactId || 'unknown'}/${trackingId}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
    if (html.toLowerCase().includes('</body>')) {
      return html.replace(/<\/body>/i, `${trackingPixel}</body>`);
    }
    return html + trackingPixel;
  }

  addClickTracking(html, trackingId, campaignId, contactId) {
    const baseUrl = this.getTrackingBaseUrl();
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

  addUnsubscribeLink(html, campaignId, contactId, email) {
    const unsubUrl = `${this.getTrackingBaseUrl()}/unsubscribe/${campaignId}/${contactId || 'unknown'}?email=${encodeURIComponent(email)}`;
    let processed = html.replace(/\{\{unsubscribeLink\}\}/gi, unsubUrl);
    processed = processed.replace(/\{\{unsubscribeUrl\}\}/gi, unsubUrl);
    return processed;
  }

  async getNextSmtpAccount() {
    try {
      const accounts = this.db.getActiveSmtpAccounts();
      if (!accounts || accounts.length === 0) return null;
      
      for (let i = 0; i < accounts.length; i++) {
        const idx = (this.currentSmtpIndex + i) % accounts.length;
        const account = accounts[idx];
        if (account.sentToday < account.dailyLimit) {
          this.currentSmtpIndex = (idx + 1) % accounts.length;
          return account;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  getTransporter(account) {
    if (!this.transporters.has(account.id)) {
      this.transporters.set(account.id, this.createTransporter(account));
    }
    return this.transporters.get(account.id);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    
    if (campaign && campaign.id) {
      // Add tracking with contact ID for accurate attribution
      personalizedContent = this.addOpenTracking(personalizedContent, trackingId, campaign.id, contactId);
      personalizedContent = this.addClickTracking(personalizedContent, trackingId, campaign.id, contactId);
      personalizedContent = this.addUnsubscribeLink(personalizedContent, campaign.id, contactId, contact.email);
    }
    
    const plainTextContent = this.htmlToPlainText(personalizedContent);
    const domain = settings.fromEmail.split('@')[1] || 'localhost';
    
    const headers = {
      'X-Mailer': 'Bulky Email Sender v3.2',
      'Message-ID': this.generateMessageId(domain),
      'X-Priority': '3',
      'Precedence': 'bulk',
      'X-Campaign-ID': campaign?.id || 'direct',
      'X-Tracking-ID': trackingId
    };
    
    // Add List-Unsubscribe header for Gmail/email clients
    const unsubUrl = campaign ? `${this.getTrackingBaseUrl()}/unsubscribe/${campaign.id}/${contactId}?email=${encodeURIComponent(contact.email)}` : null;
    if (unsubUrl) {
      headers['List-Unsubscribe'] = `<${unsubUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    } else if (settings.unsubscribeEmail) {
      headers['List-Unsubscribe'] = `<mailto:${settings.unsubscribeEmail}?subject=Unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: contact.email,
      replyTo: settings.replyTo || settings.fromEmail,
      subject: personalizedSubject,
      text: plainTextContent,
      html: personalizedContent,
      headers: headers
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

    const transporter = this.createTransporter(smtpSettings);
    const batchSize = campaign.batchSize || 50;
    const delayMinutes = campaign.delayMinutes || 10;
    const delayBetweenEmails = 2000;
    const delayBetweenBatches = delayMinutes * 60 * 1000;

    let sentCount = 0;
    let failedCount = 0;
    let bouncedCount = 0;
    const totalContacts = validContacts.length;
    const skippedCount = contacts.length - validContacts.length;

    // A/B Testing setup
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

    onProgress({
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
          let activeTransporter = transporter;
          let activeSettings = smtpSettings;
          
          const rotatingAccount = await this.getNextSmtpAccount();
          if (rotatingAccount) {
            activeTransporter = this.getTransporter(rotatingAccount);
            activeSettings = rotatingAccount;
            this.db.incrementSmtpSentCount(rotatingAccount.id);
          }

          const result = await this.sendSingleEmail(activeTransporter, activeSettings, contact, subject, content, campaign, variant);
          
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

        onProgress({
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
        onProgress({
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

    onProgress({
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
    this.transporters.clear();

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
  }

  pause() { this.isPaused = true; return { success: true }; }
  resume() { this.isPaused = false; return { success: true }; }
  stop() { this.isStopped = true; this.isPaused = false; return { success: true }; }
}

module.exports = EmailService;
