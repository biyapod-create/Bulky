const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { screen } = require('electron');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { version: APP_VERSION } = require('./package.json');

// Load .env.local into process.env at startup (dev + packaged builds)
(function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* file absent in packaged build — credentials set via Settings UI */ }
})();

const Database = require('./database/db');
const EmailService = require('./services/emailService');
const VerificationService = require('./services/verificationService');
const SpamService = require('./services/spamService');
const TrackingService = require('./services/trackingService');
const DomainHealthService = require('./services/domainHealthService');
const AIService = require('./services/aiService');
const Logger = require('./services/logger');
const ServiceManager = require('./services/serviceManager');
const CrashReporter = require('./services/crashReporter');
const CloudConfigService = require('./services/cloudConfigService');
const { EntitlementService } = require('./services/entitlementService');
const DesktopAccountService = require('./services/desktopAccountService');
const HybridCloudService = require('./services/hybridCloudService');
const SyncService = require('./services/syncService');
const { createWindow: createAppWindow, createTray: createAppTray } = require('./main-process/windowShell');
const { registerAllHandlers: registerAppHandlers } = require('./main-process/handlerRegistry');
const AutomationEngine = require('./services/automationEngine');
const DripEngine = require('./services/dripEngine');
const { autoUpdater } = require('electron-updater');

// ============================================================
// Process-level crash handlers with auto-recovery
// ============================================================
let crashReporter = null;
let stabilityMetrics = {
  crashes: 0,
  lastCrash: null,
  memoryWarnings: 0,
  dbErrors: 0,
  serviceFailures: 0,
  errorCounts: {}, // Track error types for pattern analysis
  lastErrorTime: null,
  errorSeverity: 'info' // info, warning, error, critical
};

// Enhanced error severity classification function
function classifyErrorSeverity(error) {
  if (!error) return 'info';

  const message = (error.message || '').toLowerCase();
  const stack = (error.stack || '').toLowerCase();

  // Critical errors - immediate attention needed
  if (stack.includes('database') || stack.includes('disk') ||
      message.includes('fatal') || message.includes('critical')) {
    return 'critical';
  }

  // High severity - likely to cause failures
  if (stack.includes('connection') || stack.includes('timeout') ||
      message.includes('network') || message.includes('timeout')) {
    return 'error';
  }

  // Medium severity - should be monitored
  if (stack.includes('warning') || message.includes('warning') ||
      message.includes('deprecated')) {
    return 'warning';
  }

  return 'info';
}

process.on('uncaughtException', (error) => {
  stabilityMetrics.crashes++;
  stabilityMetrics.lastCrash = new Date().toISOString();
  stabilityMetrics.lastErrorTime = Date.now();

  // Classify error severity
  stabilityMetrics.errorSeverity = classifyErrorSeverity(error);

  // Track error types for pattern analysis
  const errorType = error.name || 'UnknownError';
  stabilityMetrics.errorCounts[errorType] = (stabilityMetrics.errorCounts[errorType] || 0) + 1;

  console.error(`[${stabilityMetrics.errorSeverity.toUpperCase()}] ${errorType}:`, error.message, error.stack);
  try { crashReporter?.report('uncaughtException', error); } catch (e) {}
  try { logger?.error('Uncaught exception', {
    message: error.message,
    stack: error.stack,
    severity: stabilityMetrics.errorSeverity,
    errorType: errorType
  }); } catch (e) {}

  // Flush DB and clean up before exit so in-progress writes aren't lost
  try { cleanup(); } catch (e) {}

  // Attempt graceful shutdown
  setTimeout(() => {
    app.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason) => {
  stabilityMetrics.lastErrorTime = Date.now();
  stabilityMetrics.errorSeverity = classifyErrorSeverity(reason instanceof Error ? reason : new Error(String(reason)));

  const error = reason instanceof Error ? reason : new Error(String(reason));
  const errorType = error.name || 'UnknownError';
  stabilityMetrics.errorCounts[errorType] = (stabilityMetrics.errorCounts[errorType] || 0) + 1;

  try { crashReporter?.report('unhandledRejection', error); } catch (e) {}
  try { logger?.error('Unhandled rejection', {
    reason: error.message,
    stack: error.stack,
    severity: stabilityMetrics.errorSeverity,
    errorType: errorType
  }); } catch (e) {}
});

process.on('warning', (warning) => {
  stabilityMetrics.errorSeverity = 'warning';

  if (warning.name === 'MaxListenersExceededWarning') {
    logger?.warn('Max listeners exceeded - potential memory leak', {
      warning: warning.message,
      severity: 'warning'
    });
  }

  // Log all warnings with severity
  try { logger?.warn('Process warning', {
    warning: warning.message,
    stack: warning.stack,
    severity: 'warning'
  }); } catch (e) {}
});

// Memory monitoring — started in initializeServices() after logger is ready
let memMonitorInterval = null;
function startMemoryMonitor() {
  memMonitorInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    if (heapUsedMB > 500) { // High memory usage warning
      stabilityMetrics.memoryWarnings++;
      logger?.warn('High memory usage detected', {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: Math.round(memUsage.external / 1024 / 1024)
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger?.info('Forced garbage collection');
      }
    }

    // Log stability metrics every hour (tracked properly)
    const _nowMs = Date.now();
    if (!stabilityMetrics._lastLogged || _nowMs - stabilityMetrics._lastLogged >= 60 * 60 * 1000) {
      stabilityMetrics._lastLogged = _nowMs;
      logger?.info('Stability metrics', stabilityMetrics);
    }
  }, 30000); // Check every 30 seconds
}

// ============================================================
// Globals
// ============================================================
let mainWindow = null;
let tray = null;
let db = null;
let emailService = null;
let verificationService = null;
let spamService = null;
let trackingService = null;
let domainHealthService = null;
let aiService = null;
let logger = null;
let serviceManager = null;
let entitlementService = null;
let cloudConfigService = null;
let desktopAccountService = null;
let hybridCloudService = null;
let syncService = null;
let trackingServer = null;
let scheduledCampaignTimers = new Map();
let automationEngine = null;
let dripEngine = null;

const configuredUserDataPath = process.env.BULKY_USER_DATA_DIR
  ? path.resolve(process.env.BULKY_USER_DATA_DIR)
  : '';
const userDataPath = configuredUserDataPath || app.getPath('userData');
const dbPath = path.join(userDataPath, 'bulky.db');
const logDir = path.join(userDataPath, 'logs');

// Shared HMAC secret for unsubscribe token validation between email + tracking
let hmacSecret = null;

// SMTP password encryption helpers using Electron safeStorage
function encryptPassword(plainText) {
  if (!plainText) return plainText;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plainText);
      return 'enc:' + encrypted.toString('base64');
    }
  } catch (error) {
    console.error('Error encrypting password:', error);
    return plainText;
  }
  return plainText;
}

