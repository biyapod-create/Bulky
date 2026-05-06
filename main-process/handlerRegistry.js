const registerBackupHandlers = require('../ipc/registerBackupHandlers');
const registerCampaignHandlers = require('../ipc/registerCampaignHandlers');
const registerContactsHandlers = require('../ipc/registerContactsHandlers');
const registerContentHandlers = require('../ipc/registerContentHandlers');
const registerDataHandlers = require('../ipc/registerDataHandlers');
const registerMessagingHandlers = require('../ipc/registerMessagingHandlers');
const registerOperationsHandlers = require('../ipc/registerOperationsHandlers');
const registerSmtpHandlers = require('../ipc/registerSmtpHandlers');
const registerEntitlementHandlers = require('../ipc/registerEntitlementHandlers');
const registerCloudHandlers = require('../ipc/registerCloudHandlers');
const registerSettingsHandlers = require('../ipc/registerSettingsHandlers');
const registerSupportHandlers = require('../ipc/registerSupportHandlers');
const registerAutomationHandlers = require('../ipc/registerAutomationHandlers');
const registerAccountHandlers = require('../ipc/registerAccountHandlers');

function validateContact(contact) {
  if (!contact || typeof contact !== 'object') {
    return { valid: false, error: 'Invalid contact data' };
  }
  if (!contact.email || typeof contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
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

function registerWindowHandlers({
  safeHandler,
  app,
  appVersion,
  cleanup,
  getMainWindow
}) {
  safeHandler('app:getVersion', () => appVersion);
  safeHandler('window:minimize', () => getMainWindow()?.minimize());
  safeHandler('window:maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  safeHandler('window:close', () => getMainWindow()?.close());
  safeHandler('window:hide', () => getMainWindow()?.hide());
  safeHandler('window:show', () => {
    const mainWindow = getMainWindow();
    mainWindow?.show();
    mainWindow?.focus();
  });
  safeHandler('window:quit', () => {
    app.isQuitting = true;
    cleanup();
    app.quit();
  });
}

function registerCoreDataHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  path,
  getMainWindow,
  automationEngine,
  dripEngine
}) {
  registerContactsHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    path,
    validateContact,
    getMainWindow,
    automationEngine,
    dripEngine
  });

  registerDataHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    getMainWindow
  });
}

function registerContentAndMessagingHandlers({
  safeHandler,
  rateLimitedHandler,
  db,
  dialog,
  fs,
  path,
  emailService,
  verificationService,
  decryptSmtpAccount,
  encryptPassword,
  entitlementService,
  validateRequired,
  getPrimarySmtpAccount,
  scheduledCampaignTimers,
  scheduleNextCampaign,
  logger,
  getMainWindow
}) {
  registerContentHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    path,
    getMainWindow
  });

  registerSmtpHandlers({
    safeHandler,
    db,
    emailService,
    decryptSmtpAccount,
    encryptPassword,
    entitlementService,
    validateRequired,
    getPrimarySmtpAccount
  });

  registerCampaignHandlers({
    safeHandler,
    db,
    validateRequired,
    entitlementService,
    scheduledCampaignTimers,
    scheduleNextCampaign
  });

  registerMessagingHandlers({
    safeHandler,
    rateLimitedHandler,
    db,
    emailService,
    verificationService,
    decryptSmtpAccount,
    logger,
    getMainWindow
  });
}

function registerPlatformSupportHandlers({
  safeHandler,
  db,
  spamService,
  aiService,
  verificationService,
  domainHealthService,
  decryptPassword,
  encryptPassword,
  entitlementService,
  desktopAccountService
}) {
  registerEntitlementHandlers({
    safeHandler,
    entitlementService
  });

  registerAccountHandlers({
    safeHandler,
    desktopAccountService
  });

  registerSupportHandlers({
    safeHandler,
    db,
    spamService,
    aiService,
    verificationService,
    domainHealthService,
    decryptPassword,
    encryptPassword,
    entitlementService
  });
}

function registerSettingsAndOperationsHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  shell,
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
  getMainWindow,
  decryptPassword,
  entitlementService,
  cloudConfigService,
  desktopAccountService,
  hybridCloudService,
  syncService
}) {
  registerSettingsHandlers({
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
    getMainWindow
  });

  registerCloudHandlers({
    safeHandler,
    cloudConfigService,
    desktopAccountService,
    syncTrackingBaseUrl,
    hybridCloudService,
    syncService,
    shell
  });

  registerOperationsHandlers({
    safeHandler,
    db,
    decryptPassword,
    domainHealthService,
    getConfiguredDkimSelectors,
    entitlementService
  });
}

function registerAutomationFeatureHandlers({
  safeHandler,
  db,
  emailService,
  trackingService,
  automationEngine,
  dripEngine
}) {
  registerAutomationHandlers({
    safeHandler,
    db,
    emailService,
    trackingService,
    automationEngine,
    dripEngine
  });
}

function registerSystemHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  app,
  logger,
  emailService,
  cleanup,
  dbPath,
  logDir,
  getMainWindow
}) {
  registerBackupHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    app,
    logger,
    emailService,
    cleanup,
    dbPath,
    logDir,
    getMainWindow
  });
}

function registerAllHandlers(options) {
  registerWindowHandlers(options);
  registerCoreDataHandlers(options);
  registerContentAndMessagingHandlers(options);
  registerPlatformSupportHandlers(options);
  registerSettingsAndOperationsHandlers(options);
  registerAutomationFeatureHandlers(options);
  registerSystemHandlers(options);
}

module.exports = {
  registerAllHandlers,
  registerWindowHandlers,
  validateContact
};
