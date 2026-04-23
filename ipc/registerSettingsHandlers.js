const {
  validateAppSettings,
  validateDeliverabilitySettings,
  validateDomainInput,
  validateWarmupSettings
} = require('./validators');

function registerSettingsHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  encryptPassword,
  decryptSmtpAccount,
  syncTrackingBaseUrl,
  domainHealthService,
  getConfiguredDkimSelectors,
  emailService,
  getMainWindow
}) {
  safeHandler('settings:get', () => db.getAllSettings());
  safeHandler('settings:save', (e, settings) => {
    const validated = validateAppSettings(settings);
    if (validated.error) return { error: validated.error };

    db.saveAllSettings(validated.value);
    return { success: true };
  });

  safeHandler('settings:getWarmup', () => {
    const raw = db.getSetting('warmup');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  safeHandler('settings:saveWarmup', (e, settings) => {
    const validated = validateWarmupSettings(settings);
    if (validated.error) return { error: validated.error };

    db.setSetting('warmup', JSON.stringify(validated.value));
    return { success: true };
  });

  safeHandler('settings:getDeliverability', () => {
    const raw = db.getSetting('deliverability');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  safeHandler('settings:saveDeliverability', (e, settings) => {
    const validated = validateDeliverabilitySettings(settings);
    if (validated.error) return { error: validated.error };

    db.setSetting('deliverability', JSON.stringify(validated.value));
    syncTrackingBaseUrl(validated.value);
    // Wire sending mode and company address to emailService immediately so
    // the change takes effect for the current session without requiring a restart.
    if (emailService && typeof emailService.setSendingMode === 'function') {
      emailService.setSendingMode(validated.value.sendingMode || 'bulk');
    }
    if (emailService && typeof emailService.setCompanyAddress === 'function') {
      emailService.setCompanyAddress(validated.value.companyAddress || '');
    }
    return { success: true };
  });

  safeHandler('settings:checkDomain', async (e, domain) => {
    const validated = validateDomainInput(domain);
    if (validated.error) return { error: validated.error };

    return domainHealthService.checkDomain(validated.value, {
      selectors: getConfiguredDkimSelectors(validated.value)
    });
  });

  safeHandler('settings:exportAll', async () => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Settings',
      defaultPath: 'bulky-settings.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (result.canceled) return { canceled: true };
    const allSettings = db.getAllSettings();
    const smtpAccounts = db.getAllSmtpAccounts();
    const templates = db.getAllTemplates();
    const decryptedAccounts = smtpAccounts.map((account) => decryptSmtpAccount(account));
    const exportData = {
      settings: allSettings,
      smtpAccounts: decryptedAccounts,
      templates,
      exportedAt: new Date().toISOString()
    };
    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
    return { success: true, path: result.filePath };
  });

  safeHandler('settings:importAll', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Settings',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    const data = JSON.parse(content);
    if (data.settings) db.saveAllSettings(data.settings);
    if (data.smtpAccounts) {
      for (const account of data.smtpAccounts) {
        try {
          db.addSmtpAccount({ ...account, password: encryptPassword(account.password || '') });
        } catch (error) {
          console.warn('Import SMTP account skipped:', error.message);
        }
      }
    }
    if (data.templates) {
      for (const template of data.templates) {
        try {
          db.addTemplate(template);
        } catch (error) {
          console.warn('Import template skipped:', error.message);
        }
      }
    }
    return { success: true };
  });
}

module.exports = registerSettingsHandlers;
