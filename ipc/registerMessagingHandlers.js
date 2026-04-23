const {
  validateEmailSendPayload,
  validateEmailTestPayload,
  validateVerifyBulkInput,
  validateVerifyEmailInput
} = require('./validators');

function persistVerificationResults({ db, logger, results }) {
  const resultArray = results?.results || [];
  if (resultArray.length === 0) return;

  try {
    for (const result of resultArray) {
      if (!result.email || !result.status) continue;

      const contact = db._get('SELECT * FROM contacts WHERE email = ?', [result.email.toLowerCase()]);
      if (!contact) continue;

      db._run(
        `UPDATE contacts SET verificationStatus = ?, verificationScore = ?,
         verificationDetails = ?, updatedAt = datetime('now') WHERE id = ?`,
        [result.status, result.score || 0, JSON.stringify(result.details || {}), contact.id]
      );
    }
  } catch (error) {
    logger.error('Failed to save verification results to contacts', { error: error.message });
  }
}

function parseManualEmails(value) {
  return [...new Set(
    String(value || '')
      .split(/[\n,;]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function registerMessagingHandlers({
  safeHandler,
  rateLimitedHandler,
  db,
  emailService,
  verificationService,
  decryptSmtpAccount,
  logger,
  getMainWindow
}) {
  rateLimitedHandler('email:send', async (e, data) => {
    const validated = validateEmailSendPayload(data);
    if (validated.error) return { error: validated.error };

    // Support both renderer payload formats:
    //   Legacy (Campaigns.js): { campaign, contacts, settings }
    //   New format:            { campaignId, filter, smtpAccountId }
    let campaign;
    let contacts;
    let smtpSettings;

    if (validated.value.campaign && validated.value.contacts && validated.value.settings) {
      // Renderer has already resolved campaign, contacts, and SMTP - use directly.
      campaign = validated.value.campaign;
      contacts = validated.value.contacts;
      smtpSettings = validated.value.settings;
    } else {
      const { campaignId, filter, smtpAccountId } = validated.value;
      campaign = db._get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
      if (!campaign) return { error: 'Campaign not found' };

      const manualEmails = parseManualEmails(campaign.manualEmails);
      if (manualEmails.length > 0) {
        const matchedContacts = db.getContactsForCampaign({ emails: manualEmails });
        const matchedContactsByEmail = new Map(
          matchedContacts.map((contact) => [String(contact.email || '').toLowerCase(), contact])
        );
        contacts = manualEmails.map((email, index) => {
          const matchedContact = matchedContactsByEmail.get(email);
          return matchedContact || {
            id: `manual-${campaign.id}-${index}`,
            email,
            firstName: '',
            lastName: '',
            company: '',
            tags: []
          };
        });
      } else {
        contacts = db.getContactsForCampaign(filter || {
          listId: campaign.listId,
          tag: campaign.tagFilter,
          verificationStatus: campaign.verificationFilter
        });
      }

      if (smtpAccountId) {
        smtpSettings = decryptSmtpAccount(db._get('SELECT * FROM smtp_accounts WHERE id = ?', [smtpAccountId]));
      }
      if (!smtpSettings) {
        const accounts = db.getActiveSmtpAccounts();
        if (accounts.length === 0) return { error: 'No active SMTP accounts configured' };
        smtpSettings = decryptSmtpAccount(accounts[0]);
      }
    }

    if (!smtpSettings || !smtpSettings.host) return { error: 'No valid SMTP settings provided' };
    if (!contacts || contacts.length === 0) return { error: 'No contacts to send to' };

    logger.logCampaign('send_start', campaign.id, {
      name: campaign.name,
      contactCount: contacts.length,
      smtp: smtpSettings.fromEmail
    });

    const result = await emailService.sendCampaign(campaign, contacts, smtpSettings, (progress) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('email:progress', progress);
      }
    });

    logger.logCampaign('send_complete', campaign.id, {
      sent: result.sent,
      failed: result.failed,
      bounced: result.bounced
    });

    return result;
  });

  safeHandler('email:testSend', async (e, payload) => {
    const validated = validateEmailTestPayload(payload);
    if (validated.error) return { success: false, message: validated.error };

    const { settings, toEmail, subject, content } = validated.value;
    const testContact = { id: 'test', email: toEmail, firstName: 'Test', lastName: 'User' };
    const transporter = emailService.createTransporter(settings);

    try {
      await emailService.sendSingleEmail(transporter, settings, testContact, subject, content);
      return { success: true, message: `Test email sent to ${toEmail}` };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      try {
        transporter.close();
      } catch {}
    }
  });

  safeHandler('email:pause', () => emailService.pause());
  safeHandler('email:resume', () => emailService.resume());
  safeHandler('email:stop', () => emailService.stop());
  safeHandler('email:circuitState', () => emailService.getCircuitBreakerState());

  safeHandler('verify:email', async (e, input) => {
    const emailInput = typeof input === 'string' ? input : input?.email;
    const smtpCheck = typeof input === 'object' && input !== null ? !!input.smtpCheck : false;
    const validated = validateVerifyEmailInput(emailInput);
    if (validated.error) return { error: validated.error };

    // smtpCheck opt-in: false by default (fast DNS-only), true for deep SMTP probe
    const skipSmtpCheck = !smtpCheck;
    return verificationService.verifyEmail(validated.value, { skipSmtpCheck });
  });

  rateLimitedHandler('verify:bulk', async (e, input) => {
    const emailInput = Array.isArray(input) ? input : input?.emails;
    const smtpCheck = typeof input === 'object' && input !== null && !Array.isArray(input)
      ? !!input.smtpCheck
      : false;
    const validated = validateVerifyBulkInput(emailInput);
    if (validated.error) return { error: validated.error };

    const skipSmtpCheck = !smtpCheck;
    const results = await verificationService.verifyBulk(
      validated.value,
      (progress) => {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('verify:progress', progress);
        }
      },
      { skipSmtpCheck }
    );

    persistVerificationResults({ db, logger, results });
    return results;
  });

  safeHandler('verify:pause', () => {
    verificationService.pause();
    return { success: true };
  });
  safeHandler('verify:resume', () => {
    verificationService.resume();
    return { success: true };
  });
  safeHandler('verify:stop', () => {
    verificationService.stop();
    return { success: true };
  });
}

module.exports = registerMessagingHandlers;
