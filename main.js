const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const Database = require('./database/db');
const EmailService = require('./services/emailService');
const VerificationService = require('./services/verificationService');
const SpamService = require('./services/spamService');
const TrackingService = require('./services/trackingService');

// HMAC secret for unsubscribe token validation
const UNSUBSCRIBE_SECRET = crypto.randomBytes(32).toString('hex');

// PDF parsing helper - extracts emails from PDF without canvas dependency
const parsePdfForEmails = async (filePath) => {
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text || '';
  } catch (err) {
    console.error('PDF parse error, using fallback:', err.message);
    try {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 1000000));
      return text;
    } catch (e) {
      return '';
    }
  }
};

// Generate HMAC token for unsubscribe links
function generateUnsubscribeToken(email, campaignId) {
  return crypto.createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(`${email}:${campaignId}`)
    .digest('hex');
}

// Validate HMAC token for unsubscribe requests
function validateUnsubscribeToken(email, campaignId, token) {
  const expected = generateUnsubscribeToken(email, campaignId);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token || ''.padEnd(expected.length, '0')));
}

// Rate limiter for verification endpoint
const verifyRateLimiter = {
  requests: new Map(),
  windowMs: 60000, // 1 minute window
  maxRequests: 30,  // max 30 requests per minute per IP

  isAllowed(ip) {
    const now = Date.now();
    const entry = this.requests.get(ip);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.requests.set(ip, { windowStart: now, count: 1 });
      return true;
    }
    if (entry.count >= this.maxRequests) {
      return false;
    }
    entry.count++;
    return true;
  },

  cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.requests) {
      if (now - entry.windowStart > this.windowMs) {
        this.requests.delete(ip);
      }
    }
  }
};

// Clean up rate limiter periodically
setInterval(() => verifyRateLimiter.cleanup(), 120000);

let mainWindow;
let db;
let dbPath;
let emailService;
let verificationService;
let spamService;
let trackingService;
let trackingServer;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

async function initializeServices() {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'bulky.db');

  db = new Database(dbPath);
  await db.init();
  emailService = new EmailService(db);
  verificationService = new VerificationService();
  spamService = new SpamService(db);
  trackingService = new TrackingService(db);

  startTrackingServer();
  startCampaignScheduler();
}

// ==================== SAFE IPC HANDLER WRAPPER ====================
function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      console.error(`IPC error in ${channel}:`, error);
      return { success: false, error: error.message || 'An unexpected error occurred' };
    }
  });
}

// ==================== CAMPAIGN SCHEDULER ====================
let schedulerInterval = null;

