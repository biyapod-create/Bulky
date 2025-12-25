const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Database = require('./database/db');
const EmailService = require('./services/emailService');
const VerificationService = require('./services/verificationService');
const SpamService = require('./services/spamService');

let mainWindow;
let db;
let dbPath;
let emailService;
let verificationService;
let spamService;

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
    if (db) db.close();
    app.quit();
  }
});

// ==================== WINDOW CONTROLS ====================
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow.close());

// ==================== CONTACTS ====================
ipcMain.handle('contacts:getAll', async () => db.getAllContacts());
ipcMain.handle('contacts:getFiltered', async (event, filter) => db.getContactsByFilter(filter));
ipcMain.handle('contacts:add', async (event, contact) => db.addContact(contact));
ipcMain.handle('contacts:addBulk', async (event, contacts) => db.addBulkContacts(contacts));
ipcMain.handle('contacts:update', async (event, contact) => db.updateContact(contact));
ipcMain.handle('contacts:delete', async (event, ids) => db.deleteContacts(ids));
ipcMain.handle('contacts:deleteByVerification', async (event, status) => db.deleteContactsByVerification(status));


// Contact Import (multiple formats) - FULL SERVER-SIDE PARSING
ipcMain.handle('contacts:import', async () => {
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
    
    // Email extraction regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    // Extract emails from raw text (for PDF, Word, or unstructured TXT)
    const extractEmailsFromText = (text) => {
      const emails = text.match(emailRegex) || [];
      const unique = [...new Set(emails.map(e => e.toLowerCase()))];
      return unique.map(email => ({ email, firstName: '', lastName: '', company: '', phone: '' }));
    };

    try {
      // CSV Parsing helper
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

      const isDateColumn = (h) => ['date','time','created','updated','modified','timestamp','_at'].some(p => h.includes(p));
      const findColumnIndex = (headers, patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)) && !isDateColumn(h));

      // CSV / TXT files
      if (ext === '.csv' || ext === '.txt') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/[\r\n]+/).filter(l => l.trim());
        
        // Check if it's structured (has headers) or raw text
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
                firstName: fnameIdx >= 0 ? (cols[fnameIdx] || '').trim() : '',
                lastName: lnameIdx >= 0 ? (cols[lnameIdx] || '').trim() : '',
                company: companyIdx >= 0 ? (cols[companyIdx] || '').trim() : '',
                phone: phoneIdx >= 0 ? (cols[phoneIdx] || '').trim() : ''
              });
            }
          }
        } else {
          // Raw text - just extract emails
          parsed = extractEmailsFromText(content);
        }
      }
      // JSON files
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
      // Excel files
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
                firstName: fnameIdx >= 0 ? String(row[fnameIdx] || '').trim() : '',
                lastName: lnameIdx >= 0 ? String(row[lnameIdx] || '').trim() : '',
                company: companyIdx >= 0 ? String(row[companyIdx] || '').trim() : '',
                phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : ''
              });
            }
          }
        }
      }
      // PDF files
      else if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        parsed = extractEmailsFromText(pdfData.text);
      }
      // Word files (.docx)
      else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        parsed = extractEmailsFromText(result.value);
      }
      // Old Word files (.doc) - try as text
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
ipcMain.handle('tags:getAll', async () => db.getAllTags());
ipcMain.handle('tags:add', async (event, tag) => db.addTag(tag));
ipcMain.handle('tags:delete', async (event, id) => db.deleteTag(id));

// ==================== LISTS ====================
ipcMain.handle('lists:getAll', async () => db.getAllLists());
ipcMain.handle('lists:add', async (event, list) => db.addList(list));
ipcMain.handle('lists:update', async (event, list) => db.updateList(list));
ipcMain.handle('lists:delete', async (event, id) => db.deleteList(id));
ipcMain.handle('lists:getContacts', async (event, listId) => db.getContactsByList(listId));

// ==================== BLACKLIST ====================
ipcMain.handle('blacklist:getAll', async () => db.getAllBlacklist());
ipcMain.handle('blacklist:add', async (event, entry) => db.addToBlacklist(entry));
ipcMain.handle('blacklist:addBulk', async (event, entries) => db.addBulkToBlacklist(entries));
ipcMain.handle('blacklist:remove', async (event, id) => db.removeFromBlacklist(id));
ipcMain.handle('blacklist:check', async (event, email) => ({ isBlacklisted: db.isBlacklisted(email) }));

