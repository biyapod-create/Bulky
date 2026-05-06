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
  appVersion,
  dbPath,
  userDataPath,
  getTrackingBaseUrl,
  getTrackingHealth,
  getPrimarySmtpAccount,
  cloudConfigService,
  refreshTrackingServerBinding,
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
  safeHandler('settings:getDiagnostics', () => {
    const readJsonSetting = (key, fallback = {}) => {
      try {
        const raw = db.getSetting(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };

    const smtpAccounts = (db.getAllSmtpAccounts?.() || []).map((account) => decryptSmtpAccount(account));
    const primaryAccount = typeof getPrimarySmtpAccount === 'function'
      ? decryptSmtpAccount(getPrimarySmtpAccount(false) || {})
      : smtpAccounts.find((account) => account?.isDefault) || smtpAccounts[0] || null;
    const aiSettings = readJsonSetting('ai', {});
    const deliverability = readJsonSetting('deliverability', {});
    const trackingHealth = typeof getTrackingHealth === 'function' ? getTrackingHealth() : {};
    const cloudStatus = cloudConfigService?.getStatus?.() || {
      trackingBaseUrl: '',
      cloudflare: { apiConfigured: false, trackingConfigured: false, updatesConfigured: false },
      supabase: { configured: false, url: '', hasAnonKey: false },
      paystack: { configured: false, hasPublicKey: false, checkoutBaseUrl: '' },
      hybridReady: false
    };
    const fileExists = !!dbPath && fs.existsSync(dbPath);
    const sizeBytes = fileExists ? fs.statSync(dbPath).size : 0;

    return {
      version: appVersion || '6.x',
      database: {
        path: dbPath || '',
        userDataPath: userDataPath || '',
        exists: fileExists,
        sizeBytes
      },
      tracking: {
        baseUrl: typeof getTrackingBaseUrl === 'function' ? getTrackingBaseUrl() : '',
        listening: !!trackingHealth.listening,
        localBaseUrl: trackingHealth.localBaseUrl || '',
        publicBaseUrl: trackingHealth.publicBaseUrl || '',
        activeSource: trackingHealth.source || 'local',
        port: trackingHealth.port || null,
        configuredDomain: String(deliverability.trackingDomain || '').trim(),
        cloudConfiguredBaseUrl: cloudStatus.trackingBaseUrl || ''
      },
      smtp: {
        totalAccounts: smtpAccounts.length,
        activeAccounts: smtpAccounts.filter((account) => account?.isActive).length,
        primaryFromEmail: primaryAccount?.fromEmail || primaryAccount?.username || '',
        primaryReplyTo: primaryAccount?.replyTo || '',
        defaultAccountName: primaryAccount?.name || ''
      },
      ai: {
        enabled: aiSettings.enabled !== false && aiSettings.enabled !== 'false',
        provider: aiSettings.provider || 'openrouter',
        model: aiSettings.model || '',
        hasApiKey: !!aiSettings.apiKey,
        lmstudioBaseUrl: aiSettings.lmstudioBaseUrl || 'http://localhost:1234/v1'
      },
      deliverability: {
        sendingMode: deliverability.sendingMode || 'bulk',
        companyAddress: deliverability.companyAddress || '',
        spfConfigured: !!deliverability.spfConfigured,
        dkimConfigured: !!deliverability.dkimConfigured,
        dmarcConfigured: !!deliverability.dmarcConfigured
      },
      cloud: cloudStatus,
      backups: {
        count: db.getBackupHistory?.()?.length || 0
      }
    };
  });
  safeHandler('settings:saveDeliverability', (e, settings) => {
    const validated = validateDeliverabilitySettings(settings);
    if (validated.error) return { error: validated.error };

    db.setSetting('deliverability', JSON.stringify(validated.value));
    syncTrackingBaseUrl(validated.value);
    if (typeof refreshTrackingServerBinding === 'function') {
      refreshTrackingServerBinding(validated.value);
    }
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

    let data;
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      data = JSON.parse(content);
    } catch (e) {
      return { error: 'Invalid import file: could not parse JSON' };
    }

    // Validate top-level structure -- must be a plain object with known keys only
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { error: 'Invalid import file: expected a JSON object' };
    }
    const allowedKeys = new Set(['settings', 'smtpAccounts', 'templates', 'exportedAt']);
    const unknownKeys = Object.keys(data).filter(k => !allowedKeys.has(k));
    if (unknownKeys.length > 0) {
      return { error: `Invalid import file: unexpected fields: ${unknownKeys.join(', ')}` };
    }
    if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
      return { error: 'Invalid import file: settings must be an object' };
    }
    if (data.smtpAccounts !== undefined && !Array.isArray(data.smtpAccounts)) {
      return { error: 'Invalid import file: smtpAccounts must be an array' };
    }
    if (data.templates !== undefined && !Array.isArray(data.templates)) {
      return { error: 'Invalid import file: templates must be an array' };
    }

    if (data.settings) db.saveAllSettings(data.settings);
    if (data.smtpAccounts) {
      for (const account of data.smtpAccounts) {
        if (!account || typeof account !== 'object' || !account.host) continue;
        try {
          db.addSmtpAccount({ ...account, password: encryptPassword(account.password || '') });
        } catch (error) {
          console.warn('Import SMTP account skipped:', error.message);
        }
      }
    }
    if (data.templates) {
      for (const template of data.templates) {
        if (!template || typeof template !== 'object' || !template.name) continue;
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