function decryptPassword(stored) {
  if (!stored || !stored.startsWith('enc:')) return stored;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(stored.slice(4), 'base64');
      return safeStorage.decryptString(buffer);
    }
  } catch (error) {
    console.error('Error decrypting password:', error);
    return stored;
  }
  return stored;
}

function decryptSmtpAccount(account) {
  if (!account) return account;
  return { ...account, password: decryptPassword(account.password) };
}

function normalizeTrackingDomain(trackingDomain) {
  if (!trackingDomain || typeof trackingDomain !== 'string') return '';
  const trimmed = trackingDomain.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function getDeliverabilitySettings() {
  const raw = db?.getSetting('deliverability');
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function getLocalTrackingBaseUrl() {
  const port = trackingServer?.address()?.port || 3847;
  return `http://127.0.0.1:${port}`;
}

function canUseHostedTracking() {
  return !!(
    desktopAccountService?.getStatus?.()?.authenticated &&
    entitlementService?.hasCapability?.('hostedTracking')
  );
}

function getConfiguredPublicTrackingBaseUrl(settings = null) {
  const cloudConfiguredBaseUrl = normalizeTrackingDomain(
    cloudConfigService?.getInternalConfig?.()?.trackingBaseUrl || ''
  );
  if (cloudConfiguredBaseUrl && canUseHostedTracking()) {
    return {
      baseUrl: cloudConfiguredBaseUrl,
      source: 'cloud-config'
    };
  }

  const deliverabilitySettings = settings ?? getDeliverabilitySettings();
  const configuredDomainBaseUrl = normalizeTrackingDomain(deliverabilitySettings?.trackingDomain);
  if (configuredDomainBaseUrl) {
    return {
      baseUrl: configuredDomainBaseUrl,
      source: 'deliverability'
    };
  }

  return {
    baseUrl: '',
    source: 'local'
  };
}

function getCurrentTrackingBaseUrl() {
  const configured = getConfiguredPublicTrackingBaseUrl();
  return configured.baseUrl || getLocalTrackingBaseUrl();
}

function syncTrackingBaseUrl(settings = null) {
  const resolved = settings ?? getDeliverabilitySettings();
  const configured = getConfiguredPublicTrackingBaseUrl(resolved);
  const baseUrl = configured.baseUrl || getLocalTrackingBaseUrl();

  if (emailService) {
    emailService.setTrackingBaseUrl(baseUrl);
    // Sync sending mode and physical address footer
    if (typeof emailService.setSendingMode === 'function') {
      emailService.setSendingMode(resolved?.sendingMode || 'bulk');
    }
    if (typeof emailService.setCompanyAddress === 'function') {
      emailService.setCompanyAddress(resolved?.companyAddress || '');
    }
  }
  if (trackingService) {
    trackingService.setTrackingBaseUrl(baseUrl);
  }

  return baseUrl;
}

function syncPublicTrackingContext() {
  const accountStatus = desktopAccountService?.getStatus?.() || {};
  const ownerId = canUseHostedTracking()
    ? String(accountStatus?.account?.id || '').trim()
    : '';

  if (emailService?.setPublicTrackingContext) {
    emailService.setPublicTrackingContext({ ownerId });
  }
}

function getEffectiveTrackingSigningSecret() {
  const workspaceSecret = canUseHostedTracking()
    ? String(desktopAccountService?.getTrackingWorkspaceSecret?.() || '').trim()
    : '';

  return workspaceSecret || hmacSecret;
}

function syncTrackingSigningSecret() {
  const effectiveSecret = getEffectiveTrackingSigningSecret();
  if (!effectiveSecret) {
    return '';
  }

  if (emailService?.setHmacSecret) {
    emailService.setHmacSecret(effectiveSecret);
  }
  if (trackingService?.setHmacSecret) {
    trackingService.setHmacSecret(effectiveSecret);
  }

  return effectiveSecret;
}

function getConfiguredDkimSelectors(domain) {
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  if (!normalizedDomain || !db?.getAllSmtpAccounts) return [];

  const selectors = new Set();
  for (const account of db.getAllSmtpAccounts()) {
    const fromDomain = String(account.fromEmail || account.username || '')
      .split('@')[1]
      ?.trim()
      .toLowerCase();
    const dkimDomain = String(account.dkimDomain || '').trim().toLowerCase();
    const selector = String(account.dkimSelector || '').trim().toLowerCase();

    if (selector && (fromDomain === normalizedDomain || dkimDomain === normalizedDomain)) {
      selectors.add(selector);
    }
  }

  return Array.from(selectors);
}

function getPrimarySmtpAccount(activeOnly = false) {
  if (!db) return null;
  if (typeof db.getPrimarySmtpAccount === 'function') {
    return db.getPrimarySmtpAccount(activeOnly);
  }

  const accounts = activeOnly && typeof db.getActiveSmtpAccounts === 'function'
    ? db.getActiveSmtpAccounts()
    : typeof db.getAllSmtpAccounts === 'function'
      ? db.getAllSmtpAccounts()
      : [];

  return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
}

// ============================================================
// Window
// ============================================================
function createWindow() {
  mainWindow = createAppWindow({
    BrowserWindow,
    screen,
    app,
    fs,
    path,
    baseDir: __dirname,
    getTray: () => tray,
    onClosed: () => {
      mainWindow = null;
    }
  });
}

function createTray() {
  tray = createAppTray({
    Tray,
    Menu,
    nativeImage,
    app,
    fs,
    path,
    baseDir: __dirname,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    logger,
    appVersion: APP_VERSION,
    getMainWindow: () => mainWindow,
    openWindow: createWindow,
    cleanup
  });
}

// ============================================================
// Initialize services
// ============================================================
async function initializeServices() {
  logger = new Logger(logDir);
  crashReporter = new CrashReporter(logDir, APP_VERSION);
  logger.info('Bulky starting up', { version: APP_VERSION, dbPath });
  logger.cleanupOldLogs();

  db = new Database(dbPath);
  await db.initialize();
  logger.info('Database initialized');
  entitlementService = new EntitlementService(db, { appVersion: APP_VERSION });
  cloudConfigService = new CloudConfigService(db, {
    encryptValue: encryptPassword,
    decryptValue: decryptPassword
  });
  desktopAccountService = new DesktopAccountService({
    db,
    cloudConfigService,
    entitlementService,
    encryptValue: encryptPassword,
    decryptValue: decryptPassword,
    logger,
    appVersion: APP_VERSION
  });
  await desktopAccountService.initialize();
  syncService = new SyncService({
    desktopAccountService,
    entitlementService,
    logger
  });
  desktopAccountService.setStatusListener(() => {
    syncTrackingSigningSecret();
    syncPublicTrackingContext();
    syncTrackingBaseUrl();
    syncService?.refresh?.().catch((error) => {
      logger?.warn?.('Realtime sync refresh after account change failed', { error: error.message });
    });
  });
  await syncService.refresh();
  hybridCloudService = new HybridCloudService({
    cloudConfigService,
    desktopAccountService,
    entitlementService,
    syncService,
    logger,
    appVersion: APP_VERSION
  });

  // Load or generate HMAC secret (encrypted for security)
  const envTrackingSigningSecret = String(process.env.BULKY_TRACKING_SIGNING_SECRET || '').trim();
  const storedHmacSecret = db.getSetting('hmac_secret');
  if (envTrackingSigningSecret) {
    hmacSecret = envTrackingSigningSecret;
  } else if (!storedHmacSecret) {
    hmacSecret = crypto.randomBytes(32).toString('hex');
    db.setSetting('hmac_secret', encryptPassword(hmacSecret));
  } else {
    hmacSecret = decryptPassword(storedHmacSecret);
  }

  serviceManager = new ServiceManager(logger);
  const deliverabilitySettings = getDeliverabilitySettings();

  emailService = new EmailService(db, hmacSecret);
  emailService.setPasswordDecryptor(decryptPassword);
  serviceManager.registerService('EmailService', emailService);

  verificationService = new VerificationService();
  serviceManager.registerService('VerificationService', verificationService);

  spamService = new SpamService(db);
  serviceManager.registerService('SpamService', spamService);

  trackingService = new TrackingService(db);
  trackingService.setHmacSecret(hmacSecret);
  serviceManager.registerService('TrackingService', trackingService);

  domainHealthService = new DomainHealthService();
  syncTrackingSigningSecret();
  syncTrackingBaseUrl(deliverabilitySettings);
  syncPublicTrackingContext();

  // Restore persisted sending-mode and company address so they survive restarts.
  // Without this, emailService always boots with 'bulk' / '' regardless of saved settings.
  if (typeof emailService.setSendingMode === 'function') {
    emailService.setSendingMode(deliverabilitySettings.sendingMode || 'bulk');
  }
  if (typeof emailService.setCompanyAddress === 'function') {
    emailService.setCompanyAddress(deliverabilitySettings.companyAddress || '');
  }

  // AI Service
  aiService = new AIService();
  const aiSettings = db.getSetting('ai');
  if (aiSettings) {
    try {
      const parsed = JSON.parse(aiSettings);
      if (parsed.apiKey) {
        const decryptedKey = decryptPassword(parsed.apiKey);
        aiService.setApiKey(decryptedKey);
      }
      if (parsed.provider) aiService.setProvider?.(parsed.provider);
      if (parsed.model) aiService.setModel(parsed.model);
    } catch (e) {
      logger?.warn?.('Failed to restore AI settings from database', { error: e.message });
    }
  }

  automationEngine = new AutomationEngine({
    db,
    emailService,
    decryptSmtpAccount,
    logger
  });

  dripEngine = new DripEngine({
    db,
    emailService,
    decryptSmtpAccount,
    logger
  });

  startTrackingServer();
  loadScheduledCampaigns();
  resumeInterruptedCampaigns();
  startRetryProcessor();
  startDripProcessor();
  startAutoBackup();
  startMemoryMonitor();
  startServiceHealthMonitor();

  logger.info('All services initialized');
}

// ============================================================
// Campaign resume on restart
// ============================================================
async function resumeInterruptedCampaigns() {
  try {
    const resumable = db.getResumableCampaigns();
    if (resumable.length === 0) return;
    logger.info(`Found ${resumable.length} interrupted campaign(s) to resume`);

    for (const campaign of resumable) {
      // Only resume if NOT manually paused by user
      if (campaign.status === 'paused') {
        logger.info(`Skipping paused campaign: ${campaign.name}`);
        continue;
      }
      const sentEmails = db.getSentEmailsForCampaign(campaign.id);
      const sentSet = new Set(sentEmails);
      const filter = { listId: campaign.listId || '', verificationStatus: campaign.verificationFilter || '' };
      if (campaign.tagFilter) {
        try {
          const tags = JSON.parse(campaign.tagFilter);
          if (Array.isArray(tags) && tags.length) filter.tags = tags;
          else if (typeof campaign.tagFilter === 'string' && campaign.tagFilter.trim()) filter.tag = campaign.tagFilter;
        } catch (e) {
          filter.tag = campaign.tagFilter;
        }
      }
      const allContacts = db.getContactsForCampaign(filter);
      const remaining = allContacts.filter(c => !sentSet.has(c.email));

      if (remaining.length === 0) {
        campaign.status = 'completed';
        campaign.completedAt = new Date().toISOString();
        db.updateCampaign(campaign);
        notifyDataChanged('campaigns', { source: 'resume' });
        logger.info(`Campaign "${campaign.name}" had no remaining contacts — marked completed`);
        continue;
      }

      logger.info(`Resuming campaign "${campaign.name}" — ${remaining.length} contacts remaining`);
      const smtpAccounts = db.getActiveSmtpAccounts();
      if (smtpAccounts.length === 0) {
        campaign.status = 'failed';
        db.updateCampaign(campaign);
        continue;
      }

      const preferredAccount = campaign.smtpAccountId
        ? smtpAccounts.find(a => a.id === campaign.smtpAccountId) || smtpAccounts[0]
        : smtpAccounts[0];
      const smtpSettings = decryptSmtpAccount(preferredAccount);
      emailService.sendCampaign(campaign, remaining, smtpSettings, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('email:progress', { ...progress, resumed: true });
        }
      }).then(result => {
        logger.info(`Resumed campaign "${campaign.name}" completed`, result);
        notifyDataChanged('campaigns', { source: 'resume' });
      }).catch(err => {
        logger.error(`Resumed campaign "${campaign.name}" failed`, { error: err.message });
        campaign.status = 'failed';
        try { db.updateCampaign(campaign); } catch (dbErr) {
          logger.error('Failed to mark resumed campaign as failed', { error: dbErr.message });
        }
        notifyDataChanged('campaigns', { source: 'resume' });
      });
    }
  } catch (e) {
    logger.error('Failed to resume campaigns', { error: e.message });
  }
}

