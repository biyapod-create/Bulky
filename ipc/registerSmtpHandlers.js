const { validateId, validateSmtpSettings } = require('./validators');

function registerSmtpHandlers({
  safeHandler,
  db,
  emailService,
  decryptSmtpAccount,
  encryptPassword,
  entitlementService,
  validateRequired,
  getPrimarySmtpAccount
}) {
  const sanitizeAccountForRenderer = (account) => {
    if (!account) return account;
    return {
      ...account,
      password: '',
      hasStoredPassword: !!account.password
    };
  };

  const resolveStoredPassword = (account, existingAccount = null) => {
    if ((account?.password || '').trim()) {
      return account;
    }
    if (!existingAccount?.password) {
      return account;
    }

    const decryptedExisting = decryptSmtpAccount(existingAccount);
    return {
      ...account,
      password: decryptedExisting.password || ''
    };
  };

  safeHandler('smtpAccounts:getAll', () => db.getAllSmtpAccounts().map(sanitizeAccountForRenderer));
  safeHandler('smtpAccounts:getActive', () => db.getActiveSmtpAccounts().map(sanitizeAccountForRenderer));
  safeHandler('smtpAccounts:add', (e, account) => {
    const limitCheck = entitlementService?.canAddSmtpAccount?.(db.getAllSmtpAccounts().length);
    if (limitCheck && !limitCheck.allowed) {
      return {
        error: limitCheck.error,
        code: limitCheck.code,
        maxSmtpAccounts: limitCheck.maxSmtpAccounts
      };
    }

    const err = validateRequired(account, ['host', 'username', 'password']);
    if (err) return { error: err };

    const validated = validateSmtpSettings(account, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    return db.addSmtpAccount({ ...validated.value, password: encryptPassword(validated.value.password) });
  });
  safeHandler('smtpAccounts:update', (e, account) => {
    const err = validateRequired(account, ['id', 'host', 'username']);
    if (err) return { error: err };

    const existingAccount = db.getAllSmtpAccounts().find((entry) => entry.id === account.id);
    const resolvedAccount = resolveStoredPassword(account, existingAccount);

    const validated = validateSmtpSettings(resolvedAccount, { requireId: true, requireCredentials: true });
    if (validated.error) return { error: validated.error };

    db.updateSmtpAccount({ ...validated.value, password: encryptPassword(validated.value.password) });
    return { success: true };
  });
  safeHandler('smtpAccounts:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };

    db.deleteSmtpAccount(validated.value);
    return { success: true };
  });
  safeHandler('smtpAccounts:test', (e, account) => {
    const validated = validateSmtpSettings(account, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    return emailService.testConnection(validated.value);
  });

  safeHandler('smtp:get', () => {
    const primaryAccount = getPrimarySmtpAccount(false);
    return primaryAccount ? sanitizeAccountForRenderer(primaryAccount) : null;
  });
  safeHandler('smtp:save', (e, settings) => {
    const primaryAccount = getPrimarySmtpAccount(false);
    if (!primaryAccount) {
      const limitCheck = entitlementService?.canAddSmtpAccount?.(db.getAllSmtpAccounts().length);
      if (limitCheck && !limitCheck.allowed) {
        return {
          error: limitCheck.error,
          code: limitCheck.code,
          maxSmtpAccounts: limitCheck.maxSmtpAccounts
        };
      }
    }

    const resolvedSettings = resolveStoredPassword(settings, primaryAccount);
    const validated = validateSmtpSettings(resolvedSettings, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    const encrypted = { ...validated.value, password: encryptPassword(validated.value.password) };
    if (primaryAccount) {
      encrypted.id = primaryAccount.id;
      encrypted.isDefault = true;
      db.updateSmtpAccount(encrypted);
    } else {
      db.addSmtpAccount({ ...encrypted, isDefault: true });
    }
    return { success: true };
  });
  safeHandler('smtp:test', (e, settings) => {
    const primaryAccount = getPrimarySmtpAccount(false);
    const resolvedSettings = resolveStoredPassword(settings, primaryAccount);
    const validated = validateSmtpSettings(resolvedSettings, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    return emailService.testConnection(validated.value);
  });
}

module.exports = registerSmtpHandlers;
