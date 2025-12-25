const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor(db) {
    this.db = db;
    this.transporters = new Map(); // Multiple SMTP accounts
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = null;
    this.currentSmtpIndex = 0;
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

  // Generate tracking ID for opens/clicks
  generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Advanced personalization with conditionals and fallbacks
  personalizeContent(content, contact, campaign = null) {
    let personalized = content;
    
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

    // Uppercase/Lowercase modifiers: {{firstName:upper}} {{lastName:lower}} {{company:capitalize}}
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

  // Strip HTML tags for plain text version
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

  // Generate unique Message-ID
  generateMessageId(domain) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `<${timestamp}.${random}@${domain}>`;
  }

  // Add tracking pixel for open tracking
  addOpenTracking(html, trackingId, campaignId) {
    const trackingPixel = `<img src="{{trackingDomain}}/track/open/${campaignId}/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
    
    // Insert before </body> or at end
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    return html + trackingPixel;
  }

  // Wrap links for click tracking
  addClickTracking(html, trackingId, campaignId) {
    return html.replace(/<a\s+([^>]*href=")([^"]+)(")/gi, (match, before, url, after) => {
      // Skip mailto: and tel: links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.includes('unsubscribe')) {
        return match;
      }
      const encodedUrl = encodeURIComponent(url);
      const trackedUrl = `{{trackingDomain}}/track/click/${campaignId}/${trackingId}?url=${encodedUrl}`;
      return `<a ${before}${trackedUrl}${after}`;
    });
  }


  // Get next available SMTP account (rotation)
  async getNextSmtpAccount() {
    try {
      const accounts = this.db.getActiveSmtpAccounts();
      if (!accounts || accounts.length === 0) {
        return null;
      }
      
      // Simple round-robin with daily limit check
      for (let i = 0; i < accounts.length; i++) {
        const idx = (this.currentSmtpIndex + i) % accounts.length;
        const account = accounts[idx];
        
        if (account.sentToday < account.dailyLimit) {
          this.currentSmtpIndex = (idx + 1) % accounts.length;
          return account;
        }
      }
      
      return null; // All accounts at limit
    } catch (e) {
      return null;
    }
  }

  // Get or create transporter for account
  getTransporter(account) {
    if (!this.transporters.has(account.id)) {
      this.transporters.set(account.id, this.createTransporter(account));
    }
    return this.transporters.get(account.id);
  }

  async sendSingleEmail(transporter, settings, contact, subject, content, campaign = null, variant = 'A') {
    const personalizedSubject = this.personalizeContent(subject, contact, campaign);
    let personalizedContent = this.personalizeContent(content, contact, campaign);
    
    // Add tracking if enabled
    const trackingId = this.generateTrackingId();
    if (campaign && campaign.id) {
      // Note: In production, replace {{trackingDomain}} with actual domain
      personalizedContent = this.addOpenTracking(personalizedContent, trackingId, campaign.id);
      personalizedContent = this.addClickTracking(personalizedContent, trackingId, campaign.id);
    }
    
    const plainTextContent = this.htmlToPlainText(personalizedContent);
    const domain = settings.fromEmail.split('@')[1] || 'localhost';
    
    // Headers for deliverability
    const headers = {
      'X-Mailer': 'Bulky Email Sender v3.0',
      'Message-ID': this.generateMessageId(domain),
      'X-Priority': '3',
      'Precedence': 'bulk',
      'X-Campaign-ID': campaign?.id || 'direct',
      'X-Tracking-ID': trackingId
    };
    
    // List-Unsubscribe header (required by Gmail for bulk)
    if (settings.unsubscribeEmail) {
      headers['List-Unsubscribe'] = `<mailto:${settings.unsubscribeEmail}?subject=Unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    } else if (settings.unsubscribeUrl) {
      const unsub = `${settings.unsubscribeUrl}?email=${encodeURIComponent(contact.email)}`;
      headers['List-Unsubscribe'] = `<${unsub}>`;
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
    return { ...result, trackingId, variant };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRandomDelay(baseMs) {
    const variance = baseMs * 0.25;
    return baseMs + (Math.random() * variance * 2 - variance);
  }


  async sendCampaign(campaign, contacts, smtpSettings, onProgress) {
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = campaign.id;

    // Check for blacklisted/unsubscribed contacts
    const validContacts = [];
    for (const contact of contacts) {
      const isBlacklisted = this.db.isBlacklisted(contact.email);
      const isUnsubscribed = this.db.isUnsubscribed(contact.email);
      if (!isBlacklisted && !isUnsubscribed) {
        validContacts.push(contact);
      }
    }

    const transporter = this.createTransporter(smtpSettings);
    const batchSize = campaign.batchSize || 50;
    const delayMinutes = campaign.delayMinutes || 10;
    const delayBetweenEmails = 2000;
    const delayBetweenBatches = delayMinutes * 60 * 1000;

    let sentCount = 0;
    let failedCount = 0;
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
      skipped: skippedCount,
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

        try {
          // Try to get rotating SMTP account first
          let activeTransporter = transporter;
          let activeSettings = smtpSettings;
          
          const rotatingAccount = await this.getNextSmtpAccount();
          if (rotatingAccount) {
            activeTransporter = this.getTransporter(rotatingAccount);
            activeSettings = rotatingAccount;
            this.db.incrementSmtpSentCount(rotatingAccount.id);
          }

          await this.sendSingleEmail(activeTransporter, activeSettings, contact, subject, content, campaign, variant);
          sentCount++;
          
          this.db.addCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            status: 'sent',
            variant
          });

        } catch (error) {
          failedCount++;
          
          // Auto-blacklist hard bounces
          if (error.message.includes('550') || error.message.includes('User unknown') || 
              error.message.includes('does not exist') || error.message.includes('Invalid recipient')) {
            this.db.addToBlacklist({ email: contact.email, reason: 'Hard bounce', source: 'auto' });
          }
          
          this.db.addCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            status: 'failed',
            variant,
            error: error.message
          });
        }

        campaign.sentEmails = sentCount;
        campaign.failedEmails = failedCount;
        this.db.updateCampaign(campaign);

        onProgress({
          status: this.isPaused ? 'paused' : 'running',
          total: totalContacts,
          sent: sentCount,
          failed: failedCount,
          skipped: skippedCount,
          currentBatch,
          totalBatches,
          currentEmail: contact.email
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
          currentBatch,
          totalBatches,
          nextBatchIn: delayMinutes
        });
        await this.sleep(delayBetweenBatches);
      }
    }

    // Finalize
    campaign.status = this.isStopped ? 'stopped' : 'completed';
    campaign.completedAt = new Date().toISOString();
    campaign.sentEmails = sentCount;
    campaign.failedEmails = failedCount;
    this.db.updateCampaign(campaign);

    onProgress({
      status: campaign.status,
      total: totalContacts,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      currentBatch: Math.ceil(totalContacts / batchSize),
      totalBatches: Math.ceil(totalContacts / batchSize)
    });

    this.currentCampaignId = null;
    this.transporters.clear();

    return { success: true, status: campaign.status, sent: sentCount, failed: failedCount, total: totalContacts, skipped: skippedCount };
  }

  pause() { this.isPaused = true; return { success: true }; }
  resume() { this.isPaused = false; return { success: true }; }
  stop() { this.isStopped = true; this.isPaused = false; return { success: true }; }
}

module.exports = EmailService;