// ============================================================
// Retry processor — retries soft-bounced/failed emails
// ============================================================
let retryInterval;
const _retryInFlight = new Set(); // Guard against double-send on slow SMTP
function startRetryProcessor() {
  retryInterval = setInterval(async () => {
    try {
      const retries = db.getPendingRetries();
      if (retries.length === 0) return;

      const smtpAccounts = db.getActiveSmtpAccounts();
      if (smtpAccounts.length === 0) return;

      for (const item of retries) {
        if (_retryInFlight.has(item.id)) continue; // skip if already being processed
        _retryInFlight.add(item.id);
        try {
          const account = decryptSmtpAccount(smtpAccounts[item.attempts % smtpAccounts.length]);
          const transporter = emailService.getTransporter(account);
          await transporter.sendMail({
            from: `"${account.fromName}" <${account.fromEmail}>`,
            to: item.email,
            subject: item.subject,
            html: item.content
          });
          db.updateRetryItem(item.id, { status: 'completed', attempts: item.attempts + 1 });
          // Update campaign log
          db.addCampaignLog({ campaignId: item.campaignId, contactId: item.contactId, email: item.email, status: 'sent', variant: item.variant });
          notifyDataChanged('campaigns', { source: 'retry' });
        } catch (err) {
          const newAttempts = item.attempts + 1;
          if (newAttempts >= item.maxAttempts) {
            db.updateRetryItem(item.id, { status: 'failed', lastError: err.message, attempts: newAttempts });
          } else {
            db.updateRetryItem(item.id, { attempts: newAttempts, lastError: err.message });
          }
        } finally {
          _retryInFlight.delete(item.id);
        }
      }
    } catch (e) {
      console.warn('Retry processor error:', e.message);
      logger?.warn('Retry processor error', { error: e.message });
    }
  }, 60000); // Check every minute
}

