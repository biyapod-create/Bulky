const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { version: APP_VERSION } = require('./package.json');

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
const registerBackupHandlers = require('./ipc/registerBackupHandlers');
const registerCampaignHandlers = require('./ipc/registerCampaignHandlers');
const registerContactsHandlers = require('./ipc/registerContactsHandlers');
const registerContentHandlers = require('./ipc/registerContentHandlers');
const registerDataHandlers = require('./ipc/registerDataHandlers');
const registerMessagingHandlers = require('./ipc/registerMessagingHandlers');
const registerOperationsHandlers = require('./ipc/registerOperationsHandlers');
const registerSmtpHandlers = require('./ipc/registerSmtpHandlers');
const registerSettingsHandlers = require('./ipc/registerSettingsHandlers');
const registerSupportHandlers = require('./ipc/registerSupportHandlers');

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
let trackingServer = null;
let scheduledCampaignTimers = new Map();

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

function syncTrackingBaseUrl(settings = null) {
  const resolved = settings ?? getDeliverabilitySettings();
  const trackingDomain = resolved?.trackingDomain;
  const baseUrl = normalizeTrackingDomain(trackingDomain) || getLocalTrackingBaseUrl();

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false
  });

  // Load renderer
  const rendererPath = path.join(__dirname, 'renderer', 'build', 'index.html');
  if (fs.existsSync(rendererPath)) {
    mainWindow.loadFile(rendererPath);
  } else {
    // Dev mode fallback
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray on close instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // One-time balloon hint so the user knows the app is still running
      if (tray && !app._trayHintShown) {
        app._trayHintShown = true;
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: 'Bulky is still running',
            content: 'Bulky is running in the background. Click the tray icon to reopen it.'
          });
        } catch (e) {}
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// System Tray
// ============================================================
function getTrayIconPath() {
  // In the packaged app the icon is copied to resources/ via extraResources.
  // Electron cannot use nativeImage from inside an asar for Tray on Windows —
  // it must point to a real file on disk.
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

function createTray() {
  const iconFilePath = getTrayIconPath();
  let trayImage = null;

  if (iconFilePath) {
    try {
      trayImage = nativeImage.createFromPath(iconFilePath);
      // Windows system tray requires 16×16; resize ensures it's never blank.
      if (!trayImage.isEmpty()) {
        trayImage = trayImage.resize({ width: 16, height: 16 });
      }
    } catch (e) {
      logger?.warn('Tray icon load failed', { error: e.message, path: iconFilePath });
    }
  }

  // Fallback: a minimal 16×16 solid-colour PNG so the tray is never invisible.
  if (!trayImage || trayImage.isEmpty()) {
    // 1×1 PNG stretched to 16×16 (cyan-blue #5bb4d4) — valid PNG base64
    const fallbackPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HgAHggJ/PchI6QAAAABJRU5ErkJggg==';
    try {
      trayImage = nativeImage.createFromDataURL(fallbackPng);
      trayImage = trayImage.resize({ width: 16, height: 16 });
    } catch (e) {
      trayImage = nativeImage.createEmpty();
    }
  }

  tray = new Tray(trayImage);

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Open Bulky',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else { createWindow(); }
      }
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          // Tell the renderer to navigate to the Settings page
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('navigate:page', '/settings');
          }
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Bulky v${APP_VERSION}`,
      enabled: false   // informational label — grayed out
    },
    { type: 'separator' },
    {
      label: 'Quit Bulky',
      click: () => {
        app.isQuitting = true;
        cleanup();
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`Bulky Email Sender v${APP_VERSION}`);
  tray.setContextMenu(buildMenu());

  // Single click → toggle window visibility
  tray.on('click', () => {
    if (!mainWindow) { createWindow(); return; }
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Double-click always brings window to front
  tray.on('double-click', () => {
    if (!mainWindow) { createWindow(); return; }
    mainWindow.show();
    mainWindow.focus();
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

  // Load or generate HMAC secret (encrypted for security)
  const storedHmacSecret = db.getSetting('hmac_secret');
  if (!storedHmacSecret) {
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
  syncTrackingBaseUrl(deliverabilitySettings);

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
      if (parsed.model) aiService.setModel(parsed.model);
    } catch (e) {}
  }

  startTrackingServer();
  loadScheduledCampaigns();
  resumeInterruptedCampaigns();
  startRetryProcessor();
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
      }).catch(err => {
        logger.error(`Resumed campaign "${campaign.name}" failed`, { error: err.message });
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
        // Push update to renderer immediately — Dashboard and Analytics pages
        // subscribe to this event so open counts appear without waiting for the
        // next poll cycle.
        notifyDataChanged('campaigns', { source: 'tracking', event: 'open', campaignId });
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
        // Same as open tracking — push immediately so click counts update live.
        notifyDataChanged('campaigns', { source: 'tracking', event: 'click', campaignId });
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
  'ai:saveSettings'
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
// validateContact below uses a { valid, error } shape for backward compat with registerContactsHandlers.
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

function validateContact(contact) {
  if (!contact || typeof contact !== 'object') return { valid: false, error: 'Invalid contact data' };
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

function registerAllHandlers() {
  // ---------- Window Controls ----------
  safeHandler('window:minimize', () => mainWindow?.minimize());
  safeHandler('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize(); }
    else { mainWindow?.maximize(); }
  });
  safeHandler('window:close', () => mainWindow?.close());
  safeHandler('window:hide', () => mainWindow?.hide());
  safeHandler('window:show', () => { mainWindow?.show(); mainWindow?.focus(); });
  safeHandler('window:quit', () => { app.isQuitting = true; cleanup(); app.quit(); });

  registerContactsHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    path,
    validateContact,
    getMainWindow: () => mainWindow
  });
  registerDataHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    getMainWindow: () => mainWindow
  });

  // ---------- Templates ----------
  registerContentHandlers({
    safeHandler,
    db,
    dialog,
    fs,
    path,
    getMainWindow: () => mainWindow
  });

  registerSmtpHandlers({
    safeHandler,
    db,
    emailService,
    decryptSmtpAccount,
    encryptPassword,
    validateRequired,
    getPrimarySmtpAccount
  });

  registerCampaignHandlers({
    safeHandler,
    db,
    validateRequired,
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
    getMainWindow: () => mainWindow
  });

  registerSupportHandlers({
    safeHandler,
    db,
    spamService,
    aiService,
    decryptPassword,
    encryptPassword
  });

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
    getMainWindow: () => mainWindow
  });

  registerOperationsHandlers({
    safeHandler,
    db,
    decryptPassword,
    domainHealthService,
    getConfiguredDkimSelectors
  });

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
    getMainWindow: () => mainWindow
  });
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async () => {
  await initializeServices();
  registerAllHandlers();
  createWindow();
  createTray();

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
    if (memMonitorInterval) clearInterval(memMonitorInterval);
    if (serviceHealthInterval) clearInterval(serviceHealthInterval);

    // Close tracking server
    if (trackingServer) {
      trackingServer.close();
    }

    emailService?.dispose?.();

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
