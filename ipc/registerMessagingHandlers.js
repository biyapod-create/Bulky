const {
  validateEmailSendPayload,
  validateEmailTestPayload,
  validateVerifyBulkInput,
  validateVerifyEmailInput
} = require('./validators');

function persistVerificationResults({ db, logger, results }) {
  const resultArray = Array.isArray(results?.results)
    ? results.results
    : results?.email
      ? [results]
      : [];
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseManualEmails(value) {
  return [...new Set(
    String(value || '')
      .split(/[\n,;]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && EMAIL_RE.test(email))
  )];
}

function normalizeVerificationOptions(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      smtpCheck: false,
      timeout: undefined,
      checkCatchAll: true
    };
  }

  const rawTimeout = Number(input.timeout);
  const timeout = Number.isFinite(rawTimeout)
    ? Math.min(20000, Math.max(2000, Math.round(rawTimeout)))
    : undefined;

  return {
    smtpCheck: !!input.smtpCheck,
    timeout,
    checkCatchAll: input.checkCatchAll !== false
  };
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

    // Prevent two campaigns from running simultaneously -- emailService holds
    // instance-level pause/stop/index state that would conflict.
    if (emailService.currentCampaignId) {
      return { error: 'A campaign is already running. Stop or wait for it to finish first.' };
    }

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
    const verifyOptions = normalizeVerificationOptions(input);
    const validated = validateVerifyEmailInput(emailInput);
    if (validated.error) return { error: validated.error };

    // smtpCheck opt-in: false by default (fast DNS-only), true for deep SMTP probe
    const skipSmtpCheck = !verifyOptions.smtpCheck;
    const result = await verificationService.verifyEmail(validated.value, {
      skipSmtpCheck,
      timeout: verifyOptions.timeout,
      checkCatchAll: verifyOptions.checkCatchAll
    });
    persistVerificationResults({ db, logger, results: result });
    return result;
  });

  rateLimitedHandler('verify:bulk', async (e, input) => {
    const emailInput = Array.isArray(input) ? input : input?.emails;
    const verifyOptions = normalizeVerificationOptions(input);
    const validated = validateVerifyBulkInput(emailInput);
    if (validated.error) return { error: validated.error };

    const skipSmtpCheck = !verifyOptions.smtpCheck;
    const results = await verificationService.verifyBulk(
      validated.value,
      (progress) => {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('verify:progress', progress);
        }
      },
      {
        skipSmtpCheck,
        timeout: verifyOptions.timeout,
        checkCatchAll: verifyOptions.checkCatchAll
      }
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