// ============================================================
// Drip processor — advances per-contact drip step queue
// ============================================================
let dripInterval;
function startDripProcessor() {
  dripInterval = setInterval(async () => {
    try {
      await dripEngine?.tick?.();
    } catch (e) {
      logger?.warn('Drip processor error', { error: e.message });
    }
  }, 60000);
}

// ============================================================
// Auto-backup
// ============================================================
let autoBackupInterval;
function resolveAutoBackupDirectory() {
  const candidateBuilders = [
    () => path.join(app.getPath('documents'), 'Bulky Backups'),
    () => path.join(userDataPath, 'backups')
  ];

  for (const buildPath of candidateBuilders) {
    let backupDir = '';

    try {
      backupDir = buildPath();
    } catch (error) {
      logger?.warn('Auto-backup path unavailable', { error: error.message });
      continue;
    }

    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      return backupDir;
    } catch (error) {
      logger?.warn('Auto-backup directory unavailable', { path: backupDir, error: error.message });
    }
  }

  return '';
}

function startAutoBackup() {
  const backupDir = resolveAutoBackupDirectory();
  if (!backupDir) {
    logger?.warn('Auto-backup disabled: no writable backup directory available');
    return;
  }

  autoBackupInterval = setInterval(() => {
    try {
      const setting = db.getSetting('autoBackup');
      if (!setting) return;
      const config = typeof setting === 'string' ? JSON.parse(setting) : setting;
      if (!config.enabled) return;

      const lastBackup = db.getSetting('lastAutoBackup');
      const interval = (config.intervalHours || 24) * 60 * 60 * 1000;
      if (lastBackup && (Date.now() - new Date(lastBackup).getTime()) < interval) return;

      const filename = `bulky-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const backupPath = path.join(backupDir, filename);
      const result = db.createBackup(backupPath);
      if (result.success) {
        db.addBackupRecord({ filename, size: result.size, type: 'auto' });
        db.setSetting('lastAutoBackup', new Date().toISOString());
        // Keep only last 5 auto backups
        const history = db.getBackupHistory().filter(b => b.type === 'auto');
        if (history.length > 5) {
          for (const old of history.slice(5)) {
            const oldPath = path.join(backupDir, old.filename);
            try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
          }
        }
        logger.info('Auto-backup created', { filename });
      }
    } catch (e) {
      console.warn('Auto-backup error:', e.message);
      logger?.warn('Auto-backup error', { error: e.message });
    }
  }, 300000); // Check every 5 minutes
}


// ============================================================
// Tracking HTTP Server (open/click/unsubscribe)
// ============================================================
function startTrackingServer() {
  trackingServer = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      headers: req.headers
    };

    // Open tracking: GET /track/open/:campaignId/:contactId/:trackingId
    const openMatch = pathname.match(/^\/track\/open\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (openMatch && req.method === 'GET') {
      const [, campaignId, contactId, trackingId] = openMatch;
      try {
        await trackingService.recordOpen(campaignId, contactId, trackingId, metadata);
        notifyDataChanged('campaigns', { source: 'tracking', event: 'open', campaignId });
        notifyDataChanged('tracking', { source: 'tracking', event: 'open', campaignId });
        const openLog = db?.getCampaignLogByTracking?.(campaignId, trackingId);
        const openEmail = openLog?.email || (contactId ? db?._get?.('SELECT email FROM contacts WHERE id = ?', [contactId])?.email : '') || '';
        automationEngine?.fire?.('email_opened', { campaignId, contactId, email: openEmail }).catch(() => {});
      } catch (e) {}
      const pixel = trackingService.getTrackingPixelBuffer();
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(pixel);
      return;
    }

    // Click tracking: GET /track/click/:campaignId/:contactId/:trackingId?url=...
    const clickMatch = pathname.match(/^\/track\/click\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (clickMatch && req.method === 'GET') {
      const [, campaignId, contactId, trackingId] = clickMatch;
      const redirectUrl = parsedUrl.searchParams.get('url');
      try {
        await trackingService.recordClick(campaignId, contactId, trackingId, redirectUrl, metadata);
        notifyDataChanged('campaigns', { source: 'tracking', event: 'click', campaignId });
        notifyDataChanged('tracking', { source: 'tracking', event: 'click', campaignId });
        const clickLog = db?.getCampaignLogByTracking?.(campaignId, trackingId);
        const clickEmail = clickLog?.email || (contactId ? db?._get?.('SELECT email FROM contacts WHERE id = ?', [contactId])?.email : '') || '';
        automationEngine?.fire?.('link_clicked', { campaignId, contactId, email: clickEmail, linkUrl: redirectUrl }).catch(() => {});
      } catch (e) {}
      if (redirectUrl) {
        try {
          const parsed = new URL(redirectUrl);
          if (['http:', 'https:'].includes(parsed.protocol)) {
            res.writeHead(302, { 'Location': redirectUrl });
            res.end();
            return;
          }
        } catch (e) {}
      }
      res.writeHead(400);
      res.end('Invalid redirect URL');
      return;
    }

    // Unsubscribe: GET /unsubscribe/:campaignId/:contactId?email=...&token=...
    const unsubMatch = pathname.match(/^\/unsubscribe\/([^/]+)\/([^/]+)$/);
    if (unsubMatch && req.method === 'GET') {
      const [, campaignId, contactId] = unsubMatch;
      const email = parsedUrl.searchParams.get('email');
      const token = parsedUrl.searchParams.get('token');
      let result = { success: false };
      try { result = await trackingService.handleUnsubscribe(campaignId, contactId, email, null, token); } catch (e) {}
      const html = trackingService.getUnsubscribePageHtml(result.success, email || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      if (result.success && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tracking:unsubscribe', { email, campaignId });
      }
      if (result.success) {
        notifyDataChanged('campaigns', { source: 'tracking', event: 'unsubscribe', campaignId, email });
        notifyDataChanged('tracking', { source: 'tracking', event: 'unsubscribe', campaignId, email });
      }
      return;
    }

    const formSubmitMatch = pathname.match(/^\/api\/form\/submit\/([^/]+)$/);
    if (formSubmitMatch && req.method === 'POST') {
      const [, formId] = formSubmitMatch;

      try {
        const form = db.getSignupForm(formId);
        if (!form || !form.isActive) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Signup form not found or inactive' }));
          return;
        }

        const payload = await readJsonRequestBody(req);
        const fields = parseSignupFormFields(form);
        const email = String(extractSignupField(payload, ['email'])).toLowerCase();
        if (!email || !emailService?.validateEmail?.(email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'A valid email address is required' }));
          return;
        }

        const requiredFields = fields
          .filter((field) => field?.required)
          .map((field) => String(field.name || '').trim())
          .filter(Boolean);
        const missingField = requiredFields.find((fieldName) => !String(payload?.[fieldName] || '').trim());
        if (missingField) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `${missingField} is required` }));
          return;
        }

        const submissionId = db.addFormSubmission({
          formId,
          email,
          data: payload,
          status: form.doubleOptin ? 'pending' : 'confirmed',
          confirmedAt: form.doubleOptin ? '' : new Date().toISOString()
        });

        if (form.doubleOptin) {
          await sendDoubleOptInEmail(form, submissionId, payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Please confirm your subscription from the email we just sent.'
          }));
          return;
        }

        upsertContactFromSignupForm(form, payload, submissionId);
        notifyDataChanged('contacts', { source: 'signup-form', formId });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: String(form.successMessage || 'Thank you for subscribing!'),
          redirectUrl: String(form.redirectUrl || '').trim()
        }));
      } catch (error) {
        logger?.error('Signup form submission failed', {
          formId,
          error: error.message
        });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'Form submission failed' }));
      }
      return;
    }

    const formConfirmMatch = pathname.match(/^\/confirm-subscription\/([^/]+)$/);
    if (formConfirmMatch && req.method === 'GET') {
      const [, submissionId] = formConfirmMatch;
      const email = String(parsedUrl.searchParams.get('email') || '').toLowerCase();
      const formId = parsedUrl.searchParams.get('formId');
      const token = parsedUrl.searchParams.get('token');

      try {
        const submission = db._get('SELECT * FROM form_submissions WHERE id = ?', [submissionId]);
        if (!submission) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderSignupConfirmationPage({
            success: false,
            title: 'Subscription not found',
            message: 'This confirmation link is no longer valid.'
          }));
          return;
        }

        if (!verifyFormConfirmationToken(submissionId, email || submission.email, formId || submission.formId, token)) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderSignupConfirmationPage({
            success: false,
            title: 'Confirmation failed',
            message: 'This confirmation link is invalid or has expired.'
          }));
          return;
        }

        const form = db.getSignupForm(submission.formId);
        if (!form) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderSignupConfirmationPage({
            success: false,
            title: 'Form not found',
            message: 'The signup form behind this link is no longer available.'
          }));
          return;
        }

        if (submission.status !== 'confirmed') {
          const parsedData = (() => {
            try {
              return JSON.parse(submission.data || '{}');
            } catch {
              return {};
            }
          })();
          upsertContactFromSignupForm(form, parsedData, submissionId);
          db.confirmFormSubmission(submissionId);
          notifyDataChanged('contacts', { source: 'signup-form-confirmation', formId: form.id });
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderSignupConfirmationPage({
          success: true,
          title: 'Subscription confirmed',
          message: 'Your subscription has been confirmed and your contact record is now active.'
        }));
      } catch (error) {
        logger?.error('Signup confirmation failed', {
          submissionId,
          error: error.message
        });
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderSignupConfirmationPage({
          success: false,
          title: 'Confirmation failed',
          message: 'We could not confirm this subscription right now. Please try again later.'
        }));
      }
      return;
    }

    // Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: trackingServer.address()?.port }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  function tryPort(port, attempt = 0) {
    const onListening = () => {
      const actualPort = trackingServer.address().port;
      logger.info(`Tracking server started on port ${actualPort}`);

      syncTrackingBaseUrl(getDeliverabilitySettings());
    };

    const onError = (err) => {
      // Prevent stale listeners from previous failed attempts firing on a later success.
      trackingServer.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE' && attempt < 5) {
        trackingServer.close();
        tryPort(port + 1, attempt + 1);
      } else {
        logger.error('Failed to start tracking server', { error: err.message });
      }
    };

    trackingServer.once('listening', onListening);
    trackingServer.once('error', onError);
    trackingServer.listen(port, '127.0.0.1');
  }

  tryPort(3847);
}

// ============================================================
// Scheduled campaign support
// ============================================================
function loadScheduledCampaigns() {
  try {
    const scheduled = db.getScheduledCampaigns();
    for (const campaign of scheduled) {
      scheduleNextCampaign(campaign);
    }
  } catch (e) {
    logger.error('Error loading scheduled campaigns', { error: e.message });
  }
}

function scheduleNextCampaign(campaign) {
  if (!campaign.scheduledAt) return;
  const scheduledTime = new Date(campaign.scheduledAt).getTime();
  const now = Date.now();
  const delay = scheduledTime - now;

  if (delay <= 0) {
    // Past due - run immediately
    runScheduledCampaign(campaign);
    return;
  }

  // Clamp delay to MAX_SAFE_TIMEOUT (~24.8 days) to avoid 32-bit overflow
  const MAX_SAFE_TIMEOUT = 2147483647;
  const safeDelay = Math.min(delay, MAX_SAFE_TIMEOUT);
  const timer = setTimeout(() => {
    // Re-check if still in the future after waking up from clamped timeout
    if (Date.now() < scheduledTime) { scheduleNextCampaign(campaign); return; }
    runScheduledCampaign(campaign);
  }, safeDelay);

  scheduledCampaignTimers.set(campaign.id, timer);
}

async function runScheduledCampaign(campaign) {
  try {
    logger.logCampaign('scheduled_start', campaign.id, { name: campaign.name });
    campaign.status = 'running';
    db.updateCampaign(campaign);

    const filter = { listId: campaign.listId || '', verificationStatus: campaign.verificationFilter || '' };
    if (campaign.tagFilter) {
      try { const tags = JSON.parse(campaign.tagFilter); if (Array.isArray(tags) && tags.length) filter.tags = tags; } catch (e) {}
    }
    const contacts = db.getContactsForCampaign(filter);

    const smtpAccounts = db.getActiveSmtpAccounts();
    if (smtpAccounts.length === 0) {
      logger.error('No active SMTP accounts for scheduled campaign', { campaignId: campaign.id });
      campaign.status = 'failed';
      db.updateCampaign(campaign);
      return;
    }

    const smtpSettings = decryptSmtpAccount(smtpAccounts[0]);
    await emailService.sendCampaign(campaign, contacts, smtpSettings, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('email:progress', progress);
      }
    });
  } catch (error) {
    logger.error('Scheduled campaign failed', { campaignId: campaign.id, error: error.message });
    campaign.status = 'failed';
    db.updateCampaign(campaign);
  } finally {
    // Always clean up the timer reference
    scheduledCampaignTimers.delete(campaign.id);
  }
}

// Service health monitoring — started in initializeServices() after all services are ready
let serviceHealthInterval = null;
function startServiceHealthMonitor() {
  serviceHealthInterval = setInterval(() => {
    const services = [
      { name: 'Database', check: () => db && db.db },
      { name: 'EmailService', check: () => emailService && typeof emailService.sendSingleEmail === 'function' },
      { name: 'TrackingServer', check: () => trackingServer && trackingServer.listening },
      { name: 'Logger', check: () => logger && typeof logger.info === 'function' }
    ];

    for (const service of services) {
      try {
        if (!service.check()) {
          logger?.error(`Service health check failed: ${service.name}`);
          stabilityMetrics.serviceFailures = (stabilityMetrics.serviceFailures || 0) + 1;
        }
      } catch (e) {
        logger?.error(`Service health check error for ${service.name}`, { error: e.message });
      }
    }
  }, 60000); // Check every minute
}


// ============================================================
// Signup form helpers
// ============================================================
function readJsonRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function parseSignupFormFields(form) {
  if (Array.isArray(form?.fields)) return form.fields;
  try {
    return JSON.parse(form?.fields || '[]');
  } catch {
    return [];
  }
}

function getFormConfirmationToken(submissionId, email, formId) {
  const data = `${submissionId}:${String(email || '').toLowerCase()}:${formId}`;
  return crypto.createHmac('sha256', hmacSecret).update(data).digest('hex');
}

function verifyFormConfirmationToken(submissionId, email, formId, token) {
  try {
    const expected = getFormConfirmationToken(submissionId, email, formId);
    if (!token || expected.length !== token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function getPrimaryFormSmtpSettings() {
  const primaryAccount = getPrimarySmtpAccount(true) || getPrimarySmtpAccount(false);
  return primaryAccount ? decryptSmtpAccount(primaryAccount) : null;
}

function extractSignupField(data, fieldNames = []) {
  for (const fieldName of fieldNames) {
    const value = data?.[fieldName];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function upsertContactFromSignupForm(form, submissionData = {}, submissionId = '') {
  const email = String(extractSignupField(submissionData, ['email'])).toLowerCase();
  if (!email || !emailService?.validateEmail?.(email)) {
    throw new Error('A valid email address is required');
  }

  const existing = db._get('SELECT * FROM contacts WHERE lower(email) = lower(?)', [email]);
  const payload = {
    ...(existing || {}),
    email,
    firstName: extractSignupField(submissionData, ['firstName', 'firstname']) || existing?.firstName || '',
    lastName: extractSignupField(submissionData, ['lastName', 'lastname']) || existing?.lastName || '',
    company: extractSignupField(submissionData, ['company']) || existing?.company || '',
    phone: extractSignupField(submissionData, ['phone']) || existing?.phone || '',
    customField1: extractSignupField(submissionData, ['customField1', 'custom1']) || existing?.customField1 || '',
    customField2: extractSignupField(submissionData, ['customField2', 'custom2']) || existing?.customField2 || ''
  };

  let contactId = '';
  const isNew = !existing?.id;
  if (!isNew) {
    db.updateContact(payload);
    contactId = existing.id;
  } else {
    contactId = db.addContact(payload);
  }

  try {
    db.addContactToList(contactId, form.listId);
  } catch {}

  if (isNew) {
    const ctx = { contactId, email, listId: form.listId };
    automationEngine?.fire?.('contact_added', ctx).catch(() => {});
    dripEngine?.enqueueContact?.(contactId, email, { listId: form.listId });
  }

  if (submissionId) {
    db._run(
      "UPDATE form_submissions SET contactId = ?, status = 'confirmed', confirmedAt = datetime('now') WHERE id = ?",
      [contactId, submissionId]
    );
  }

  return { contactId, email };
}

async function sendDoubleOptInEmail(form, submissionId, submissionData = {}) {
  const smtpSettings = getPrimaryFormSmtpSettings();
  if (!smtpSettings?.host || !smtpSettings?.fromEmail) {
    throw new Error('No active SMTP account is available for confirmation email delivery');
  }

  const email = String(extractSignupField(submissionData, ['email'])).toLowerCase();
  const confirmLink = `${getCurrentTrackingBaseUrl()}/confirm-subscription/${submissionId}?email=${encodeURIComponent(email)}&formId=${encodeURIComponent(form.id)}&token=${encodeURIComponent(getFormConfirmationToken(submissionId, email, form.id))}`;
  const subject = String(form.confirmationSubject || 'Please confirm your subscription').trim();
  const bodyTemplate = String(form.confirmationTemplate || 'Click the link below to confirm your subscription: {{confirmLink}}');
  const textBody = bodyTemplate
    .replace(/\{\{confirmLink\}\}/gi, confirmLink)
    .replace(/\{\{firstName\}\}/gi, extractSignupField(submissionData, ['firstName', 'firstname']) || 'there')
    .replace(/\{\{email\}\}/gi, email);
  const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.6;color:#1f2937;">
    <p>${textBody.replace(/\n/g, '</p><p>')}</p>
  </div>`;

  const transporter = emailService.createTransporter(smtpSettings);
  try {
    await transporter.sendMail({
      from: `"${smtpSettings.fromName || 'Bulky'}" <${smtpSettings.fromEmail}>`,
      to: email,
      replyTo: smtpSettings.replyTo || smtpSettings.fromEmail,
      subject,
      text: textBody,
      html: htmlBody
    });
  } finally {
    try { transporter.close(); } catch {}
  }
}

function renderSignupConfirmationPage({ success, title, message }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${success ? 'Subscription confirmed' : 'Confirmation failed'}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 32px; background: #f8fafc; color: #111827; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 28px; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 12px; font-size: 28px; }
    p { margin: 0; line-height: 1.7; color: #4b5563; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// ============================================================
// Real-time data change notifications (renderer push)
// ============================================================
const WRITE_CHANNELS = new Set([
  'contacts:add', 'contacts:addBulk', 'contacts:update', 'contacts:delete',
  'contacts:deleteByVerification', 'contacts:addTagBulk',
  'campaigns:add', 'campaigns:update', 'campaigns:delete', 'campaigns:schedule', 'campaigns:cancelSchedule',
  'templates:add', 'templates:update', 'templates:delete', 'templates:saveBlocks', 'templates:importFile',
  'lists:add', 'lists:update', 'lists:delete',
  'tags:add', 'tags:delete',
  'blacklist:add', 'blacklist:addBulk', 'blacklist:remove', 'blacklist:import', 'bounces:autoBlacklist',
  'unsubscribes:add', 'unsubscribes:remove',
  'smtpAccounts:add', 'smtpAccounts:update', 'smtpAccounts:delete',
  'smtp:save',
  'settings:save', 'settings:saveWarmup', 'settings:saveDeliverability', 'settings:importAll',
  'email:send', 'email:pause', 'email:resume', 'email:stop',
  'verify:bulk',
  'tracking:addEvent',
  'warmup:create', 'warmup:update', 'warmup:delete', 'warmup:autoGenerate',
  'segments:add', 'segments:update', 'segments:delete',
  'retry:clear',
  'spam:addReplacement', 'spam:updateReplacement', 'spam:deleteReplacement',
  'ai:saveSettings',
  'cloud:saveConfig',
  'account:signUp',
  'account:signIn', 'account:signOut', 'account:refresh'
]);

function getChannelDataTypes(channel) {
  const types = new Set();

  if (
    channel.startsWith('contacts:') ||
    channel.startsWith('tags:') ||
    channel.startsWith('lists:') ||
    channel.startsWith('segments:') ||
    channel.startsWith('verify:')
  ) {
    types.add('contacts');
  }

  if (
    channel.startsWith('campaigns:') ||
    channel.startsWith('email:') ||
    channel.startsWith('tracking:') ||
    channel.startsWith('retry:')
  ) {
    types.add('campaigns');
  }

  if (channel.startsWith('templates:') || channel.startsWith('spam:')) {
    types.add('templates');
  }

  if (
    channel.startsWith('blacklist:') ||
    channel.startsWith('unsubscribes:') ||
    channel.startsWith('bounces:')
  ) {
    types.add('blacklist');
  }

  if (
    channel.startsWith('smtpAccounts:') ||
    channel.startsWith('smtp:') ||
    channel.startsWith('settings:') ||
    channel.startsWith('cloud:') ||
    channel.startsWith('account:') ||
    channel.startsWith('warmup:') ||
    channel.startsWith('ai:')
  ) {
    types.add('settings');
  }

  if (channel === 'settings:importAll') {
    types.add('templates');
  }

  return types.size > 0 ? Array.from(types) : ['general'];
}

function emitChannelDataChanged(channel, payload = {}) {
  const types = getChannelDataTypes(channel);
  for (const type of types) {
    notifyDataChanged(type, { channel, ...payload });
  }
}

function notifyDataChanged(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data:changed', { type, timestamp: Date.now(), ...payload });
  }
}

// Input validation helpers
// NOTE: validateContactInput in ipc/validators.js is the canonical IPC-layer validator.
// The main-process backward-compat contact validator now lives in main-process/handlerRegistry.js.
function validateRequired(obj, fields) {
  if (!obj || typeof obj !== 'object') return 'Invalid input: expected an object';
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') return `Missing required field: ${f}`;
  }
  return null;
}

// IPC rate limiting for expensive operations
const rateLimitMap = new Map();
function rateLimitedHandler(channel, handler, minIntervalMs = 500) {
  ipcMain.handle(channel, async (event, ...args) => {
    const now = Date.now();
    const last = rateLimitMap.get(channel) || 0;
    if (now - last < minIntervalMs) {
      return { error: 'Please wait before trying again', rateLimited: true };
    }
    rateLimitMap.set(channel, now);
    try {
      const result = await handler(event, ...args);
      if (WRITE_CHANNELS.has(channel) && result && !result.error) {
        emitChannelDataChanged(channel);
      }
      return result;
    } catch (error) {
      logger.logIpcError(channel, error, args);
      crashReporter?.report('ipc_error', error, { channel });
      return { error: error.message };
    }
  });
}

function safeHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...args);
      // Auto-notify renderer of data changes after successful writes
      if (WRITE_CHANNELS.has(channel) && result && !result.error) {
        emitChannelDataChanged(channel);
      }
      return result;
    } catch (error) {
      logger.logIpcError(channel, error, args);
      crashReporter?.report('ipc_error', error, { channel });
      return { error: error.message };
    }
  });
}

