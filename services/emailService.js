const nodemailer = require('nodemailer');

class EmailService {
  constructor(db) {
    this.db = db;
    this.transporter = null;
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = null;
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
      tls: {
        rejectUnauthorized: false
      }
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

  personalizeContent(content, contact) {
    let personalized = content;
    
    personalized = personalized.replace(/\{\{email\}\}/gi, contact.email || '');
    personalized = personalized.replace(/\{\{firstName\}\}/gi, contact.firstName || '');
    personalized = personalized.replace(/\{\{lastName\}\}/gi, contact.lastName || '');
    personalized = personalized.replace(/\{\{fullName\}\}/gi, 
      `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email);
    
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
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Generate unique Message-ID
  generateMessageId(domain) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `<${timestamp}.${random}@${domain}>`;
  }

  async sendSingleEmail(transporter, settings, contact, subject, content) {
    const personalizedSubject = this.personalizeContent(subject, contact);
    const personalizedContent = this.personalizeContent(content, contact);
    const plainTextContent = this.htmlToPlainText(personalizedContent);
    
    // Extract domain from fromEmail for Message-ID
    const domain = settings.fromEmail.split('@')[1] || 'localhost';
    
    // Build headers that improve deliverability
    const headers = {
      'X-Mailer': 'Bulky Email Sender',
      'Message-ID': this.generateMessageId(domain),
      'X-Priority': '3', // Normal priority
      'Precedence': 'bulk'
    };
    
    // Add List-Unsubscribe if unsubscribe email/URL provided
    if (settings.unsubscribeEmail) {
      headers['List-Unsubscribe'] = `<mailto:${settings.unsubscribeEmail}?subject=Unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    } else if (settings.unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${settings.unsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: contact.email,
      replyTo: settings.replyTo || settings.fromEmail,
      subject: personalizedSubject,
      text: plainTextContent,  // Plain text version (important for spam filters)
      html: personalizedContent,
      headers: headers
    };

    return transporter.sendMail(mailOptions);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRandomDelay(baseMs) {
    // Add +/- 20% randomization to look more human
    const variance = baseMs * 0.2;
    return baseMs + (Math.random() * variance * 2 - variance);
  }

  async sendCampaign(campaign, contacts, smtpSettings, onProgress) {
    this.isPaused = false;
    this.isStopped = false;
    this.currentCampaignId = campaign.id;

    const transporter = this.createTransporter(smtpSettings);
    
    const batchSize = campaign.batchSize || 50;
    const delayMinutes = campaign.delayMinutes || 10;
    const delayBetweenEmails = 2000; // 2 seconds between individual emails
    const delayBetweenBatches = delayMinutes * 60 * 1000;

    let sentCount = 0;
    let failedCount = 0;
    const totalContacts = contacts.length;

    // Update campaign status to running
    campaign.status = 'running';
    campaign.startedAt = new Date().toISOString();
    campaign.totalEmails = totalContacts;
    this.db.updateCampaign(campaign);

    onProgress({
      status: 'running',
      total: totalContacts,
      sent: 0,
      failed: 0,
      currentBatch: 1,
      totalBatches: Math.ceil(totalContacts / batchSize)
    });

    // Process in batches
    for (let i = 0; i < totalContacts; i += batchSize) {
      if (this.isStopped) break;

      const batch = contacts.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(totalContacts / batchSize);

      // Process each email in the batch
      for (const contact of batch) {
        if (this.isStopped) break;

        // Wait while paused
        while (this.isPaused && !this.isStopped) {
          await this.sleep(1000);
        }

        if (this.isStopped) break;

        try {
          await this.sendSingleEmail(
            transporter, smtpSettings, contact, 
            campaign.subject, campaign.content
          );
          
          sentCount++;
          
          this.db.addCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            status: 'sent'
          });

        } catch (error) {
          failedCount++;
          
          this.db.addCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            status: 'failed',
            error: error.message
          });
        }

        // Update campaign stats in DB
        campaign.sentEmails = sentCount;
        campaign.failedEmails = failedCount;
        this.db.updateCampaign(campaign);

        // Send progress update
        onProgress({
          status: this.isPaused ? 'paused' : 'running',
          total: totalContacts,
          sent: sentCount,
          failed: failedCount,
          currentBatch,
          totalBatches,
          currentEmail: contact.email
        });

        // Delay between emails (with randomization)
        if (!this.isStopped) {
          await this.sleep(this.getRandomDelay(delayBetweenEmails));
        }
      }

      // Delay between batches (if not the last batch)
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

    // Update campaign final status
    campaign.status = this.isStopped ? 'stopped' : 'completed';
    campaign.completedAt = new Date().toISOString();
    campaign.sentEmails = sentCount;
    campaign.failedEmails = failedCount;
    this.db.updateCampaign(campaign);

    const finalStatus = this.isStopped ? 'stopped' : 'completed';
    
    onProgress({
      status: finalStatus,
      total: totalContacts,
      sent: sentCount,
      failed: failedCount,
      currentBatch: Math.ceil(totalContacts / batchSize),
      totalBatches: Math.ceil(totalContacts / batchSize)
    });

    this.currentCampaignId = null;

    return {
      success: true,
      status: finalStatus,
      sent: sentCount,
      failed: failedCount,
      total: totalContacts
    };
  }

  pause() {
    this.isPaused = true;
    return { success: true };
  }

  resume() {
    this.isPaused = false;
    return { success: true };
  }

  stop() {
    this.isStopped = true;
    this.isPaused = false;
    return { success: true };
  }
}

module.exports = EmailService;
