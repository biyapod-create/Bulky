const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class BulkyDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    this.SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
    
    this.initialize();
    return this;
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  initialize() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        firstName TEXT,
        lastName TEXT,
        listId TEXT,
        status TEXT DEFAULT 'active',
        verified INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE SET NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        listId TEXT,
        status TEXT DEFAULT 'draft',
        totalEmails INTEGER DEFAULT 0,
        sentEmails INTEGER DEFAULT 0,
        failedEmails INTEGER DEFAULT 0,
        batchSize INTEGER DEFAULT 50,
        delayMinutes INTEGER DEFAULT 10,
        scheduledAt TEXT,
        startedAt TEXT,
        completedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE SET NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaign_logs (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        sentAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        host TEXT,
        port INTEGER DEFAULT 587,
        secure INTEGER DEFAULT 0,
        username TEXT,
        password TEXT,
        fromName TEXT,
        fromEmail TEXT,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT DEFAULT 'dark',
        defaultBatchSize INTEGER DEFAULT 50,
        defaultDelayMinutes INTEGER DEFAULT 10,
        maxRetriesPerEmail INTEGER DEFAULT 2,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_listId ON contacts(listId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaignId ON campaign_logs(campaignId)`);
    } catch (e) {
      // Indexes may already exist
    }

    // Initialize default settings if not exists
    const smtpExists = this.db.exec('SELECT id FROM smtp_settings WHERE id = 1');
    if (smtpExists.length === 0 || smtpExists[0].values.length === 0) {
      this.db.run('INSERT OR IGNORE INTO smtp_settings (id) VALUES (1)');
    }

    const settingsExists = this.db.exec('SELECT id FROM app_settings WHERE id = 1');
    if (settingsExists.length === 0 || settingsExists[0].values.length === 0) {
      this.db.run('INSERT OR IGNORE INTO app_settings (id) VALUES (1)');
    }

    this.save();
  }

  // Helper to convert sql.js result to array of objects
  resultToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    const values = result[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  // Contacts Methods
  getAllContacts() {
    const result = this.db.exec(`
      SELECT c.*, l.name as listName 
      FROM contacts c 
      LEFT JOIN lists l ON c.listId = l.id 
      ORDER BY c.createdAt DESC
    `);
    return this.resultToObjects(result);
  }

  addContact(contact) {
    const id = uuidv4();
    try {
      this.db.run(`
        INSERT INTO contacts (id, email, firstName, lastName, listId, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, contact.email, contact.firstName || null, contact.lastName || null, 
          contact.listId || null, contact.status || 'active']);
      this.save();
      return { success: true, id };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: 'Email already exists' };
      }
      return { success: false, error: error.message };
    }
  }

  addBulkContacts(contacts) {
    let inserted = 0;
    let skipped = 0;
    
    for (const contact of contacts) {
      try {
        this.db.run(`
          INSERT OR IGNORE INTO contacts (id, email, firstName, lastName, listId, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [uuidv4(), contact.email, contact.firstName || null, contact.lastName || null,
            contact.listId || null, contact.status || 'active']);
        
        const changes = this.db.getRowsModified();
        if (changes > 0) inserted++;
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }
    
    this.save();
    return { success: true, inserted, skipped };
  }

  updateContact(contact) {
    this.db.run(`
      UPDATE contacts 
      SET email = ?, firstName = ?, lastName = ?, listId = ?, status = ?, 
          verified = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [contact.email, contact.firstName, contact.lastName, 
        contact.listId, contact.status, contact.verified ? 1 : 0, contact.id]);
    this.save();
    return { success: true };
  }

  deleteContacts(ids) {
    const placeholders = ids.map(() => '?').join(',');
    this.db.run(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
    this.save();
    return { success: true };
  }

  getContactsByList(listId) {
    if (listId === 'all' || !listId) {
      return this.getAllContacts();
    }
    const result = this.db.exec(`
      SELECT c.*, l.name as listName 
      FROM contacts c 
      LEFT JOIN lists l ON c.listId = l.id 
      WHERE c.listId = ?
      ORDER BY c.createdAt DESC
    `, [listId]);
    return this.resultToObjects(result);
  }

  // Lists Methods
  getAllLists() {
    const result = this.db.exec(`
      SELECT l.*, COUNT(c.id) as contactCount 
      FROM lists l 
      LEFT JOIN contacts c ON l.id = c.listId 
      GROUP BY l.id 
      ORDER BY l.createdAt DESC
    `);
    return this.resultToObjects(result);
  }

  addList(list) {
    const id = uuidv4();
    this.db.run(`INSERT INTO lists (id, name, description) VALUES (?, ?, ?)`,
      [id, list.name, list.description || null]);
    this.save();
    return { success: true, id };
  }

  updateList(list) {
    this.db.run(`UPDATE lists SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [list.name, list.description, list.id]);
    this.save();
    return { success: true };
  }

  deleteList(id) {
    this.db.run('UPDATE contacts SET listId = NULL WHERE listId = ?', [id]);
    this.db.run('DELETE FROM lists WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // Templates Methods
  getAllTemplates() {
    const result = this.db.exec('SELECT * FROM templates ORDER BY createdAt DESC');
    return this.resultToObjects(result);
  }

  addTemplate(template) {
    const id = uuidv4();
    this.db.run(`INSERT INTO templates (id, name, subject, content) VALUES (?, ?, ?, ?)`,
      [id, template.name, template.subject, template.content]);
    this.save();
    return { success: true, id };
  }

  updateTemplate(template) {
    this.db.run(`UPDATE templates SET name = ?, subject = ?, content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [template.name, template.subject, template.content, template.id]);
    this.save();
    return { success: true };
  }

  deleteTemplate(id) {
    this.db.run('DELETE FROM templates WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // Campaigns Methods
  getAllCampaigns() {
    const result = this.db.exec(`
      SELECT c.*, l.name as listName 
      FROM campaigns c 
      LEFT JOIN lists l ON c.listId = l.id 
      ORDER BY c.createdAt DESC
    `);
    return this.resultToObjects(result);
  }

  addCampaign(campaign) {
    const id = uuidv4();
    this.db.run(`
      INSERT INTO campaigns (id, name, subject, content, listId, status, totalEmails, 
                             batchSize, delayMinutes, scheduledAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, campaign.name, campaign.subject, campaign.content, 
        campaign.listId || null, campaign.status || 'draft',
        campaign.totalEmails || 0, campaign.batchSize || 50,
        campaign.delayMinutes || 10, campaign.scheduledAt || null]);
    this.save();
    return { success: true, id };
  }

  updateCampaign(campaign) {
    this.db.run(`
      UPDATE campaigns 
      SET name = ?, subject = ?, content = ?, listId = ?, status = ?, 
          totalEmails = ?, sentEmails = ?, failedEmails = ?, batchSize = ?,
          delayMinutes = ?, scheduledAt = ?, startedAt = ?, completedAt = ?,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [campaign.name, campaign.subject, campaign.content, campaign.listId,
        campaign.status, campaign.totalEmails, campaign.sentEmails, 
        campaign.failedEmails, campaign.batchSize, campaign.delayMinutes,
        campaign.scheduledAt, campaign.startedAt, campaign.completedAt, campaign.id]);
    this.save();
    return { success: true };
  }

  deleteCampaign(id) {
    this.db.run('DELETE FROM campaign_logs WHERE campaignId = ?', [id]);
    this.db.run('DELETE FROM campaigns WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  addCampaignLog(log) {
    const id = uuidv4();
    this.db.run(`
      INSERT INTO campaign_logs (id, campaignId, contactId, email, status, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, log.campaignId, log.contactId || null, log.email, log.status, log.error || null]);
    this.save();
    return { success: true, id };
  }

  getCampaignLogs(campaignId) {
    const result = this.db.exec(`
      SELECT * FROM campaign_logs WHERE campaignId = ? ORDER BY sentAt DESC
    `, [campaignId]);
    return this.resultToObjects(result);
  }

  // SMTP Settings
  getSmtpSettings() {
    const result = this.db.exec('SELECT * FROM smtp_settings WHERE id = 1');
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  saveSmtpSettings(settings) {
    this.db.run(`
      UPDATE smtp_settings 
      SET host = ?, port = ?, secure = ?, username = ?, password = ?,
          fromName = ?, fromEmail = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [settings.host, settings.port, settings.secure ? 1 : 0,
        settings.username, settings.password, settings.fromName, settings.fromEmail]);
    this.save();
    return { success: true };
  }

  // App Settings
  getSettings() {
    const result = this.db.exec('SELECT * FROM app_settings WHERE id = 1');
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  saveSettings(settings) {
    this.db.run(`
      UPDATE app_settings 
      SET theme = ?, defaultBatchSize = ?, defaultDelayMinutes = ?,
          maxRetriesPerEmail = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [settings.theme, settings.defaultBatchSize, 
        settings.defaultDelayMinutes, settings.maxRetriesPerEmail]);
    this.save();
    return { success: true };
  }

  // Dashboard Stats
  getDashboardStats() {
    const totalContactsResult = this.db.exec('SELECT COUNT(*) as count FROM contacts');
    const totalContacts = totalContactsResult.length > 0 ? totalContactsResult[0].values[0][0] : 0;
    
    const totalCampaignsResult = this.db.exec('SELECT COUNT(*) as count FROM campaigns');
    const totalCampaigns = totalCampaignsResult.length > 0 ? totalCampaignsResult[0].values[0][0] : 0;
    
    const totalSentResult = this.db.exec('SELECT COALESCE(SUM(sentEmails), 0) as count FROM campaigns');
    const totalSent = totalSentResult.length > 0 ? totalSentResult[0].values[0][0] : 0;
    
    const rateResult = this.db.exec(`
      SELECT 
        CASE WHEN (sent + failed) > 0 
        THEN ROUND(sent * 100.0 / (sent + failed), 1)
        ELSE 0 END as rate
      FROM (SELECT COALESCE(SUM(sentEmails), 0) as sent, 
                   COALESCE(SUM(failedEmails), 0) as failed FROM campaigns)
    `);
    const successRate = rateResult.length > 0 ? rateResult[0].values[0][0] : 0;

    const recentResult = this.db.exec(`
      SELECT c.*, l.name as listName 
      FROM campaigns c 
      LEFT JOIN lists l ON c.listId = l.id 
      ORDER BY c.createdAt DESC 
      LIMIT 5
    `);
    const recentCampaigns = this.resultToObjects(recentResult);

    return {
      totalContacts,
      totalCampaigns,
      totalSent,
      successRate,
      recentCampaigns
    };
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = BulkyDatabase;