function registerAllHandlers() {
  registerAppHandlers({
    safeHandler,
    rateLimitedHandler,
    app,
    appVersion: APP_VERSION,
    cleanup,
    db,
    dialog,
    fs,
    shell,
    path,
    emailService,
    verificationService,
    decryptSmtpAccount,
    encryptPassword,
    entitlementService,
    cloudConfigService,
    desktopAccountService,
    hybridCloudService,
    syncService,
    validateRequired,
    getPrimarySmtpAccount,
    scheduledCampaignTimers,
    scheduleNextCampaign,
    logger,
    getMainWindow: () => mainWindow,
    spamService,
    aiService,
    domainHealthService,
    decryptPassword,
    syncTrackingBaseUrl,
    getConfiguredDkimSelectors,
    dbPath,
    userDataPath,
    getTrackingBaseUrl: getCurrentTrackingBaseUrl,
    getTrackingHealth: () => ({
      listening: !!trackingServer?.listening,
      port: trackingServer?.address()?.port || null,
      localBaseUrl: getLocalTrackingBaseUrl(),
      publicBaseUrl: getConfiguredPublicTrackingBaseUrl().baseUrl,
      source: getConfiguredPublicTrackingBaseUrl().source
    }),
    trackingService,
    logDir,
    automationEngine,
    dripEngine
  });
}

