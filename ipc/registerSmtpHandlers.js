const { validateId, validateSmtpSettings } = require('./validators');

function registerSmtpHandlers({
  safeHandler,
  db,
  emailService,
  decryptSmtpAccount,
  encryptPassword,
  validateRequired,
  getPrimarySmtpAccount
}) {
  safeHandler('smtpAccounts:getAll', () => db.getAllSmtpAccounts().map(decryptSmtpAccount));
  safeHandler('smtpAccounts:getActive', () => db.getActiveSmtpAccounts().map(decryptSmtpAccount));
  safeHandler('smtpAccounts:add', (e, account) => {
    const err = validateRequired(account, ['host', 'username', 'password']);
    if (err) return { error: err };

    const validated = validateSmtpSettings(account, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    return db.addSmtpAccount({ ...validated.value, password: encryptPassword(validated.value.password) });
  });
  safeHandler('smtpAccounts:update', (e, account) => {
    const err = validateRequired(account, ['id', 'host', 'username', 'password']);
    if (err) return { error: err };

    const validated = validateSmtpSettings(account, { requireId: true, requireCredentials: true });
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
    return primaryAccount ? decryptSmtpAccount(primaryAccount) : null;
  });
  safeHandler('smtp:save', (e, settings) => {
    const validated = validateSmtpSettings(settings, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    const encrypted = { ...validated.value, password: encryptPassword(validated.value.password) };
    const primaryAccount = getPrimarySmtpAccount(false);
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
    const validated = validateSmtpSettings(settings, { requireCredentials: true });
    if (validated.error) return { error: validated.error };

    return emailService.testConnection(validated.value);
  });
}

module.exports = registerSmtpHandlers;