// Import blacklist from file
ipcMain.handle('blacklist:import', async () => {
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
ipcMain.handle('unsubscribes:getAll', async () => db.getAllUnsubscribes());
ipcMain.handle('unsubscribes:add', async (event, { email, campaignId, reason }) => db.addUnsubscribe(email, campaignId, reason));
ipcMain.handle('unsubscribes:check', async (event, email) => ({ isUnsubscribed: db.isUnsubscribed(email) }));

// ==================== TEMPLATES ====================
ipcMain.handle('templates:getAll', async () => db.getAllTemplates());
ipcMain.handle('templates:getByCategory', async (event, category) => db.getTemplatesByCategory(category));
ipcMain.handle('templates:add', async (event, template) => db.addTemplate(template));
ipcMain.handle('templates:update', async (event, template) => db.updateTemplate(template));
ipcMain.handle('templates:delete', async (event, id) => db.deleteTemplate(id));

// ==================== SMTP ACCOUNTS (Multiple) ====================
ipcMain.handle('smtpAccounts:getAll', async () => db.getAllSmtpAccounts());
ipcMain.handle('smtpAccounts:getActive', async () => db.getActiveSmtpAccounts());
ipcMain.handle('smtpAccounts:add', async (event, account) => db.addSmtpAccount(account));
ipcMain.handle('smtpAccounts:update', async (event, account) => db.updateSmtpAccount(account));
ipcMain.handle('smtpAccounts:delete', async (event, id) => db.deleteSmtpAccount(id));
ipcMain.handle('smtpAccounts:test', async (event, account) => emailService.testConnection(account));

// Legacy SMTP settings
ipcMain.handle('smtp:get', async () => db.getSmtpSettings());
ipcMain.handle('smtp:save', async (event, settings) => db.saveSmtpSettings(settings));
ipcMain.handle('smtp:test', async (event, settings) => emailService.testConnection(settings));


// ==================== CAMPAIGNS ====================
ipcMain.handle('campaigns:getAll', async () => db.getAllCampaigns());
ipcMain.handle('campaigns:getScheduled', async () => db.getScheduledCampaigns());
ipcMain.handle('campaigns:add', async (event, campaign) => db.addCampaign(campaign));
ipcMain.handle('campaigns:update', async (event, campaign) => db.updateCampaign(campaign));
ipcMain.handle('campaigns:delete', async (event, id) => db.deleteCampaign(id));
ipcMain.handle('campaigns:getLogs', async (event, campaignId) => db.getCampaignLogs(campaignId));
ipcMain.handle('campaigns:getAnalytics', async (event, campaignId) => db.getCampaignAnalytics(campaignId));
ipcMain.handle('campaigns:schedule', async (event, { campaignId, scheduledAt, timezone }) => 
  db.scheduleCampaign(campaignId, scheduledAt, timezone));
ipcMain.handle('campaigns:cancelSchedule', async (event, campaignId) => db.cancelScheduledCampaign(campaignId));

// ==================== EMAIL SENDING ====================
ipcMain.handle('email:send', async (event, { campaign, contacts, settings }) => {
  return emailService.sendCampaign(campaign, contacts, settings, (progress) => {
    mainWindow.webContents.send('email:progress', progress);
  });
});
ipcMain.handle('email:pause', async () => emailService.pause());
ipcMain.handle('email:resume', async () => emailService.resume());
ipcMain.handle('email:stop', async () => emailService.stop());

// ==================== EMAIL VERIFICATION ====================
ipcMain.handle('verify:email', async (event, email) => verificationService.verifyEmail(email));
ipcMain.handle('verify:bulk', async (event, emails) => {
  return verificationService.verifyBulk(emails, (progress) => {
    mainWindow.webContents.send('verify:progress', progress);
  });
});

// ==================== SPAM CHECK & AUTO-FIX ====================
ipcMain.handle('spam:check', async (event, { subject, content }) => spamService.analyzeContent(subject, content));
ipcMain.handle('spam:autoFix', async (event, { subject, content, issues }) => spamService.autoFix(subject, content, issues));
ipcMain.handle('spam:getSuggestions', async (event, word) => spamService.getSuggestions(word));
ipcMain.handle('spam:getReplacements', async () => db.getAllSpamReplacements());
ipcMain.handle('spam:addReplacement', async (event, item) => db.addSpamReplacement(item));
ipcMain.handle('spam:updateReplacement', async (event, item) => db.updateSpamReplacement(item));
ipcMain.handle('spam:deleteReplacement', async (event, id) => db.deleteSpamReplacement(id));

// ==================== TRACKING ====================
ipcMain.handle('tracking:addEvent', async (event, trackingEvent) => db.addTrackingEvent(trackingEvent));
ipcMain.handle('tracking:getEvents', async (event, campaignId) => db.getTrackingEvents(campaignId));

// ==================== APP SETTINGS ====================
ipcMain.handle('settings:get', async () => db.getSettings());
ipcMain.handle('settings:save', async (event, settings) => db.saveSettings(settings));

// ==================== STATISTICS ====================
ipcMain.handle('stats:getDashboard', async () => db.getDashboardStats());

// ==================== EXPORT ====================
ipcMain.handle('export:contacts', async (event, contacts) => {
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

ipcMain.handle('export:logs', async (event, logs) => {
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

ipcMain.handle('export:blacklist', async (event) => {
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

ipcMain.handle('export:verificationResults', async (event, results) => {
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
ipcMain.handle('backup:create', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `bulky_backup_${new Date().toISOString().split('T')[0]}.db`,
    filters: [{ name: 'Database Backup', extensions: ['db'] }]
  });

  if (!result.canceled) {
    try {
      // Export the database to a file
      const data = db.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('backup:restore', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Database Backup', extensions: ['db'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
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
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('backup:getInfo', async () => {
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