// ============================================================
// Auto-updater (GitHub Releases via electron-updater)
// ============================================================
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logger?.info('Update available', { version: info.version });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', { status: 'available', version: info.version });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger?.info('Update downloaded', { version: info.version });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', { status: 'downloaded', version: info.version });
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Bulky ${info.version} is ready to install.`,
      detail: 'The update will be applied when you next quit the application.',
      buttons: ['Install Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    }).catch(() => {});
  });

  autoUpdater.on('error', (err) => {
    logger?.warn('Auto-updater error', { error: err.message });
  });

  // Check after 10s so the window has time to render before any dialog appears
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 10000);
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async () => {
  await initializeServices();
  registerAllHandlers();
  createWindow();
  createTray();
  if (app.isPackaged) setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err) => {
  try { logger?.error('Startup failed', { message: err.message, stack: err.stack }); } catch (e) {}
  dialog.showErrorBox('Startup Error', `Bulky failed to start: ${err.message}\n\nPlease restart the application.`);
  app.quit();
});

app.on('window-all-closed', () => {
  // On Windows/Linux the app stays alive in the system tray when the
  // window is closed — only quit when the user explicitly chooses Quit
  // from the tray context menu (app.isQuitting = true).
  if (process.platform !== 'darwin' && app.isQuitting) {
    cleanup();
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});

let cleanupDone = false;
function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;

  logger?.info('Application shutting down - starting cleanup');

  try {
    // Clear scheduled timers
    for (const timer of scheduledCampaignTimers.values()) {
      clearTimeout(timer);
    }
    scheduledCampaignTimers.clear();

    // Stop intervals
      if (autoBackupInterval) clearInterval(autoBackupInterval);
      if (retryInterval) clearInterval(retryInterval);
      if (dripInterval) clearInterval(dripInterval);
      if (memMonitorInterval) clearInterval(memMonitorInterval);
      if (serviceHealthInterval) clearInterval(serviceHealthInterval);
      syncService?.dispose?.();
      desktopAccountService?.dispose?.();

      // Close tracking server
      if (trackingServer) {
        trackingServer.close();
      }

    emailService?.dispose?.();
    dripEngine?.dispose?.();

    // Flush database
    if (db) {
      db.dispose?.();
    }

    // Final stability report
    logger?.info('Shutdown stability report', stabilityMetrics);

    logger?.info('Cleanup completed');
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}
