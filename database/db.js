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
    
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
      this.migrateSchema();
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

  migrateSchema() {
    const migrations = [
      // Contacts table migrations
      { table: 'contacts', column: 'company', type: 'TEXT' },
      { table: 'contacts', column: 'phone', type: 'TEXT' },
      { table: 'contacts', column: 'customField1', type: 'TEXT' },
      { table: 'contacts', column: 'customField2', type: 'TEXT' },
      { table: 'contacts', column: 'tags', type: "TEXT DEFAULT '[]'" },
      { table: 'contacts', column: 'verificationScore', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'verificationMethod', type: 'TEXT' },
      { table: 'contacts', column: 'verificationDetails', type: 'TEXT' },
      { table: 'contacts', column: 'engagementScore', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'totalOpens', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'totalClicks', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'lastOpenedAt', type: 'TEXT' },
      { table: 'contacts', column: 'lastClickedAt', type: 'TEXT' },
      { table: 'contacts', column: 'bounceCount', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'lastBounceReason', type: 'TEXT' },
      { table: 'contacts', column: 'lastBounceAt', type: 'TEXT' },
      { table: 'contacts', column: 'isDisposable', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'isRoleBased', type: 'INTEGER DEFAULT 0' },
      { table: 'contacts', column: 'isCatchAll', type: 'INTEGER DEFAULT 0' },
      // Templates table migrations
      { table: 'templates', column: 'category', type: "TEXT DEFAULT 'general'" },
      // Campaigns table migrations
      { table: 'campaigns', column: 'subjectB', type: 'TEXT' },
      { table: 'campaigns', column: 'contentB', type: 'TEXT' },
      { table: 'campaigns', column: 'isABTest', type: 'INTEGER DEFAULT 0' },
      { table: 'campaigns', column: 'abTestPercent', type: 'INTEGER DEFAULT 10' },
      { table: 'campaigns', column: 'abWinner', type: 'TEXT' },
      { table: 'campaigns', column: 'openedEmails', type: 'INTEGER DEFAULT 0' },
      { table: 'campaigns', column: 'clickedEmails', type: 'INTEGER DEFAULT 0' },
      { table: 'campaigns', column: 'bouncedEmails', type: 'INTEGER DEFAULT 0' },
      { table: 'campaigns', column: 'softBouncedEmails', type: 'INTEGER DEFAULT 0' },
      // SMTP settings migrations
      { table: 'smtp_settings', column: 'replyTo', type: 'TEXT' },
      { table: 'smtp_settings', column: 'unsubscribeEmail', type: 'TEXT' },
      { table: 'smtp_settings', column: 'unsubscribeUrl', type: 'TEXT' },
      // Campaign logs migrations
      { table: 'campaign_logs', column: 'variant', type: "TEXT DEFAULT 'A'" },
      { table: 'campaign_logs', column: 'smtpCode', type: 'INTEGER' },
      { table: 'campaign_logs', column: 'smtpResponse', type: 'TEXT' },
      { table: 'campaign_logs', column: 'failureType', type: 'TEXT' },
      { table: 'campaign_logs', column: 'failureReason', type: 'TEXT' },
      { table: 'campaign_logs', column: 'trackingId', type: 'TEXT' },
      { table: 'campaign_logs', column: 'openedAt', type: 'TEXT' },
      { table: 'campaign_logs', column: 'clickedAt', type: 'TEXT' },
      // Blacklist migrations
      { table: 'blacklist', column: 'bounceType', type: 'TEXT' },
      { table: 'blacklist', column: 'smtpCode', type: 'INTEGER' },
    ];

    for (const migration of migrations) {
      try {
        this.db.run(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.type}`);
      } catch (e) {}
    }
  }

  initialize() {
    // Lists table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tags table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#5bb4d4',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Contacts table with enhanced verification fields
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        firstName TEXT,
        lastName TEXT,
        company TEXT,
        phone TEXT,
        customField1 TEXT,
        customField2 TEXT,
        listId TEXT,
        tags TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        verified INTEGER DEFAULT 0,
        verificationScore INTEGER DEFAULT 0,
        verificationMethod TEXT,
        verificationDetails TEXT,
        engagementScore INTEGER DEFAULT 0,
        totalOpens INTEGER DEFAULT 0,
        totalClicks INTEGER DEFAULT 0,
        lastOpenedAt TEXT,
        lastClickedAt TEXT,
        bounceCount INTEGER DEFAULT 0,
        lastBounceReason TEXT,
        lastBounceAt TEXT,
        isDisposable INTEGER DEFAULT 0,
        isRoleBased INTEGER DEFAULT 0,
        isCatchAll INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE SET NULL
      )
    `);

    // Blacklist table with bounce tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        domain TEXT,
        reason TEXT,
        source TEXT DEFAULT 'manual',
        bounceType TEXT,
        smtpCode INTEGER,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Templates table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SMTP Accounts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS smtp_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER DEFAULT 587,
        secure INTEGER DEFAULT 0,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        fromName TEXT,
        fromEmail TEXT,
        replyTo TEXT,
        dailyLimit INTEGER DEFAULT 500,
        sentToday INTEGER DEFAULT 0,
        lastResetDate TEXT,
        isActive INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Campaigns table with bounce tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        subjectB TEXT,
        content TEXT NOT NULL,
        contentB TEXT,
        isABTest INTEGER DEFAULT 0,
        abTestPercent INTEGER DEFAULT 10,
        abWinner TEXT,
        listId TEXT,
        selectedTags TEXT,
        status TEXT DEFAULT 'draft',
        totalEmails INTEGER DEFAULT 0,
        sentEmails INTEGER DEFAULT 0,
        failedEmails INTEGER DEFAULT 0,
        openedEmails INTEGER DEFAULT 0,
        clickedEmails INTEGER DEFAULT 0,
        bouncedEmails INTEGER DEFAULT 0,
        softBouncedEmails INTEGER DEFAULT 0,
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

    // Campaign logs with full SMTP tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaign_logs (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        variant TEXT DEFAULT 'A',
        smtpCode INTEGER,
        smtpResponse TEXT,
        failureType TEXT,
        failureReason TEXT,
        trackingId TEXT,
        openedAt TEXT,
        clickedAt TEXT,
        error TEXT,
        sentAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    // Email tracking table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS email_tracking (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT,
        email TEXT NOT NULL,
        type TEXT NOT NULL,
        link TEXT,
        userAgent TEXT,
        ipAddress TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    // Unsubscribes table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS unsubscribes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        campaignId TEXT,
        reason TEXT,
        unsubscribedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Spam replacements table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS spam_replacements (
        id TEXT PRIMARY KEY,
        spamWord TEXT NOT NULL UNIQUE,
        replacement TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        isActive INTEGER DEFAULT 1
      )
    `);

    // Legacy SMTP settings
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
        replyTo TEXT,
        unsubscribeEmail TEXT,
        unsubscribeUrl TEXT,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // App settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT DEFAULT 'light',
        defaultBatchSize INTEGER DEFAULT 50,
        defaultDelayMinutes INTEGER DEFAULT 10,
        maxRetriesPerEmail INTEGER DEFAULT 2,
        enableTracking INTEGER DEFAULT 1,
        trackingDomain TEXT,
        enableSmtpVerification INTEGER DEFAULT 1,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_listId ON contacts(listId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_verified ON contacts(verified)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_bounceCount ON contacts(bounceCount)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaignId ON campaign_logs(campaignId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_trackingId ON campaign_logs(trackingId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_blacklist_email ON blacklist(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_blacklist_domain ON blacklist(domain)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tracking_campaignId ON email_tracking(campaignId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email)`);
    } catch (e) {}

    // Migrations for new columns
    try { this.db.run(`ALTER TABLE campaigns ADD COLUMN selectedTags TEXT`); } catch (e) {}

    // Initialize default settings
    const smtpExists = this.db.exec('SELECT id FROM smtp_settings WHERE id = 1');
    if (smtpExists.length === 0 || smtpExists[0].values.length === 0) {
      this.db.run('INSERT OR IGNORE INTO smtp_settings (id) VALUES (1)');
    }

    const settingsExists = this.db.exec('SELECT id FROM app_settings WHERE id = 1');
    if (settingsExists.length === 0 || settingsExists[0].values.length === 0) {
      this.db.run('INSERT OR IGNORE INTO app_settings (id) VALUES (1)');
    }

    this.initializeSpamReplacements();
    this.save();
  }

  initializeSpamReplacements() {
    const defaults = [
      { word: 'free', replacement: 'complimentary', category: 'pricing' },
      { word: 'buy now', replacement: 'get started today', category: 'cta' },
      { word: 'click here', replacement: 'learn more', category: 'cta' },
      { word: 'act now', replacement: 'take action today', category: 'urgency' },
      { word: 'limited time', replacement: 'available until', category: 'urgency' },
      { word: 'urgent', replacement: 'important', category: 'urgency' },
      { word: 'winner', replacement: 'selected recipient', category: 'claims' },
      { word: 'congratulations', replacement: 'great news', category: 'claims' },
      { word: 'guarantee', replacement: 'commitment', category: 'claims' },
      { word: 'order now', replacement: 'place your order', category: 'cta' },
      { word: 'special offer', replacement: 'exclusive opportunity', category: 'pricing' },
      { word: 'earn money', replacement: 'generate income', category: 'money' },
      { word: 'make money', replacement: 'build revenue', category: 'money' },
      { word: 'cash', replacement: 'funds', category: 'money' },
      { word: 'double your', replacement: 'increase your', category: 'claims' },
      { word: 'million dollars', replacement: 'significant amount', category: 'money' },
      { word: 'work from home', replacement: 'remote opportunity', category: 'claims' },
      { word: 'no obligation', replacement: 'no commitment required', category: 'claims' },
      { word: 'risk free', replacement: 'worry-free', category: 'claims' },
      { word: 'exclusive deal', replacement: 'special opportunity', category: 'pricing' }
    ];

    for (const item of defaults) {
      try {
        this.db.run(`INSERT OR IGNORE INTO spam_replacements (id, spamWord, replacement, category) VALUES (?, ?, ?, ?)`,
          [uuidv4(), item.word, item.replacement, item.category]);
      } catch (e) {}
    }
  }

  resultToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    const values = result[0].values;
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  // ==================== CONTACTS ====================
  getAllContacts() {
    const result = this.db.exec(`
      SELECT c.*, l.name as listName 
      FROM contacts c 
      LEFT JOIN lists l ON c.listId = l.id 
      ORDER BY c.createdAt DESC
    `);
    return this.resultToObjects(result);
  }

  getContactsByFilter(filter = {}) {
    let query = `SELECT c.*, l.name as listName FROM contacts c LEFT JOIN lists l ON c.listId = l.id WHERE 1=1`;
    const params = [];

    if (filter.listId) { query += ` AND c.listId = ?`; params.push(filter.listId); }
    if (filter.status) { query += ` AND c.status = ?`; params.push(filter.status); }
    if (filter.verified !== undefined && filter.verified !== '') { 
      query += ` AND c.verified = ?`; params.push(filter.verified === '1' || filter.verified === 1 ? 1 : 0); 
    }
    if (filter.search) {
      query += ` AND (c.email LIKE ? OR c.firstName LIKE ? OR c.lastName LIKE ? OR c.company LIKE ?)`;
      const s = `%${filter.search}%`; params.push(s, s, s, s);
    }
    if (filter.tag) { query += ` AND c.tags LIKE ?`; params.push(`%"${filter.tag}"%`); }
    if (filter.hasBounced) { query += ` AND c.bounceCount > 0`; }
    if (filter.isDisposable) { query += ` AND c.isDisposable = 1`; }
    if (filter.isRoleBased) { query += ` AND c.isRoleBased = 1`; }

    query += ` ORDER BY c.${filter.sortBy || 'createdAt'} ${filter.sortOrder || 'DESC'}`;
    if (filter.limit) { query += ` LIMIT ?`; params.push(filter.limit); }

    const result = this.db.exec(query, params);
    return this.resultToObjects(result);
  }

  // Get recipient count for campaign targeting (with tag support)
  getRecipientCount(filter = {}) {
    let query = `SELECT COUNT(*) as count FROM contacts c WHERE c.status = 'active'`;
    const params = [];

    if (filter.listId) { 
      query += ` AND c.listId = ?`; 
      params.push(filter.listId); 
    }
    
    // Tag filtering - contact must have ALL selected tags
    if (filter.tags && filter.tags.length > 0) {
      for (const tagId of filter.tags) {
        query += ` AND c.tags LIKE ?`;
        params.push(`%"${tagId}"%`);
      }
    }

    // Exclude bounced, blacklisted, unsubscribed
    query += ` AND c.bounceCount < 2`;
    query += ` AND c.email NOT IN (SELECT email FROM blacklist WHERE email IS NOT NULL)`;
    query += ` AND c.email NOT IN (SELECT email FROM unsubscribes WHERE email IS NOT NULL)`;

    const result = this.db.exec(query, params);
    return result[0]?.values[0]?.[0] || 0;
  }

  // Get contacts for campaign sending (with tag support)
  getContactsForCampaign(filter = {}) {
    let query = `SELECT c.* FROM contacts c WHERE c.status = 'active'`;
    const params = [];

    if (filter.listId) { 
      query += ` AND c.listId = ?`; 
      params.push(filter.listId); 
    }
    
    // Tag filtering
    if (filter.tags && filter.tags.length > 0) {
      for (const tagId of filter.tags) {
        query += ` AND c.tags LIKE ?`;
        params.push(`%"${tagId}"%`);
      }
    }

    // Exclude problematic contacts
    query += ` AND c.bounceCount < 2`;
    query += ` AND c.email NOT IN (SELECT email FROM blacklist WHERE email IS NOT NULL)`;
    query += ` AND c.email NOT IN (SELECT email FROM unsubscribes WHERE email IS NOT NULL)`;

    query += ` ORDER BY c.createdAt DESC`;

    const result = this.db.exec(query, params);
    return this.resultToObjects(result);
  }

  addContact(contact) {
    const id = uuidv4();
    try {
      this.db.run(`
        INSERT INTO contacts (id, email, firstName, lastName, company, phone, customField1, customField2, listId, tags, status, isDisposable, isRoleBased)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, contact.email, contact.firstName || null, contact.lastName || null,
          contact.company || null, contact.phone || null, contact.customField1 || null,
          contact.customField2 || null, contact.listId || null,
          JSON.stringify(contact.tags || []), contact.status || 'active',
          contact.isDisposable ? 1 : 0, contact.isRoleBased ? 1 : 0]);
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
    let inserted = 0, skipped = 0;
    for (const contact of contacts) {
      if (this.isBlacklisted(contact.email)) { skipped++; continue; }
      try {
        this.db.run(`
          INSERT OR IGNORE INTO contacts (id, email, firstName, lastName, company, phone, customField1, customField2, listId, tags, status, isDisposable, isRoleBased)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), contact.email, contact.firstName || null, contact.lastName || null,
            contact.company || null, contact.phone || null, contact.customField1 || null,
            contact.customField2 || null, contact.listId || null,
            JSON.stringify(contact.tags || []), contact.status || 'active',
            contact.isDisposable ? 1 : 0, contact.isRoleBased ? 1 : 0]);
        if (this.db.getRowsModified() > 0) inserted++; else skipped++;
      } catch (e) { skipped++; }
    }
    this.save();
    return { success: true, inserted, skipped };
  }

  updateContact(contact) {
    this.db.run(`
      UPDATE contacts 
      SET email = ?, firstName = ?, lastName = ?, company = ?, phone = ?,
          customField1 = ?, customField2 = ?, listId = ?, tags = ?, status = ?, 
          verified = ?, verificationScore = ?, verificationMethod = ?, verificationDetails = ?,
          isDisposable = ?, isRoleBased = ?, isCatchAll = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [contact.email, contact.firstName, contact.lastName, contact.company, contact.phone,
        contact.customField1, contact.customField2, contact.listId,
        JSON.stringify(contact.tags || []), contact.status,
        contact.verified ? 1 : 0, contact.verificationScore || 0,
        contact.verificationMethod || null, contact.verificationDetails || null,
        contact.isDisposable ? 1 : 0, contact.isRoleBased ? 1 : 0, contact.isCatchAll ? 1 : 0,
        contact.id]);
    this.save();
    return { success: true };
  }

  // Update contact verification result
  updateContactVerification(contactId, verificationResult) {
    this.db.run(`
      UPDATE contacts 
      SET verified = ?, verificationScore = ?, verificationMethod = ?, verificationDetails = ?,
          isDisposable = ?, isRoleBased = ?, isCatchAll = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      verificationResult.status === 'valid' ? 1 : 0,
      verificationResult.score || 0,
      verificationResult.details?.method || 'unknown',
      JSON.stringify(verificationResult),
      verificationResult.details?.isDisposable ? 1 : 0,
      verificationResult.details?.isRoleBased ? 1 : 0,
      verificationResult.details?.isCatchAll ? 1 : 0,
      contactId
    ]);
    this.save();
  }

  // Increment bounce count for a contact
  incrementContactBounce(contactId, reason) {
    this.db.run(`
      UPDATE contacts 
      SET bounceCount = bounceCount + 1, lastBounceReason = ?, lastBounceAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [reason, contactId]);
    this.save();
  }

  updateContactEngagement(contactId, type) {
    const field = type === 'open' ? 'totalOpens' : 'totalClicks';
    const dateField = type === 'open' ? 'lastOpenedAt' : 'lastClickedAt';
    const scoreIncrease = type === 'open' ? 10 : 20;
    this.db.run(`UPDATE contacts SET ${field} = ${field} + 1, ${dateField} = CURRENT_TIMESTAMP, engagementScore = engagementScore + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [scoreIncrease, contactId]);
    this.save();
  }

  deleteContacts(ids) {
    const placeholders = ids.map(() => '?').join(',');
    this.db.run(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
    this.save();
    return { success: true, deleted: ids.length };
  }

  deleteContactsByVerification(status) {
    let condition = status === 'invalid' ? 'verified = 0 AND verificationScore < 40' : 'verified = 0 AND verificationScore >= 40 AND verificationScore < 70';
    const result = this.db.exec(`SELECT COUNT(*) as count FROM contacts WHERE ${condition}`);
    const count = result.length > 0 ? result[0].values[0][0] : 0;
    this.db.run(`DELETE FROM contacts WHERE ${condition}`);
    this.save();
    return { success: true, deleted: count };
  }

  // Delete bounced contacts
  deleteBouncedContacts(minBounceCount = 2) {
    const result = this.db.exec(`SELECT COUNT(*) as count FROM contacts WHERE bounceCount >= ?`, [minBounceCount]);
    const count = result.length > 0 ? result[0].values[0][0] : 0;
    this.db.run(`DELETE FROM contacts WHERE bounceCount >= ?`, [minBounceCount]);
    this.save();
    return { success: true, deleted: count };
  }

  // Get bounced contacts
  getBouncedContacts() {
    const result = this.db.exec(`SELECT * FROM contacts WHERE bounceCount > 0 ORDER BY bounceCount DESC, lastBounceAt DESC`);
    return this.resultToObjects(result);
  }

  getContactsByList(listId) {
    if (listId === 'all' || !listId) return this.getAllContacts();
    const result = this.db.exec(`SELECT c.*, l.name as listName FROM contacts c LEFT JOIN lists l ON c.listId = l.id WHERE c.listId = ? ORDER BY c.createdAt DESC`, [listId]);
    return this.resultToObjects(result);
  }

  // ==================== TAGS ====================
  getAllTags() {
    const result = this.db.exec('SELECT * FROM tags ORDER BY name');
    return this.resultToObjects(result);
  }

  addTag(tag) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`, [id, tag.name, tag.color || '#5bb4d4']);
      this.save();
      return { success: true, id };
    } catch (e) { return { success: false, error: 'Tag already exists' }; }
  }

  deleteTag(id) {
    this.db.run('DELETE FROM tags WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // ==================== LISTS ====================
  getAllLists() {
    const result = this.db.exec(`SELECT l.*, COUNT(c.id) as contactCount FROM lists l LEFT JOIN contacts c ON l.id = c.listId GROUP BY l.id ORDER BY l.createdAt DESC`);
    return this.resultToObjects(result);
  }

  addList(list) {
    const id = uuidv4();
    this.db.run(`INSERT INTO lists (id, name, description) VALUES (?, ?, ?)`, [id, list.name, list.description || null]);
    this.save();
    return { success: true, id };
  }

  updateList(list) {
    this.db.run(`UPDATE lists SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [list.name, list.description, list.id]);
    this.save();
    return { success: true };
  }

  deleteList(id) {
    this.db.run('UPDATE contacts SET listId = NULL WHERE listId = ?', [id]);
    this.db.run('DELETE FROM lists WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // ==================== BLACKLIST ====================
  getAllBlacklist() {
    const result = this.db.exec('SELECT * FROM blacklist ORDER BY createdAt DESC');
    return this.resultToObjects(result);
  }

  addToBlacklist(entry) {
    const id = uuidv4();
    try {
      if (entry.email) {
        this.db.run(`INSERT OR IGNORE INTO blacklist (id, email, reason, source, bounceType, smtpCode) VALUES (?, ?, ?, ?, ?, ?)`, 
          [id, entry.email.toLowerCase(), entry.reason || null, entry.source || 'manual', entry.bounceType || null, entry.smtpCode || null]);
      } else if (entry.domain) {
        this.db.run(`INSERT OR IGNORE INTO blacklist (id, domain, reason, source) VALUES (?, ?, ?, ?)`, 
          [id, entry.domain.toLowerCase(), entry.reason || null, entry.source || 'manual']);
      }
      this.save();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  addBulkToBlacklist(entries, source = 'import') {
    let added = 0;
    for (const entry of entries) {
      try {
        this.db.run(`INSERT OR IGNORE INTO blacklist (id, email, reason, source) VALUES (?, ?, ?, ?)`, 
          [uuidv4(), (entry.email || entry).toLowerCase(), 'Bulk import', source]);
        if (this.db.getRowsModified() > 0) added++;
      } catch (e) {}
    }
    this.save();
    return { success: true, added };
  }

  removeFromBlacklist(id) {
    this.db.run('DELETE FROM blacklist WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  isBlacklisted(email) {
    if (!email) return false;
    const emailLower = email.toLowerCase();
    const domain = emailLower.split('@')[1];
    const result = this.db.exec(`SELECT COUNT(*) as count FROM blacklist WHERE email = ? OR domain = ?`, [emailLower, domain]);
    return result.length > 0 && result[0].values[0][0] > 0;
  }

  // ==================== UNSUBSCRIBES ====================
  getAllUnsubscribes() {
    const result = this.db.exec('SELECT * FROM unsubscribes ORDER BY unsubscribedAt DESC');
    return this.resultToObjects(result);
  }

  addUnsubscribe(email, campaignId = null, reason = null) {
    try {
      this.db.run(`INSERT OR IGNORE INTO unsubscribes (id, email, campaignId, reason) VALUES (?, ?, ?, ?)`, 
        [uuidv4(), email.toLowerCase(), campaignId, reason]);
      this.addToBlacklist({ email, reason: 'Unsubscribed', source: 'unsubscribe' });
      this.save();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  isUnsubscribed(email) {
    const result = this.db.exec('SELECT COUNT(*) as count FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
    return result.length > 0 && result[0].values[0][0] > 0;
  }

  removeUnsubscribe(email) {
    try {
      this.db.run('DELETE FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
      this.save();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  // ==================== TEMPLATES ====================
  getAllTemplates() {
    const result = this.db.exec('SELECT * FROM templates ORDER BY createdAt DESC');
    return this.resultToObjects(result);
  }

  getTemplatesByCategory(category) {
    const result = this.db.exec('SELECT * FROM templates WHERE category = ? ORDER BY createdAt DESC', [category]);
    return this.resultToObjects(result);
  }

  addTemplate(template) {
    const id = uuidv4();
    this.db.run(`INSERT INTO templates (id, name, subject, content, category) VALUES (?, ?, ?, ?, ?)`, 
      [id, template.name, template.subject, template.content, template.category || 'general']);
    this.save();
    return { success: true, id };
  }

  updateTemplate(template) {
    this.db.run(`UPDATE templates SET name = ?, subject = ?, content = ?, category = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, 
      [template.name, template.subject, template.content, template.category || 'general', template.id]);
    this.save();
    return { success: true };
  }

  deleteTemplate(id) {
    this.db.run('DELETE FROM templates WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // ==================== SMTP ACCOUNTS ====================
  getAllSmtpAccounts() {
    const result = this.db.exec('SELECT * FROM smtp_accounts ORDER BY priority, createdAt');
    return this.resultToObjects(result);
  }

  getActiveSmtpAccounts() {
    const today = new Date().toISOString().split('T')[0];
    this.db.run(`UPDATE smtp_accounts SET sentToday = 0, lastResetDate = ? WHERE lastResetDate != ? OR lastResetDate IS NULL`, [today, today]);
    const result = this.db.exec(`SELECT * FROM smtp_accounts WHERE isActive = 1 AND sentToday < dailyLimit ORDER BY priority, sentToday`);
    return this.resultToObjects(result);
  }

  addSmtpAccount(account) {
    const id = uuidv4();
    this.db.run(`INSERT INTO smtp_accounts (id, name, host, port, secure, username, password, fromName, fromEmail, replyTo, dailyLimit, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account.name, account.host, account.port || 587, account.secure ? 1 : 0, account.username, account.password, account.fromName, account.fromEmail, account.replyTo, account.dailyLimit || 500, account.priority || 1]);
    this.save();
    return { success: true, id };
  }

  updateSmtpAccount(account) {
    this.db.run(`UPDATE smtp_accounts SET name = ?, host = ?, port = ?, secure = ?, username = ?, password = ?, fromName = ?, fromEmail = ?, replyTo = ?, dailyLimit = ?, isActive = ?, priority = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [account.name, account.host, account.port, account.secure ? 1 : 0, account.username, account.password, account.fromName, account.fromEmail, account.replyTo, account.dailyLimit, account.isActive ? 1 : 0, account.priority, account.id]);
    this.save();
    return { success: true };
  }

  incrementSmtpSentCount(accountId) {
    this.db.run(`UPDATE smtp_accounts SET sentToday = sentToday + 1 WHERE id = ?`, [accountId]);
    this.save();
  }

  deleteSmtpAccount(id) {
    this.db.run('DELETE FROM smtp_accounts WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // Legacy SMTP settings
  getSmtpSettings() {
    const result = this.db.exec('SELECT * FROM smtp_settings WHERE id = 1');
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  saveSmtpSettings(settings) {
    this.db.run(`UPDATE smtp_settings SET host = ?, port = ?, secure = ?, username = ?, password = ?, fromName = ?, fromEmail = ?, replyTo = ?, unsubscribeEmail = ?, unsubscribeUrl = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1`,
      [settings.host, settings.port, settings.secure ? 1 : 0, settings.username, settings.password, settings.fromName, settings.fromEmail, settings.replyTo, settings.unsubscribeEmail, settings.unsubscribeUrl]);
    this.save();
    return { success: true };
  }

  // ==================== SPAM REPLACEMENTS ====================
  getAllSpamReplacements() {
    const result = this.db.exec('SELECT * FROM spam_replacements WHERE isActive = 1 ORDER BY spamWord');
    return this.resultToObjects(result);
  }

  addSpamReplacement(item) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO spam_replacements (id, spamWord, replacement, category) VALUES (?, ?, ?, ?)`, 
        [id, item.spamWord, item.replacement, item.category || 'general']);
      this.save();
      return { success: true, id };
    } catch (e) { return { success: false, error: 'Word already exists' }; }
  }

  updateSpamReplacement(item) {
    this.db.run(`UPDATE spam_replacements SET spamWord = ?, replacement = ?, category = ?, isActive = ? WHERE id = ?`, 
      [item.spamWord, item.replacement, item.category, item.isActive ? 1 : 0, item.id]);
    this.save();
    return { success: true };
  }

  deleteSpamReplacement(id) {
    this.db.run('DELETE FROM spam_replacements WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  // ==================== CAMPAIGNS ====================
  getAllCampaigns() {
    const result = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id ORDER BY c.createdAt DESC`);
    return this.resultToObjects(result);
  }

  getCampaign(id) {
    const result = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id WHERE c.id = ?`, [id]);
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  getScheduledCampaigns() {
    const result = this.db.exec(`SELECT * FROM campaigns WHERE status = 'scheduled' ORDER BY scheduledAt`);
    return this.resultToObjects(result);
  }

  addCampaign(campaign) {
    const id = uuidv4();
    const selectedTags = campaign.selectedTags ? JSON.stringify(campaign.selectedTags) : null;
    this.db.run(`INSERT INTO campaigns (id, name, subject, subjectB, content, contentB, isABTest, abTestPercent, listId, selectedTags, status, totalEmails, batchSize, delayMinutes, scheduledAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, campaign.name, campaign.subject, campaign.subjectB || null, campaign.content, campaign.contentB || null, campaign.isABTest ? 1 : 0, campaign.abTestPercent || 10, campaign.listId || null, selectedTags, campaign.status || 'draft', campaign.totalEmails || 0, campaign.batchSize || 50, campaign.delayMinutes || 10, campaign.scheduledAt || null]);
    this.save();
    return { success: true, id };
  }

  updateCampaign(campaign) {
    const selectedTags = campaign.selectedTags ? (typeof campaign.selectedTags === 'string' ? campaign.selectedTags : JSON.stringify(campaign.selectedTags)) : null;
    this.db.run(`UPDATE campaigns SET name = ?, subject = ?, subjectB = ?, content = ?, contentB = ?, isABTest = ?, abTestPercent = ?, abWinner = ?, listId = ?, selectedTags = ?, status = ?, totalEmails = ?, sentEmails = ?, failedEmails = ?, openedEmails = ?, clickedEmails = ?, bouncedEmails = ?, softBouncedEmails = ?, batchSize = ?, delayMinutes = ?, scheduledAt = ?, startedAt = ?, completedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [campaign.name, campaign.subject, campaign.subjectB, campaign.content, campaign.contentB, campaign.isABTest ? 1 : 0, campaign.abTestPercent, campaign.abWinner, campaign.listId, selectedTags, campaign.status, campaign.totalEmails, campaign.sentEmails, campaign.failedEmails, campaign.openedEmails || 0, campaign.clickedEmails || 0, campaign.bouncedEmails || 0, campaign.softBouncedEmails || 0, campaign.batchSize, campaign.delayMinutes, campaign.scheduledAt, campaign.startedAt, campaign.completedAt, campaign.id]);
    this.save();
    return { success: true };
  }

  deleteCampaign(id) {
    this.db.run('DELETE FROM campaign_logs WHERE campaignId = ?', [id]);
    this.db.run('DELETE FROM email_tracking WHERE campaignId = ?', [id]);
    this.db.run('DELETE FROM campaigns WHERE id = ?', [id]);
    this.save();
    return { success: true };
  }

  scheduleCampaign(campaignId, scheduledAt) {
    this.db.run(`UPDATE campaigns SET status = 'scheduled', scheduledAt = ? WHERE id = ?`, [scheduledAt, campaignId]);
    this.save();
    return { success: true };
  }

  cancelScheduledCampaign(campaignId) {
    this.db.run(`UPDATE campaigns SET status = 'draft', scheduledAt = NULL WHERE id = ?`, [campaignId]);
    this.save();
    return { success: true };
  }

  // ==================== CAMPAIGN LOGS ====================
  addCampaignLog(log) {
    const id = uuidv4();
    this.db.run(`INSERT INTO campaign_logs (id, campaignId, contactId, email, status, variant, smtpCode, smtpResponse, failureType, failureReason, trackingId, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, log.campaignId, log.contactId || null, log.email, log.status, log.variant || 'A', log.smtpCode || null, log.smtpResponse || null, log.failureType || null, log.failureReason || null, log.trackingId || null, log.error || null]);
    this.save();
    return { success: true, id };
  }

  getCampaignLogs(campaignId) {
    const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? ORDER BY sentAt DESC`, [campaignId]);
    return this.resultToObjects(result);
  }

  // Get logs by status (for analytics)
  getCampaignLogsByStatus(campaignId, status) {
    const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND status = ? ORDER BY sentAt DESC`, [campaignId, status]);
    return this.resultToObjects(result);
  }

  // Get bounced emails for a campaign
  getCampaignBounces(campaignId) {
    const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND (status = 'bounced' OR status = 'soft_bounce' OR failureType LIKE '%bounce%') ORDER BY sentAt DESC`, [campaignId]);
    return this.resultToObjects(result);
  }

  // Update log when email is opened/clicked
  updateCampaignLogTracking(trackingId, type) {
    const field = type === 'open' ? 'openedAt' : 'clickedAt';
    this.db.run(`UPDATE campaign_logs SET ${field} = CURRENT_TIMESTAMP WHERE trackingId = ?`, [trackingId]);
    this.save();
  }

  // Get campaign log by tracking ID
  getCampaignLogByTracking(campaignId, trackingId) {
    const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND trackingId = ?`, [campaignId, trackingId]);
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  // Update log when email is opened
  updateCampaignLogOpened(campaignId, trackingId) {
    this.db.run(`UPDATE campaign_logs SET openedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND trackingId = ? AND openedAt IS NULL`, [campaignId, trackingId]);
    this.save();
  }

  // Update log when email is clicked
  updateCampaignLogClicked(campaignId, trackingId) {
    this.db.run(`UPDATE campaign_logs SET clickedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND trackingId = ? AND clickedAt IS NULL`, [campaignId, trackingId]);
    this.save();
  }

  // ==================== EMAIL TRACKING ====================
  addTrackingEvent(event) {
    const id = uuidv4();
    this.db.run(`INSERT INTO email_tracking (id, campaignId, contactId, email, type, link, userAgent, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, event.campaignId, event.contactId || null, event.email, event.type, event.link || null, event.userAgent || null, event.ipAddress || null]);
    if (event.type === 'open') this.db.run(`UPDATE campaigns SET openedEmails = openedEmails + 1 WHERE id = ?`, [event.campaignId]);
    else if (event.type === 'click') this.db.run(`UPDATE campaigns SET clickedEmails = clickedEmails + 1 WHERE id = ?`, [event.campaignId]);
    if (event.contactId) this.updateContactEngagement(event.contactId, event.type);
    if (event.trackingId) this.updateCampaignLogTracking(event.trackingId, event.type);
    this.save();
    return { success: true, id };
  }

  getTrackingEvents(campaignId) {
    const result = this.db.exec(`SELECT * FROM email_tracking WHERE campaignId = ? ORDER BY createdAt DESC`, [campaignId]);
    return this.resultToObjects(result);
  }

  // ==================== ANALYTICS ====================
  getCampaignAnalytics(campaignId) {
    const campaign = this.db.exec(`SELECT * FROM campaigns WHERE id = ?`, [campaignId]);
    const campaignData = this.resultToObjects(campaign)[0] || {};
    
    // Get status breakdown from logs
    const statusBreakdown = this.db.exec(`
      SELECT status, failureType, COUNT(*) as count 
      FROM campaign_logs 
      WHERE campaignId = ? 
      GROUP BY status, failureType
    `, [campaignId]);
    
    // Get bounce reasons
    const bounceReasons = this.db.exec(`
      SELECT failureReason, COUNT(*) as count 
      FROM campaign_logs 
      WHERE campaignId = ? AND (status = 'bounced' OR status = 'soft_bounce' OR status = 'failed')
      GROUP BY failureReason 
      ORDER BY count DESC 
      LIMIT 10
    `, [campaignId]);
    
    const opensByHour = this.db.exec(`
      SELECT strftime('%H', createdAt) as hour, COUNT(*) as count 
      FROM email_tracking 
      WHERE campaignId = ? AND type = 'open' 
      GROUP BY hour ORDER BY hour
    `, [campaignId]);
    
    const clicksByLink = this.db.exec(`
      SELECT link, COUNT(*) as count 
      FROM email_tracking 
      WHERE campaignId = ? AND type = 'click' AND link IS NOT NULL 
      GROUP BY link ORDER BY count DESC LIMIT 10
    `, [campaignId]);

    // Calculate real metrics
    const sent = campaignData.sentEmails || 0;
    const bounced = campaignData.bouncedEmails || 0;
    const failed = campaignData.failedEmails || 0;
    const opened = campaignData.openedEmails || 0;
    const clicked = campaignData.clickedEmails || 0;
    const delivered = sent - bounced;

    return {
      campaign: campaignData,
      metrics: {
        sent,
        delivered,
        bounced,
        failed,
        opened,
        clicked,
        deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(1) : 0,
        bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(1) : 0,
        openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : 0,
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(1) : 0
      },
      statusBreakdown: this.resultToObjects(statusBreakdown),
      bounceReasons: this.resultToObjects(bounceReasons),
      opensByHour: this.resultToObjects(opensByHour),
      clicksByLink: this.resultToObjects(clicksByLink)
    };
  }

  // ==================== APP SETTINGS ====================
  getSettings() {
    const result = this.db.exec('SELECT * FROM app_settings WHERE id = 1');
    const arr = this.resultToObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  saveSettings(settings) {
    this.db.run(`UPDATE app_settings SET theme = ?, defaultBatchSize = ?, defaultDelayMinutes = ?, maxRetriesPerEmail = ?, enableTracking = ?, trackingDomain = ?, enableSmtpVerification = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1`,
      [settings.theme, settings.defaultBatchSize, settings.defaultDelayMinutes, settings.maxRetriesPerEmail, settings.enableTracking ? 1 : 0, settings.trackingDomain, settings.enableSmtpVerification ? 1 : 0]);
    this.save();
    return { success: true };
  }

  // ==================== DASHBOARD STATS ====================
  getDashboardStats() {
    const totalContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts')[0]?.values[0][0] || 0;
    const verifiedContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 1')[0]?.values[0][0] || 0;
    const bouncedContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE bounceCount > 0')[0]?.values[0][0] || 0;
    const totalCampaigns = this.db.exec('SELECT COUNT(*) as count FROM campaigns')[0]?.values[0][0] || 0;
    const totalSent = this.db.exec('SELECT COALESCE(SUM(sentEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
    const totalBounced = this.db.exec('SELECT COALESCE(SUM(bouncedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
    const totalOpened = this.db.exec('SELECT COALESCE(SUM(openedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
    const totalClicked = this.db.exec('SELECT COALESCE(SUM(clickedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
    
    // Calculate real rates
    const delivered = totalSent - totalBounced;
    const deliveryRate = totalSent > 0 ? ((delivered / totalSent) * 100).toFixed(1) : 0;
    const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : 0;
    const openRate = delivered > 0 ? ((totalOpened / delivered) * 100).toFixed(1) : 0;
    const clickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : 0;

    const recentResult = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id ORDER BY c.createdAt DESC LIMIT 5`);
    const blacklistCount = this.db.exec('SELECT COUNT(*) as count FROM blacklist')[0]?.values[0][0] || 0;
    const unsubscribeCount = this.db.exec('SELECT COUNT(*) as count FROM unsubscribes')[0]?.values[0][0] || 0;

    // Recent bounces
    const recentBounces = this.db.exec(`
      SELECT email, failureReason, sentAt 
      FROM campaign_logs 
      WHERE status = 'bounced' OR failureType = 'hard_bounce'
      ORDER BY sentAt DESC LIMIT 10
    `);

    return {
      totalContacts, 
      verifiedContacts,
      bouncedContacts,
      totalCampaigns, 
      totalSent, 
      totalBounced,
      totalOpened,
      totalClicked,
      delivered,
      deliveryRate,
      bounceRate,
      openRate,
      clickRate,
      blacklistCount, 
      unsubscribeCount,
      recentCampaigns: this.resultToObjects(recentResult),
      recentBounces: this.resultToObjects(recentBounces)
    };
  }

  // Get verification stats
  getVerificationStats() {
    const total = this.db.exec('SELECT COUNT(*) as count FROM contacts')[0]?.values[0][0] || 0;
    const valid = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 1 AND verificationScore >= 80')[0]?.values[0][0] || 0;
    const risky = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verificationScore >= 50 AND verificationScore < 80')[0]?.values[0][0] || 0;
    const invalid = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 0 AND verificationScore < 50 AND verificationScore > 0')[0]?.values[0][0] || 0;
    const unverified = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verificationScore = 0')[0]?.values[0][0] || 0;
    const disposable = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isDisposable = 1')[0]?.values[0][0] || 0;
    const roleBased = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isRoleBased = 1')[0]?.values[0][0] || 0;
    const catchAll = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isCatchAll = 1')[0]?.values[0][0] || 0;

    return { total, valid, risky, invalid, unverified, disposable, roleBased, catchAll };
  }

  // Get bounce stats
  getBounceStats() {
    const totalBounces = this.db.exec(`SELECT COUNT(*) as count FROM campaign_logs WHERE status = 'bounced' OR failureType LIKE '%bounce%'`)[0]?.values[0][0] || 0;
    const hardBounces = this.db.exec(`SELECT COUNT(*) as count FROM campaign_logs WHERE failureType = 'hard_bounce'`)[0]?.values[0][0] || 0;
    const softBounces = this.db.exec(`SELECT COUNT(*) as count FROM campaign_logs WHERE failureType = 'soft_bounce'`)[0]?.values[0][0] || 0;
    
    const topReasons = this.db.exec(`
      SELECT failureReason, COUNT(*) as count 
      FROM campaign_logs 
      WHERE failureReason IS NOT NULL 
      GROUP BY failureReason 
      ORDER BY count DESC 
      LIMIT 5
    `);

    return {
      total: totalBounces,
      hard: hardBounces,
      soft: softBounces,
      topReasons: this.resultToObjects(topReasons)
    };
  }

  close() {
    if (this.db) { this.save(); this.db.close(); }
  }
}

module.exports = BulkyDatabase;