async function checkScheduledCampaigns() {
  try {
    const scheduledCampaigns = db.getScheduledCampaigns();
    const now = new Date();

    for (const campaign of scheduledCampaigns) {
      const scheduledAt = new Date(campaign.scheduledAt);
      if (scheduledAt <= now) {
        console.log(`Starting scheduled campaign: ${campaign.name}`);
        try {
          await runScheduledCampaign(campaign);
        } catch (campaignError) {
          console.error(`Failed to run scheduled campaign ${campaign.id}:`, campaignError);
          try {
            db.updateCampaign({ ...campaign, status: 'failed', error: campaignError.message });
          } catch (dbError) {
            console.error('Failed to update campaign status:', dbError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Scheduler error:', error);
  }
}

function startCampaignScheduler() {
  schedulerInterval = setInterval(checkScheduledCampaigns, 60000);

  // Also check immediately on startup
  setTimeout(checkScheduledCampaigns, 5000);
}

async function runScheduledCampaign(campaign) {
  // Get SMTP settings
  const smtpSettings = db.getSmtpSettings();
  if (!smtpSettings?.host) {
    console.error('No SMTP settings configured for scheduled campaign');
    db.updateCampaign({ ...campaign, status: 'failed', error: 'No SMTP settings configured' });
    return;
  }

  // Get contacts
  const filter = { listId: campaign.listId || '' };
  const contacts = db.getContactsForCampaign(filter);

  if (contacts.length === 0) {
    console.log('No contacts for scheduled campaign');
    db.updateCampaign({ ...campaign, status: 'completed', completedAt: new Date().toISOString() });
    return;
  }

  // Update campaign status
  campaign.status = 'running';
  campaign.startedAt = new Date().toISOString();
  campaign.totalEmails = contacts.length;
  db.updateCampaign(campaign);

  // Send emails
  await emailService.sendCampaign(campaign, contacts, smtpSettings, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('email:progress', progress);
    }
  });
}

// ==================== TRACKING SERVER ====================
function startTrackingServer() {
  const TRACKING_PORT = 3847;

  trackingServer = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    const metadata = {
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null
    };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    try {
      // Open tracking: /track/open/:campaignId/:recipientId/:trackingId
      if (pathname.startsWith('/track/open/')) {
        const parts = pathname.split('/').filter(Boolean);
        const campaignId = parts[2];
        const recipientId = parts[3];
        const trackingId = parts[4];

        if (campaignId && trackingId) {
          try {
            await trackingService.recordOpen(campaignId, recipientId, trackingId, metadata);
          } catch (trackErr) {
            console.error('Failed to record open event:', trackErr);
          }
        }

        const pixel = trackingService.getTrackingPixelBuffer();
        res.writeHead(200, {
          'Content-Type': 'image/gif',
          'Content-Length': pixel.length
        });
        res.end(pixel);
        return;
      }

      // Click tracking: /track/click/:campaignId/:recipientId/:trackingId?url=...
      if (pathname.startsWith('/track/click/')) {
        const parts = pathname.split('/').filter(Boolean);
        const campaignId = parts[2];
        const recipientId = parts[3];
        const trackingId = parts[4];
        const redirectUrl = query.url ? decodeURIComponent(query.url) : null;

        if (campaignId && trackingId && redirectUrl) {
          try {
            await trackingService.recordClick(campaignId, recipientId, trackingId, redirectUrl, metadata);
          } catch (trackErr) {
            console.error('Failed to record click event:', trackErr);
          }
        }

        if (redirectUrl) {
          // Validate redirect URL to prevent open redirect attacks
          try {
            const parsed = new URL(redirectUrl);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
              res.writeHead(302, { 'Location': redirectUrl });
              res.end();
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid redirect URL protocol');
            }
          } catch (urlErr) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid redirect URL');
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing redirect URL');
        }
        return;
      }

      // Unsubscribe: /unsubscribe/:campaignId/:recipientId?email=...&token=...
      if (pathname.startsWith('/unsubscribe/')) {
        const parts = pathname.split('/').filter(Boolean);
        const campaignId = parts[1];
        const recipientId = parts[2];
        const email = query.email ? decodeURIComponent(query.email) : null;
        const token = query.token || null;

        let success = false;
        if (email) {
          // Validate HMAC token if provided
          if (token) {
            const isValid = validateUnsubscribeToken(email, campaignId, token);
            if (isValid) {
              try {
                const result = await trackingService.handleUnsubscribe(campaignId, recipientId, email);
                success = result.success;
              } catch (unsubErr) {
                console.error('Failed to process unsubscribe:', unsubErr);
              }
            } else {
              console.warn(`Invalid unsubscribe token for email: ${email}`);
            }
          } else {
            // Fallback: allow unsubscribe without token for backwards compatibility
            // but log a warning
            console.warn(`Unsubscribe request without token for email: ${email}`);
            try {
              const result = await trackingService.handleUnsubscribe(campaignId, recipientId, email);
              success = result.success;
            } catch (unsubErr) {
              console.error('Failed to process unsubscribe:', unsubErr);
            }
          }
        }

        try {
          const html = trackingService.getUnsubscribePageHtml(success, email || 'Unknown');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } catch (htmlErr) {
          console.error('Failed to generate unsubscribe page:', htmlErr);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Unsubscribe processed</h1></body></html>');
        }
        return;
      }

      // Health check
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'bulky-tracking' }));
        return;
      }

      // 404 for unknown paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');

    } catch (error) {
      console.error('Tracking server error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  });

  trackingServer.listen(TRACKING_PORT, '127.0.0.1', () => {
    console.log(`Tracking server running on http://127.0.0.1:${TRACKING_PORT}`);
  });

  trackingServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Tracking port ${TRACKING_PORT} in use, trying next port...`);
      trackingServer.listen(TRACKING_PORT + 1, '127.0.0.1');
    } else {
      console.error('Tracking server error:', err);
    }
  });
}

// Expose token generation for use in email templates
function getUnsubscribeTokenForEmail(email, campaignId) {
  return generateUnsubscribeToken(email, campaignId);
}

app.whenReady().then(async () => {
  await initializeServices();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (schedulerInterval) clearInterval(schedulerInterval);
    if (trackingServer) trackingServer.close();
    if (db) db.close();
    app.quit();
  }
});

// ==================== WINDOW CONTROLS ====================
ipcMain.handle('window:minimize', () => {
  try { mainWindow.minimize(); } catch (e) { console.error('Window minimize error:', e); }
});
ipcMain.handle('window:maximize', () => {
  try {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } catch (e) { console.error('Window maximize error:', e); }
});
ipcMain.handle('window:close', () => {
  try { mainWindow.close(); } catch (e) { console.error('Window close error:', e); }
});

// ==================== CONTACTS ====================
safeHandle('contacts:getAll', async () => db.getAllContacts());
safeHandle('contacts:getFiltered', async (event, filter) => db.getContactsByFilter(filter));
safeHandle('contacts:add', async (event, contact) => db.addContact(contact));
safeHandle('contacts:addBulk', async (event, contacts) => db.addBulkContacts(contacts));
safeHandle('contacts:update', async (event, contact) => db.updateContact(contact));
safeHandle('contacts:delete', async (event, ids) => db.deleteContacts(ids));
safeHandle('contacts:deleteByVerification', async (event, status) => db.deleteContactsByVerification(status));
safeHandle('contacts:getRecipientCount', async (event, filter) => db.getRecipientCount(filter));
safeHandle('contacts:getForCampaign', async (event, filter) => db.getContactsForCampaign(filter));

// Paginated contacts
safeHandle('contacts:getPage', async (event, { page, pageSize, filter, sortBy, sortOrder }) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safePageSize = Math.min(500, Math.max(1, parseInt(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const contacts = db.getContactsByFilter(filter || {});

  // Sort if requested
  if (sortBy) {
    const order = sortOrder === 'desc' ? -1 : 1;
    contacts.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (typeof aVal === 'string') return aVal.localeCompare(bVal) * order;
      return (aVal - bVal) * order;
    });
  }

  const total = contacts.length;
  const paginated = contacts.slice(offset, offset + safePageSize);

  return {
    contacts: paginated,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(total / safePageSize)
  };
});

// Contact statistics
safeHandle('contacts:getStats', async () => {
  const allContacts = db.getAllContacts();
  const total = allContacts.length;
  const verified = allContacts.filter(c => c.verified === 'valid' || c.verified === 'verified').length;
  const invalid = allContacts.filter(c => c.verified === 'invalid').length;
  const unverified = allContacts.filter(c => !c.verified || c.verified === 'unknown').length;
  const risky = allContacts.filter(c => c.verified === 'risky' || c.verified === 'catch-all').length;
  const lists = {};
  allContacts.forEach(c => {
    const listName = c.listName || 'No List';
    lists[listName] = (lists[listName] || 0) + 1;
  });

  return {
    total,
    verified,
    invalid,
    unverified,
    risky,
    byList: lists
  };
});

// Contact Import (multiple formats) - FULL SERVER-SIDE PARSING
safeHandle('contacts:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Supported', extensions: ['csv', 'txt', 'xlsx', 'xls', 'json', 'pdf', 'docx', 'doc'] },
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'Word Files', extensions: ['docx', 'doc'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    let parsed = [];

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const extractEmailsFromText = (text) => {
      const emails = text.match(emailRegex) || [];
      const unique = [...new Set(emails.map(e => e.toLowerCase()))];
      return unique.map(email => ({ email, firstName: '', lastName: '', company: '', phone: '' }));
    };

    try {
      const parseCSVLine = (line) => {
        const cols = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
            cols.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else current += char;
        }
        cols.push(current.trim().replace(/^"|"$/g, ''));
        return cols;
      };

      const isDateColumn = (h) => {
        const datePatterns = ['date', 'time', 'created', 'updated', 'modified', 'timestamp', '_at', 'registered', 'joined', 'added', 'subscribed'];
        return datePatterns.some(p => h.includes(p));
      };

      const isDateValue = (val) => {
        if (!val) return false;
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) return true;
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(val)) return true;
        if (/^\d{1,2}-\d{1,2}-\d{2,4}/.test(val)) return true;
        return false;
      };

      const cleanValue = (val) => {
        if (!val) return '';
        const trimmed = val.trim();
        if (isDateValue(trimmed)) return '';
        return trimmed;
      };

      const findColumnIndex = (headers, patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)) && !isDateColumn(h));

      if (ext === '.csv' || ext === '.txt') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/[\r\n]+/).filter(l => l.trim());

        const firstLine = lines[0] || '';
        const hasHeaders = firstLine.toLowerCase().includes('email') || firstLine.includes('@') === false;

        if (hasHeaders && lines.length >= 2) {
          const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
          const emailIdx = findColumnIndex(headers, ['email', 'e-mail', 'emailaddress']);
          const fnameIdx = findColumnIndex(headers, ['first', 'fname', 'firstname', 'given']);
          const lnameIdx = findColumnIndex(headers, ['last', 'lname', 'lastname', 'surname', 'family']);
          const companyIdx = findColumnIndex(headers, ['company', 'org', 'organization', 'business']);
          const phoneIdx = findColumnIndex(headers, ['phone', 'mobile', 'tel', 'cell']);

          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const email = (cols[emailIdx >= 0 ? emailIdx : 0] || '').trim().toLowerCase();
            if (email && email.includes('@') && !email.includes(' ')) {
              parsed.push({
                email,
                firstName: fnameIdx >= 0 ? cleanValue(cols[fnameIdx]) : '',
                lastName: lnameIdx >= 0 ? cleanValue(cols[lnameIdx]) : '',
                company: companyIdx >= 0 ? cleanValue(cols[companyIdx]) : '',
                phone: phoneIdx >= 0 ? cleanValue(cols[phoneIdx]) : ''
              });
            }
          }
        } else {
          parsed = extractEmailsFromText(content);
        }
      }
      else if (ext === '.json') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const json = JSON.parse(content);
        const arr = Array.isArray(json) ? json : json.contacts || json.data || json.users || [];
        parsed = arr.filter(c => c.email).map(c => ({
          email: (c.email || '').toLowerCase(),
          firstName: c.firstName || c.first_name || c.fname || (c.name ? c.name.split(' ')[0] : '') || '',
          lastName: c.lastName || c.last_name || c.lname || (c.name ? c.name.split(' ').slice(1).join(' ') : '') || '',
          company: c.company || c.organization || c.org || '',
          phone: c.phone || c.mobile || c.tel || ''
        }));
      }
      else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length >= 1) {
          const headers = data[0].map(h => String(h || '').toLowerCase());
          const emailIdx = findColumnIndex(headers, ['email', 'e-mail', 'emailaddress']);
          const fnameIdx = findColumnIndex(headers, ['first', 'fname', 'firstname', 'given']);
          const lnameIdx = findColumnIndex(headers, ['last', 'lname', 'lastname', 'surname', 'family']);
          const companyIdx = findColumnIndex(headers, ['company', 'org', 'organization', 'business']);
          const phoneIdx = findColumnIndex(headers, ['phone', 'mobile', 'tel', 'cell']);

          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const email = String(row[emailIdx >= 0 ? emailIdx : 0] || '').trim().toLowerCase();
            if (email && email.includes('@') && !email.includes(' ')) {
              parsed.push({
                email,
                firstName: fnameIdx >= 0 ? cleanValue(String(row[fnameIdx] || '')) : '',
                lastName: lnameIdx >= 0 ? cleanValue(String(row[lnameIdx] || '')) : '',
                company: companyIdx >= 0 ? cleanValue(String(row[companyIdx] || '')) : '',
                phone: phoneIdx >= 0 ? cleanValue(String(row[phoneIdx] || '')) : ''
              });
            }
          }
        }
      }
      else if (ext === '.pdf') {
        const pdfText = await parsePdfForEmails(filePath);
        parsed = extractEmailsFromText(pdfText);
      }
      else if (ext === '.docx') {
        const docResult = await mammoth.extractRawText({ path: filePath });
        parsed = extractEmailsFromText(docResult.value);
      }
      else if (ext === '.doc') {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          parsed = extractEmailsFromText(content);
        } catch (e) {
          return { success: false, error: 'Cannot read old .doc format. Please convert to .docx' };
        }
      }

      if (parsed.length === 0) return { success: false, error: 'No valid email addresses found in file' };

      return { success: true, contacts: parsed, filePath, extension: ext, count: parsed.length };
    } catch (error) {
      return { success: false, error: 'Failed to parse file: ' + error.message };
    }
  }
  return { success: false };
});

// ==================== TAGS ====================
safeHandle('tags:getAll', async () => db.getAllTags());
safeHandle('tags:add', async (event, tag) => db.addTag(tag));
safeHandle('tags:delete', async (event, id) => db.deleteTag(id));

// ==================== LISTS ====================
safeHandle('lists:getAll', async () => db.getAllLists());
safeHandle('lists:add', async (event, list) => db.addList(list));
safeHandle('lists:update', async (event, list) => db.updateList(list));
safeHandle('lists:delete', async (event, id) => db.deleteList(id));
safeHandle('lists:getContacts', async (event, listId) => db.getContactsByList(listId));

// ==================== BLACKLIST ====================
safeHandle('blacklist:getAll', async () => db.getAllBlacklist());
safeHandle('blacklist:add', async (event, entry) => db.addToBlacklist(entry));
safeHandle('blacklist:addBulk', async (event, entries) => db.addBulkToBlacklist(entries));
safeHandle('blacklist:remove', async (event, id) => db.removeFromBlacklist(id));
safeHandle('blacklist:check', async (event, email) => ({ isBlacklisted: db.isBlacklisted(email) }));

// Import blacklist from file
safeHandle('blacklist:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Text/CSV', extensions: ['csv', 'txt'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const emails = content.split(/[\r\n,;]+/).map(e => e.trim()).filter(e => e && e.includes('@'));
    const added = db.addBulkToBlacklist(emails, 'import');
    return { success: true, ...added, total: emails.length };
  }
  return { success: false };
});

// ==================== UNSUBSCRIBES ====================
safeHandle('unsubscribes:getAll', async () => db.getAllUnsubscribes());
safeHandle('unsubscribes:add', async (event, { email, campaignId, reason }) => db.addUnsubscribe(email, campaignId, reason));
safeHandle('unsubscribes:remove', async (event, email) => db.removeUnsubscribe(email));
safeHandle('unsubscribes:check', async (event, email) => ({ isUnsubscribed: db.isUnsubscribed(email) }));

// ==================== TEMPLATES ====================
safeHandle('templates:getAll', async () => db.getAllTemplates());
safeHandle('templates:getByCategory', async (event, category) => db.getTemplatesByCategory(category));
safeHandle('templates:add', async (event, template) => db.addTemplate(template));
safeHandle('templates:update', async (event, template) => db.updateTemplate(template));
safeHandle('templates:delete', async (event, id) => db.deleteTemplate(id));

// Get template with its blocks (for drag-and-drop builder)
safeHandle('templates:getWithBlocks', async (event, templateId) => {
  const templates = db.getAllTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return { success: false, error: 'Template not found' };
  }
  // Blocks are stored as JSON string in template.blocks field
  let blocks = [];
  if (template.blocks) {
    try {
      blocks = JSON.parse(template.blocks);
    } catch (e) {
      blocks = [];
    }
  }
  return { success: true, template, blocks };
});

// Save template blocks (for drag-and-drop builder)
safeHandle('templates:saveBlocks', async (event, { templateId, blocks }) => {
  if (!templateId) {
    return { success: false, error: 'Template ID is required' };
  }
  if (!Array.isArray(blocks)) {
    return { success: false, error: 'Blocks must be an array' };
  }
  const templates = db.getAllTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return { success: false, error: 'Template not found' };
  }
  template.blocks = JSON.stringify(blocks);
  db.updateTemplate(template);
  return { success: true };
});

// Get unique template categories
safeHandle('templates:getCategories', async () => {
  const templates = db.getAllTemplates();
  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];
  return categories.sort();
});

// ==================== SMTP ACCOUNTS (Multiple) ====================
safeHandle('smtpAccounts:getAll', async () => db.getAllSmtpAccounts());
safeHandle('smtpAccounts:getActive', async () => db.getActiveSmtpAccounts());
safeHandle('smtpAccounts:add', async (event, account) => db.addSmtpAccount(account));
safeHandle('smtpAccounts:update', async (event, account) => db.updateSmtpAccount(account));
safeHandle('smtpAccounts:delete', async (event, id) => db.deleteSmtpAccount(id));
safeHandle('smtpAccounts:test', async (event, account) => emailService.testConnection(account));

// Legacy SMTP settings
safeHandle('smtp:get', async () => db.getSmtpSettings());
safeHandle('smtp:save', async (event, settings) => db.saveSmtpSettings(settings));
safeHandle('smtp:test', async (event, settings) => emailService.testConnection(settings));

// ==================== CAMPAIGNS ====================
safeHandle('campaigns:getAll', async () => db.getAllCampaigns());
safeHandle('campaigns:getScheduled', async () => db.getScheduledCampaigns());
safeHandle('campaigns:add', async (event, campaign) => db.addCampaign(campaign));
safeHandle('campaigns:update', async (event, campaign) => db.updateCampaign(campaign));
safeHandle('campaigns:delete', async (event, id) => db.deleteCampaign(id));
safeHandle('campaigns:getLogs', async (event, campaignId) => db.getCampaignLogs(campaignId));
safeHandle('campaigns:getAnalytics', async (event, campaignId) => db.getCampaignAnalytics(campaignId));
safeHandle('campaigns:schedule', async (event, { campaignId, scheduledAt, timezone }) =>
  db.scheduleCampaign(campaignId, scheduledAt, timezone));
safeHandle('campaigns:cancelSchedule', async (event, campaignId) => db.cancelScheduledCampaign(campaignId));

// ==================== EMAIL SENDING ====================
safeHandle('email:send', async (event, { campaign, contacts, settings }) => {
  // Validate campaign data
  if (!campaign) {
    return { success: false, error: 'Campaign data is required' };
  }
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return { success: false, error: 'At least one contact is required' };
  }
  if (!settings || !settings.host) {
    return { success: false, error: 'SMTP settings with a valid host are required' };
  }

  // Validate and sanitize batch size
  if (campaign.batchSize !== undefined) {
    const batchSize = parseInt(campaign.batchSize);
    if (isNaN(batchSize) || batchSize < 1) {
      return { success: false, error: 'Batch size must be a positive number' };
    }
    if (batchSize > 1000) {
      return { success: false, error: 'Batch size cannot exceed 1000' };
    }
    campaign.batchSize = batchSize;
  }

  // Validate and sanitize delay between batches
  if (campaign.delayMinutes !== undefined) {
    const delayMinutes = parseFloat(campaign.delayMinutes);
    if (isNaN(delayMinutes) || delayMinutes < 0) {
      return { success: false, error: 'Delay must be a non-negative number' };
    }
    if (delayMinutes > 1440) {
      return { success: false, error: 'Delay cannot exceed 1440 minutes (24 hours)' };
    }
    campaign.delayMinutes = delayMinutes;
  }

  return emailService.sendCampaign(campaign, contacts, settings, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('email:progress', progress);
    }
  });
});
safeHandle('email:pause', async () => emailService.pause());
safeHandle('email:resume', async () => emailService.resume());
safeHandle('email:stop', async () => emailService.stop());

// ==================== EMAIL VERIFICATION ====================
safeHandle('verify:email', async (event, email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { success: false, error: 'Valid email address is required' };
  }
  return verificationService.verifyEmail(email);
});

safeHandle('verify:bulk', async (event, emails) => {
  if (!Array.isArray(emails) || emails.length === 0) {
    return { success: false, error: 'Email list is required' };
  }
  const results = await verificationService.verifyBulk(emails, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('verify:progress', progress);
    }
  });

  // Save verification results back to contacts
  if (results && Array.isArray(results)) {
    try {
      for (const result of results) {
        if (result.email && result.status) {
          const allContacts = db.getAllContacts();
          const contact = allContacts.find(c => c.email.toLowerCase() === result.email.toLowerCase());
          if (contact) {
            contact.verified = result.status;
            db.updateContact(contact);
          }
        }
      }
    } catch (saveErr) {
      console.error('Failed to save verification results to contacts:', saveErr);
    }
  }

  return results;
});

// Verification control handlers
safeHandle('verify:pause', async () => {
  if (verificationService.pause) return verificationService.pause();
  return { success: false, error: 'Pause not supported' };
});

safeHandle('verify:resume', async () => {
  if (verificationService.resume) return verificationService.resume();
  return { success: false, error: 'Resume not supported' };
});

safeHandle('verify:stop', async () => {
  if (verificationService.stop) return verificationService.stop();
  return { success: false, error: 'Stop not supported' };
});

// ==================== SPAM CHECK & AUTO-FIX ====================
safeHandle('spam:check', async (event, { subject, content }) => spamService.analyzeContent(subject, content));
safeHandle('spam:autoFix', async (event, { subject, content, issues }) => spamService.autoFix(subject, content, issues));
safeHandle('spam:getSuggestions', async (event, word) => spamService.getSuggestions(word));
safeHandle('spam:getReplacements', async () => db.getAllSpamReplacements());
safeHandle('spam:addReplacement', async (event, item) => db.addSpamReplacement(item));
safeHandle('spam:updateReplacement', async (event, item) => db.updateSpamReplacement(item));
safeHandle('spam:deleteReplacement', async (event, id) => db.deleteSpamReplacement(id));

// ==================== TRACKING ====================
safeHandle('tracking:addEvent', async (event, trackingEvent) => db.addTrackingEvent(trackingEvent));
safeHandle('tracking:getEvents', async (event, campaignId) => db.getTrackingEvents(campaignId));

// ==================== APP SETTINGS ====================
safeHandle('settings:get', async () => db.getSettings());
safeHandle('settings:save', async (event, settings) => db.saveSettings(settings));

// ==================== STATISTICS ====================
safeHandle('stats:getDashboard', async () => db.getDashboardStats());

// ==================== SMTP WARMUP ====================
safeHandle('warmup:getSchedules', async () => {
  try {
    const settings = db.getSettings();
    return JSON.parse(settings.warmupSchedules || '[]');
  } catch (e) {
    return [];
  }
});

safeHandle('warmup:create', async (event, schedule) => {
  if (!schedule || !schedule.smtpAccountId) {
    return { success: false, error: 'SMTP account ID is required' };
  }
  if (!schedule.dailyLimit || schedule.dailyLimit < 1) {
    return { success: false, error: 'Daily limit must be a positive number' };
  }
  try {
    const settings = db.getSettings();
    const schedules = JSON.parse(settings.warmupSchedules || '[]');
    schedule.id = crypto.randomUUID();
    schedule.createdAt = new Date().toISOString();
    schedule.currentDay = 0;
    schedule.status = 'active';
    schedules.push(schedule);
    db.saveSettings({ ...settings, warmupSchedules: JSON.stringify(schedules) });
    return { success: true, schedule };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

safeHandle('warmup:update', async (event, schedule) => {
  if (!schedule || !schedule.id) {
    return { success: false, error: 'Schedule ID is required' };
  }
  try {
    const settings = db.getSettings();
    const schedules = JSON.parse(settings.warmupSchedules || '[]');
    const idx = schedules.findIndex(s => s.id === schedule.id);
    if (idx === -1) {
      return { success: false, error: 'Schedule not found' };
    }
    schedules[idx] = { ...schedules[idx], ...schedule, updatedAt: new Date().toISOString() };
    db.saveSettings({ ...settings, warmupSchedules: JSON.stringify(schedules) });
    return { success: true, schedule: schedules[idx] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

safeHandle('warmup:delete', async (event, scheduleId) => {
  if (!scheduleId) {
    return { success: false, error: 'Schedule ID is required' };
  }
  try {
    const settings = db.getSettings();
    const schedules = JSON.parse(settings.warmupSchedules || '[]');
    const filtered = schedules.filter(s => s.id !== scheduleId);
    if (filtered.length === schedules.length) {
      return { success: false, error: 'Schedule not found' };
    }
    db.saveSettings({ ...settings, warmupSchedules: JSON.stringify(filtered) });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==================== EXPORT ====================
safeHandle('export:contacts', async (event, contacts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'contacts.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled) {
    const headers = 'email,firstName,lastName,company,listName,status,verified,engagementScore,createdAt\n';
    const rows = contacts.map(c =>
      `${c.email},${c.firstName || ''},${c.lastName || ''},${c.company || ''},${c.listName || ''},${c.status},${c.verified},${c.engagementScore || 0},${c.createdAt}`
    ).join('\n');

    fs.writeFileSync(result.filePath, headers + rows);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

safeHandle('export:logs', async (event, logs) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'campaign_logs.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled) {
    const headers = 'email,status,variant,sentAt,error\n';
    const rows = logs.map(l => `${l.email},${l.status},${l.variant || 'A'},${l.sentAt},${l.error || ''}`).join('\n');
    fs.writeFileSync(result.filePath, headers + rows);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

safeHandle('export:blacklist', async (event) => {
  const blacklist = db.getAllBlacklist();
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'blacklist.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled) {
    const headers = 'email,domain,reason,source,createdAt\n';
    const rows = blacklist.map(b => `${b.email || ''},${b.domain || ''},${b.reason || ''},${b.source},${b.createdAt}`).join('\n');
    fs.writeFileSync(result.filePath, headers + rows);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

safeHandle('export:verificationResults', async (event, results) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'verification_results.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled) {
    const headers = 'email,status,score,reason\n';
    const rows = results.map(r => `${r.email},${r.status},${r.score},${r.reason || ''}`).join('\n');
    fs.writeFileSync(result.filePath, headers + rows);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

// ==================== BACKUP & RESTORE ====================
safeHandle('backup:create', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `bulky_backup_${new Date().toISOString().split('T')[0]}.db`,
    filters: [{ name: 'Database Backup', extensions: ['db'] }]
  });

  if (!result.canceled) {
    const data = db.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  }
  return { success: false, canceled: true };
});

safeHandle('backup:restore', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Database Backup', extensions: ['db'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const backupPath = result.filePaths[0];
    const buffer = fs.readFileSync(backupPath);

    // Close current database
    db.close();

    // Write backup to the actual database path
    fs.writeFileSync(dbPath, buffer);

    // Reinitialize database
    const BulkyDatabase = require('./database/db');
    db = new BulkyDatabase(dbPath);
    await db.init();

    // Reinitialize services with new db
    emailService = new EmailService(db);
    spamService = new SpamService(db);

    return { success: true };
  }
  return { success: false, canceled: true };
});

safeHandle('backup:getInfo', async () => {
  try {
    const stats = fs.statSync(dbPath);
    return {
      size: (stats.size / 1024).toFixed(2) + ' KB',
      lastModified: stats.mtime.toLocaleString(),
      path: dbPath
    };
  } catch (error) {
    return { size: 'Unknown', lastModified: 'Unknown', path: dbPath };
  }
});

// Export unsubscribe token generator for use in email service
module.exports = { getUnsubscribeTokenForEmail };
