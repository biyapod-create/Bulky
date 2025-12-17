const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('./database/db');
const EmailService = require('./services/emailService');
const VerificationService = require('./services/verificationService');
const SpamService = require('./services/spamService');

let mainWindow;
let db;
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
    backgroundColor: '#0f0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'bulky.db');
  
  db = new Database(dbPath);
  await db.init();
  emailService = new EmailService(db);
  verificationService = new VerificationService();
  spamService = new SpamService();
}

app.whenReady().then(async () => {
  await initializeServices();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// Window Controls
ipcMain.handle('window:minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow.close();
});

// Database - Contacts
ipcMain.handle('contacts:getAll', async () => {
  return db.getAllContacts();
});

ipcMain.handle('contacts:add', async (event, contact) => {
  return db.addContact(contact);
});

ipcMain.handle('contacts:addBulk', async (event, contacts) => {
  return db.addBulkContacts(contacts);
});

ipcMain.handle('contacts:update', async (event, contact) => {
  return db.updateContact(contact);
});

ipcMain.handle('contacts:delete', async (event, ids) => {
  return db.deleteContacts(ids);
});

ipcMain.handle('contacts:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, filePath };
  }
  return { success: false };
});

// Database - Lists
ipcMain.handle('lists:getAll', async () => {
  return db.getAllLists();
});

ipcMain.handle('lists:add', async (event, list) => {
  return db.addList(list);
});

ipcMain.handle('lists:update', async (event, list) => {
  return db.updateList(list);
});

ipcMain.handle('lists:delete', async (event, id) => {
  return db.deleteList(id);
});

ipcMain.handle('lists:getContacts', async (event, listId) => {
  return db.getContactsByList(listId);
});

// Database - Templates
ipcMain.handle('templates:getAll', async () => {
  return db.getAllTemplates();
});

ipcMain.handle('templates:add', async (event, template) => {
  return db.addTemplate(template);
});

ipcMain.handle('templates:update', async (event, template) => {
  return db.updateTemplate(template);
});

ipcMain.handle('templates:delete', async (event, id) => {
  return db.deleteTemplate(id);
});

// Database - Campaigns
ipcMain.handle('campaigns:getAll', async () => {
  return db.getAllCampaigns();
});

ipcMain.handle('campaigns:add', async (event, campaign) => {
  return db.addCampaign(campaign);
});

ipcMain.handle('campaigns:update', async (event, campaign) => {
  return db.updateCampaign(campaign);
});

ipcMain.handle('campaigns:delete', async (event, id) => {
  return db.deleteCampaign(id);
});

ipcMain.handle('campaigns:getLogs', async (event, campaignId) => {
  return db.getCampaignLogs(campaignId);
});

// SMTP Settings
ipcMain.handle('smtp:get', async () => {
  return db.getSmtpSettings();
});

ipcMain.handle('smtp:save', async (event, settings) => {
  return db.saveSmtpSettings(settings);
});

ipcMain.handle('smtp:test', async (event, settings) => {
  return emailService.testConnection(settings);
});

// Email Sending
ipcMain.handle('email:send', async (event, { campaign, contacts, settings }) => {
  return emailService.sendCampaign(campaign, contacts, settings, (progress) => {
    mainWindow.webContents.send('email:progress', progress);
  });
});

ipcMain.handle('email:pause', async () => {
  return emailService.pause();
});

ipcMain.handle('email:resume', async () => {
  return emailService.resume();
});

ipcMain.handle('email:stop', async () => {
  return emailService.stop();
});

// Email Verification
ipcMain.handle('verify:email', async (event, email) => {
  return verificationService.verifyEmail(email);
});

ipcMain.handle('verify:bulk', async (event, emails) => {
  return verificationService.verifyBulk(emails, (progress) => {
    mainWindow.webContents.send('verify:progress', progress);
  });
});

// Spam Check
ipcMain.handle('spam:check', async (event, { subject, content }) => {
  return spamService.analyzeContent(subject, content);
});

// App Settings
ipcMain.handle('settings:get', async () => {
  return db.getSettings();
});

ipcMain.handle('settings:save', async (event, settings) => {
  return db.saveSettings(settings);
});

// Statistics
ipcMain.handle('stats:getDashboard', async () => {
  return db.getDashboardStats();
});

// Export
ipcMain.handle('export:contacts', async (event, contacts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'contacts.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (!result.canceled) {
    const headers = 'email,firstName,lastName,listName,status,createdAt\n';
    const rows = contacts.map(c => 
      `${c.email},${c.firstName || ''},${c.lastName || ''},${c.listName || ''},${c.status},${c.createdAt}`
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
    const headers = 'email,status,sentAt,error\n';
    const rows = logs.map(l => 
      `${l.email},${l.status},${l.sentAt},${l.error || ''}`
    ).join('\n');
    
    fs.writeFileSync(result.filePath, headers + rows);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});
