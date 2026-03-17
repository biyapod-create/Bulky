const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class BulkyDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
    this._saveTimer = null;
    this._saveDebounceMs = 1000;
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

  // Debounced save - batches multiple writes into a single disk write
  saveDebounced() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        this.save();
      } catch (e) {
        console.error('BulkyDatabase: debounced save failed:', e.message);
      }
    }, this._saveDebounceMs);
  }

  // Async save for non-blocking writes
  async saveAsync() {
    return new Promise((resolve, reject) => {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFile(this.dbPath, buffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Flush any pending debounced save immediately
  flushSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      try {
        this.save();
      } catch (e) {
        console.error('BulkyDatabase: flush save failed:', e.message);
      }
    }
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
      { table: 'templates', column: 'layout', type: "TEXT DEFAULT 'custom'" },
      { table: 'templates', column: 'blocks', type: 'TEXT' },
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

    // Templates table with layout/blocks for drag-and-drop builder
    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        layout TEXT DEFAULT 'custom',
        blocks TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Template categories table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS template_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        sortOrder INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Template blocks table for drag-and-drop builder reusable blocks
    this.db.run(`
      CREATE TABLE IF NOT EXISTS template_blocks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        thumbnail TEXT,
        categoryId TEXT,
        isGlobal INTEGER DEFAULT 0,
        sortOrder INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoryId) REFERENCES template_categories(id) ON DELETE SET NULL
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

    // Warmup schedules table for SMTP warmup scheduling
    this.db.run(`
      CREATE TABLE IF NOT EXISTS warmup_schedules (
        id TEXT PRIMARY KEY,
        smtpAccountId TEXT NOT NULL,
        name TEXT NOT NULL,
        startDate TEXT NOT NULL,
        currentDay INTEGER DEFAULT 1,
        initialVolume INTEGER DEFAULT 10,
        maxVolume INTEGER DEFAULT 500,
        incrementPercent INTEGER DEFAULT 20,
        incrementInterval TEXT DEFAULT 'daily',
        status TEXT DEFAULT 'active',
        lastSentAt TEXT,
        totalSent INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (smtpAccountId) REFERENCES smtp_accounts(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_listId ON contacts(listId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_verified ON contacts(verified)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_bounceCount ON contacts(bounceCount)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_engagementScore ON contacts(engagementScore)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_createdAt ON contacts(createdAt)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaignId ON campaign_logs(campaignId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_trackingId ON campaign_logs(trackingId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_email ON campaign_logs(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_sentAt ON campaign_logs(sentAt)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_blacklist_email ON blacklist(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_blacklist_domain ON blacklist(domain)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tracking_campaignId ON email_tracking(campaignId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tracking_type ON email_tracking(type)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_tracking_createdAt ON email_tracking(createdAt)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_campaigns_createdAt ON campaigns(createdAt)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_warmup_smtpAccountId ON warmup_schedules(smtpAccountId)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_warmup_status ON warmup_schedules(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_template_blocks_type ON template_blocks(type)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_template_blocks_categoryId ON template_blocks(categoryId)`);
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

    // Initialize default template categories
    this._initializeTemplateCategories();

    this.initializeSpamReplacements();
    this.save();
  }

  _initializeTemplateCategories() {
    const defaults = [
      { name: 'General', description: 'General purpose templates', sortOrder: 0 },
      { name: 'Newsletter', description: 'Newsletter templates', sortOrder: 1 },
      { name: 'Promotional', description: 'Promotional and marketing templates', sortOrder: 2 },
      { name: 'Transactional', description: 'Transactional email templates', sortOrder: 3 },
      { name: 'Welcome', description: 'Welcome and onboarding templates', sortOrder: 4 },
      { name: 'Follow-up', description: 'Follow-up email templates', sortOrder: 5 },
    ];

    for (const cat of defaults) {
      try {
        this.db.run(`INSERT OR IGNORE INTO template_categories (id, name, description, sortOrder) VALUES (?, ?, ?, ?)`,
          [uuidv4(), cat.name, cat.description, cat.sortOrder]);
      } catch (e) {}
    }
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
  getAllContacts(options = {}) {
    try {
      const { offset, limit } = options;
      let query = `
        SELECT c.*, l.name as listName
        FROM contacts c
        LEFT JOIN lists l ON c.listId = l.id
        ORDER BY c.createdAt DESC
      `;
      const params = [];
      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
        if (offset) {
          query += ` OFFSET ?`;
          params.push(offset);
        }
      }
      const result = this.db.exec(query, params);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllContacts failed:', error.message);
      return [];
    }
  }

  getContactsByFilter(filter = {}) {
    try {
      // Whitelist allowed sortBy columns to prevent SQL injection
      const ALLOWED_SORT_COLUMNS = [
        'createdAt', 'updatedAt', 'email', 'firstName', 'lastName', 'company',
        'status', 'verified', 'verificationScore', 'engagementScore',
        'totalOpens', 'totalClicks', 'bounceCount', 'lastOpenedAt', 'lastClickedAt'
      ];
      const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'];

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

      const sortBy = ALLOWED_SORT_COLUMNS.includes(filter.sortBy) ? filter.sortBy : 'createdAt';
      const sortOrder = ALLOWED_SORT_ORDERS.includes((filter.sortOrder || '').toUpperCase()) ? filter.sortOrder.toUpperCase() : 'DESC';
      query += ` ORDER BY c.${sortBy} ${sortOrder}`;

      if (filter.limit) { query += ` LIMIT ?`; params.push(filter.limit); }
      if (filter.limit && filter.offset) { query += ` OFFSET ?`; params.push(filter.offset); }

      const result = this.db.exec(query, params);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getContactsByFilter failed:', error.message);
      return [];
    }
  }

  // Get total count for pagination
  getContactsCount(filter = {}) {
    try {
      let query = `SELECT COUNT(*) as count FROM contacts c WHERE 1=1`;
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

      const result = this.db.exec(query, params);
      return result[0]?.values[0]?.[0] || 0;
    } catch (error) {
      console.error('BulkyDatabase: getContactsCount failed:', error.message);
      return 0;
    }
  }

  // Get recipient count for campaign targeting (with tag support)
  getRecipientCount(filter = {}) {
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: getRecipientCount failed:', error.message);
      return 0;
    }
  }

  // Get contacts for campaign sending (with tag support)
  getContactsForCampaign(filter = {}) {
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: getContactsForCampaign failed:', error.message);
      return [];
    }
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
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: updateContact failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Update contact verification result
  updateContactVerification(contactId, verificationResult) {
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: updateContactVerification failed:', error.message);
    }
  }

  // Increment bounce count for a contact
  incrementContactBounce(contactId, reason) {
    try {
      this.db.run(`
        UPDATE contacts
        SET bounceCount = bounceCount + 1, lastBounceReason = ?, lastBounceAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [reason, contactId]);
      this.save();
    } catch (error) {
      console.error('BulkyDatabase: incrementContactBounce failed:', error.message);
    }
  }

  updateContactEngagement(contactId, type) {
    try {
      // Whitelist allowed engagement fields to prevent SQL injection
      const ALLOWED_FIELDS = { open: 'totalOpens', click: 'totalClicks' };
      const ALLOWED_DATE_FIELDS = { open: 'lastOpenedAt', click: 'lastClickedAt' };

      const field = ALLOWED_FIELDS[type];
      const dateField = ALLOWED_DATE_FIELDS[type];
      if (!field || !dateField) {
        console.error('BulkyDatabase: updateContactEngagement invalid type:', type);
        return;
      }

      const scoreIncrease = type === 'open' ? 10 : 20;
      this.db.run(`UPDATE contacts SET ${field} = ${field} + 1, ${dateField} = CURRENT_TIMESTAMP, engagementScore = engagementScore + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [scoreIncrease, contactId]);
      this.saveDebounced();
    } catch (error) {
      console.error('BulkyDatabase: updateContactEngagement failed:', error.message);
    }
  }

  deleteContacts(ids) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      this.db.run(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
      this.save();
      return { success: true, deleted: ids.length };
    } catch (error) {
      console.error('BulkyDatabase: deleteContacts failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteContactsByVerification(status) {
    try {
      let condition = status === 'invalid' ? 'verified = 0 AND verificationScore < 40' : 'verified = 0 AND verificationScore >= 40 AND verificationScore < 70';
      const result = this.db.exec(`SELECT COUNT(*) as count FROM contacts WHERE ${condition}`);
      const count = result.length > 0 ? result[0].values[0][0] : 0;
      this.db.run(`DELETE FROM contacts WHERE ${condition}`);
      this.save();
      return { success: true, deleted: count };
    } catch (error) {
      console.error('BulkyDatabase: deleteContactsByVerification failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Delete bounced contacts
  deleteBouncedContacts(minBounceCount = 2) {
    try {
      const result = this.db.exec(`SELECT COUNT(*) as count FROM contacts WHERE bounceCount >= ?`, [minBounceCount]);
      const count = result.length > 0 ? result[0].values[0][0] : 0;
      this.db.run(`DELETE FROM contacts WHERE bounceCount >= ?`, [minBounceCount]);
      this.save();
      return { success: true, deleted: count };
    } catch (error) {
      console.error('BulkyDatabase: deleteBouncedContacts failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get bounced contacts
  getBouncedContacts() {
    try {
      const result = this.db.exec(`SELECT * FROM contacts WHERE bounceCount > 0 ORDER BY bounceCount DESC, lastBounceAt DESC`);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getBouncedContacts failed:', error.message);
      return [];
    }
  }

  getContactsByList(listId) {
    try {
      if (listId === 'all' || !listId) return this.getAllContacts();
      const result = this.db.exec(`SELECT c.*, l.name as listName FROM contacts c LEFT JOIN lists l ON c.listId = l.id WHERE c.listId = ? ORDER BY c.createdAt DESC`, [listId]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getContactsByList failed:', error.message);
      return [];
    }
  }

  // Get contact stats for dashboard
  getContactStats() {
    try {
      const total = this.db.exec('SELECT COUNT(*) as count FROM contacts')[0]?.values[0]?.[0] || 0;
      const active = this.db.exec("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'")[0]?.values[0]?.[0] || 0;
      const verified = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 1')[0]?.values[0]?.[0] || 0;
      const unverified = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 0')[0]?.values[0]?.[0] || 0;
      const bounced = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE bounceCount > 0')[0]?.values[0]?.[0] || 0;
      const disposable = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isDisposable = 1')[0]?.values[0]?.[0] || 0;
      const roleBased = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isRoleBased = 1')[0]?.values[0]?.[0] || 0;

      const avgEngagement = this.db.exec('SELECT AVG(engagementScore) as avg FROM contacts')[0]?.values[0]?.[0] || 0;

      const byList = this.db.exec(`
        SELECT l.name, COUNT(c.id) as count
        FROM contacts c
        LEFT JOIN lists l ON c.listId = l.id
        GROUP BY c.listId
        ORDER BY count DESC
      `);

      const recentlyAdded = this.db.exec("SELECT COUNT(*) as count FROM contacts WHERE createdAt >= datetime('now', '-7 days')")[0]?.values[0]?.[0] || 0;

      return {
        total, active, verified, unverified, bounced, disposable, roleBased,
        avgEngagement: parseFloat(avgEngagement.toFixed(1)),
        byList: this.resultToObjects(byList),
        recentlyAdded
      };
    } catch (error) {
      console.error('BulkyDatabase: getContactStats failed:', error.message);
      return { total: 0, active: 0, verified: 0, unverified: 0, bounced: 0, disposable: 0, roleBased: 0, avgEngagement: 0, byList: [], recentlyAdded: 0 };
    }
  }

  // ==================== TAGS ====================
  getAllTags() {
    try {
      const result = this.db.exec('SELECT * FROM tags ORDER BY name');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllTags failed:', error.message);
      return [];
    }
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
    try {
      this.db.run('DELETE FROM tags WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteTag failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== LISTS ====================
  getAllLists() {
    try {
      const result = this.db.exec(`SELECT l.*, COUNT(c.id) as contactCount FROM lists l LEFT JOIN contacts c ON l.id = c.listId GROUP BY l.id ORDER BY l.createdAt DESC`);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllLists failed:', error.message);
      return [];
    }
  }

  addList(list) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO lists (id, name, description) VALUES (?, ?, ?)`, [id, list.name, list.description || null]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addList failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateList(list) {
    try {
      this.db.run(`UPDATE lists SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [list.name, list.description, list.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateList failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteList(id) {
    try {
      this.db.run('UPDATE contacts SET listId = NULL WHERE listId = ?', [id]);
      this.db.run('DELETE FROM lists WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteList failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== BLACKLIST ====================
  getAllBlacklist() {
    try {
      const result = this.db.exec('SELECT * FROM blacklist ORDER BY createdAt DESC');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllBlacklist failed:', error.message);
      return [];
    }
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
    try {
      this.db.run('DELETE FROM blacklist WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: removeFromBlacklist failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  isBlacklisted(email) {
    try {
      if (!email) return false;
      const emailLower = email.toLowerCase();
      const domain = emailLower.split('@')[1];
      const result = this.db.exec(`SELECT COUNT(*) as count FROM blacklist WHERE email = ? OR domain = ?`, [emailLower, domain]);
      return result.length > 0 && result[0].values[0][0] > 0;
    } catch (error) {
      console.error('BulkyDatabase: isBlacklisted failed:', error.message);
      return false;
    }
  }

  // ==================== UNSUBSCRIBES ====================
  getAllUnsubscribes() {
    try {
      const result = this.db.exec('SELECT * FROM unsubscribes ORDER BY unsubscribedAt DESC');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllUnsubscribes failed:', error.message);
      return [];
    }
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
    try {
      const result = this.db.exec('SELECT COUNT(*) as count FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
      return result.length > 0 && result[0].values[0][0] > 0;
    } catch (error) {
      console.error('BulkyDatabase: isUnsubscribed failed:', error.message);
      return false;
    }
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
    try {
      const result = this.db.exec('SELECT * FROM templates ORDER BY createdAt DESC');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllTemplates failed:', error.message);
      return [];
    }
  }

  getTemplatesByCategory(category) {
    try {
      const result = this.db.exec('SELECT * FROM templates WHERE category = ? ORDER BY createdAt DESC', [category]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getTemplatesByCategory failed:', error.message);
      return [];
    }
  }

  addTemplate(template) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO templates (id, name, subject, content, category, layout, blocks) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, template.name, template.subject, template.content, template.category || 'general',
         template.layout || 'custom', template.blocks ? JSON.stringify(template.blocks) : null]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addTemplate failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateTemplate(template) {
    try {
      this.db.run(`UPDATE templates SET name = ?, subject = ?, content = ?, category = ?, layout = ?, blocks = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [template.name, template.subject, template.content, template.category || 'general',
         template.layout || 'custom', template.blocks ? (typeof template.blocks === 'string' ? template.blocks : JSON.stringify(template.blocks)) : null,
         template.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateTemplate failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteTemplate(id) {
    try {
      this.db.run('DELETE FROM templates WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteTemplate failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== TEMPLATE CATEGORIES ====================
  getAllTemplateCategories() {
    try {
      const result = this.db.exec('SELECT * FROM template_categories ORDER BY sortOrder, name');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllTemplateCategories failed:', error.message);
      return [];
    }
  }

  addTemplateCategory(category) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO template_categories (id, name, description, sortOrder) VALUES (?, ?, ?, ?)`,
        [id, category.name, category.description || null, category.sortOrder || 0]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addTemplateCategory failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteTemplateCategory(id) {
    try {
      this.db.run('UPDATE template_blocks SET categoryId = NULL WHERE categoryId = ?', [id]);
      this.db.run('DELETE FROM template_categories WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteTemplateCategory failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== TEMPLATE BLOCKS ====================
  getAllTemplateBlocks() {
    try {
      const result = this.db.exec('SELECT tb.*, tc.name as categoryName FROM template_blocks tb LEFT JOIN template_categories tc ON tb.categoryId = tc.id ORDER BY tb.sortOrder, tb.name');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllTemplateBlocks failed:', error.message);
      return [];
    }
  }

  getTemplateBlocksByType(type) {
    try {
      const result = this.db.exec('SELECT * FROM template_blocks WHERE type = ? ORDER BY sortOrder, name', [type]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getTemplateBlocksByType failed:', error.message);
      return [];
    }
  }

  addTemplateBlock(block) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO template_blocks (id, name, type, content, thumbnail, categoryId, isGlobal, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, block.name, block.type, block.content, block.thumbnail || null, block.categoryId || null, block.isGlobal ? 1 : 0, block.sortOrder || 0]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addTemplateBlock failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateTemplateBlock(block) {
    try {
      this.db.run(`UPDATE template_blocks SET name = ?, type = ?, content = ?, thumbnail = ?, categoryId = ?, isGlobal = ?, sortOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [block.name, block.type, block.content, block.thumbnail || null, block.categoryId || null, block.isGlobal ? 1 : 0, block.sortOrder || 0, block.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateTemplateBlock failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteTemplateBlock(id) {
    try {
      this.db.run('DELETE FROM template_blocks WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteTemplateBlock failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== SMTP ACCOUNTS ====================
  getAllSmtpAccounts() {
    try {
      const result = this.db.exec('SELECT * FROM smtp_accounts ORDER BY priority, createdAt');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllSmtpAccounts failed:', error.message);
      return [];
    }
  }

  getActiveSmtpAccounts() {
    try {
      const today = new Date().toISOString().split('T')[0];
      this.db.run(`UPDATE smtp_accounts SET sentToday = 0, lastResetDate = ? WHERE lastResetDate != ? OR lastResetDate IS NULL`, [today, today]);
      const result = this.db.exec(`SELECT * FROM smtp_accounts WHERE isActive = 1 AND sentToday < dailyLimit ORDER BY priority, sentToday`);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getActiveSmtpAccounts failed:', error.message);
      return [];
    }
  }

  addSmtpAccount(account) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO smtp_accounts (id, name, host, port, secure, username, password, fromName, fromEmail, replyTo, dailyLimit, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, account.name, account.host, account.port || 587, account.secure ? 1 : 0, account.username, account.password, account.fromName, account.fromEmail, account.replyTo, account.dailyLimit || 500, account.priority || 1]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addSmtpAccount failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateSmtpAccount(account) {
    try {
      this.db.run(`UPDATE smtp_accounts SET name = ?, host = ?, port = ?, secure = ?, username = ?, password = ?, fromName = ?, fromEmail = ?, replyTo = ?, dailyLimit = ?, isActive = ?, priority = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [account.name, account.host, account.port, account.secure ? 1 : 0, account.username, account.password, account.fromName, account.fromEmail, account.replyTo, account.dailyLimit, account.isActive ? 1 : 0, account.priority, account.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateSmtpAccount failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  incrementSmtpSentCount(accountId) {
    try {
      this.db.run(`UPDATE smtp_accounts SET sentToday = sentToday + 1 WHERE id = ?`, [accountId]);
      this.saveDebounced();
    } catch (error) {
      console.error('BulkyDatabase: incrementSmtpSentCount failed:', error.message);
    }
  }

  deleteSmtpAccount(id) {
    try {
      this.db.run('DELETE FROM smtp_accounts WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteSmtpAccount failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Legacy SMTP settings
  getSmtpSettings() {
    try {
      const result = this.db.exec('SELECT * FROM smtp_settings WHERE id = 1');
      const arr = this.resultToObjects(result);
      return arr.length > 0 ? arr[0] : null;
    } catch (error) {
      console.error('BulkyDatabase: getSmtpSettings failed:', error.message);
      return null;
    }
  }

  saveSmtpSettings(settings) {
    try {
      this.db.run(`UPDATE smtp_settings SET host = ?, port = ?, secure = ?, username = ?, password = ?, fromName = ?, fromEmail = ?, replyTo = ?, unsubscribeEmail = ?, unsubscribeUrl = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1`,
        [settings.host, settings.port, settings.secure ? 1 : 0, settings.username, settings.password, settings.fromName, settings.fromEmail, settings.replyTo, settings.unsubscribeEmail, settings.unsubscribeUrl]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: saveSmtpSettings failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== WARMUP SCHEDULES ====================
  getAllWarmupSchedules() {
    try {
      const result = this.db.exec(`
        SELECT ws.*, sa.name as smtpAccountName, sa.host as smtpHost
        FROM warmup_schedules ws
        LEFT JOIN smtp_accounts sa ON ws.smtpAccountId = sa.id
        ORDER BY ws.createdAt DESC
      `);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllWarmupSchedules failed:', error.message);
      return [];
    }
  }

  getActiveWarmupSchedules() {
    try {
      const result = this.db.exec(`
        SELECT ws.*, sa.name as smtpAccountName, sa.host as smtpHost, sa.dailyLimit
        FROM warmup_schedules ws
        LEFT JOIN smtp_accounts sa ON ws.smtpAccountId = sa.id
        WHERE ws.status = 'active'
        ORDER BY ws.createdAt
      `);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getActiveWarmupSchedules failed:', error.message);
      return [];
    }
  }

  addWarmupSchedule(schedule) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO warmup_schedules (id, smtpAccountId, name, startDate, initialVolume, maxVolume, incrementPercent, incrementInterval, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, schedule.smtpAccountId, schedule.name, schedule.startDate, schedule.initialVolume || 10, schedule.maxVolume || 500, schedule.incrementPercent || 20, schedule.incrementInterval || 'daily', schedule.status || 'active']);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addWarmupSchedule failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateWarmupSchedule(schedule) {
    try {
      this.db.run(`UPDATE warmup_schedules SET name = ?, initialVolume = ?, maxVolume = ?, incrementPercent = ?, incrementInterval = ?, status = ?, currentDay = ?, totalSent = ?, lastSentAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [schedule.name, schedule.initialVolume, schedule.maxVolume, schedule.incrementPercent, schedule.incrementInterval, schedule.status, schedule.currentDay || 1, schedule.totalSent || 0, schedule.lastSentAt || null, schedule.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateWarmupSchedule failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteWarmupSchedule(id) {
    try {
      this.db.run('DELETE FROM warmup_schedules WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteWarmupSchedule failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get today's warmup volume for a schedule
  getWarmupDailyVolume(scheduleId) {
    try {
      const result = this.db.exec('SELECT * FROM warmup_schedules WHERE id = ?', [scheduleId]);
      const schedule = this.resultToObjects(result)[0];
      if (!schedule) return 0;

      const volume = Math.min(
        Math.floor(schedule.initialVolume * Math.pow(1 + schedule.incrementPercent / 100, schedule.currentDay - 1)),
        schedule.maxVolume
      );
      return volume;
    } catch (error) {
      console.error('BulkyDatabase: getWarmupDailyVolume failed:', error.message);
      return 0;
    }
  }

  // ==================== SPAM REPLACEMENTS ====================
  getAllSpamReplacements() {
    try {
      const result = this.db.exec('SELECT * FROM spam_replacements WHERE isActive = 1 ORDER BY spamWord');
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllSpamReplacements failed:', error.message);
      return [];
    }
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
    try {
      this.db.run(`UPDATE spam_replacements SET spamWord = ?, replacement = ?, category = ?, isActive = ? WHERE id = ?`,
        [item.spamWord, item.replacement, item.category, item.isActive ? 1 : 0, item.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateSpamReplacement failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteSpamReplacement(id) {
    try {
      this.db.run('DELETE FROM spam_replacements WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteSpamReplacement failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== CAMPAIGNS ====================
  getAllCampaigns() {
    try {
      const result = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id ORDER BY c.createdAt DESC`);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getAllCampaigns failed:', error.message);
      return [];
    }
  }

  getCampaign(id) {
    try {
      const result = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id WHERE c.id = ?`, [id]);
      const arr = this.resultToObjects(result);
      return arr.length > 0 ? arr[0] : null;
    } catch (error) {
      console.error('BulkyDatabase: getCampaign failed:', error.message);
      return null;
    }
  }

  getScheduledCampaigns() {
    try {
      const result = this.db.exec(`SELECT * FROM campaigns WHERE status = 'scheduled' ORDER BY scheduledAt`);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getScheduledCampaigns failed:', error.message);
      return [];
    }
  }

  addCampaign(campaign) {
    const id = uuidv4();
    try {
      const selectedTags = campaign.selectedTags ? JSON.stringify(campaign.selectedTags) : null;
      this.db.run(`INSERT INTO campaigns (id, name, subject, subjectB, content, contentB, isABTest, abTestPercent, listId, selectedTags, status, totalEmails, batchSize, delayMinutes, scheduledAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, campaign.name, campaign.subject, campaign.subjectB || null, campaign.content, campaign.contentB || null, campaign.isABTest ? 1 : 0, campaign.abTestPercent || 10, campaign.listId || null, selectedTags, campaign.status || 'draft', campaign.totalEmails || 0, campaign.batchSize || 50, campaign.delayMinutes || 10, campaign.scheduledAt || null]);
      this.save();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addCampaign failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  updateCampaign(campaign) {
    try {
      const selectedTags = campaign.selectedTags ? (typeof campaign.selectedTags === 'string' ? campaign.selectedTags : JSON.stringify(campaign.selectedTags)) : null;
      this.db.run(`UPDATE campaigns SET name = ?, subject = ?, subjectB = ?, content = ?, contentB = ?, isABTest = ?, abTestPercent = ?, abWinner = ?, listId = ?, selectedTags = ?, status = ?, totalEmails = ?, sentEmails = ?, failedEmails = ?, openedEmails = ?, clickedEmails = ?, bouncedEmails = ?, softBouncedEmails = ?, batchSize = ?, delayMinutes = ?, scheduledAt = ?, startedAt = ?, completedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [campaign.name, campaign.subject, campaign.subjectB, campaign.content, campaign.contentB, campaign.isABTest ? 1 : 0, campaign.abTestPercent, campaign.abWinner, campaign.listId, selectedTags, campaign.status, campaign.totalEmails, campaign.sentEmails, campaign.failedEmails, campaign.openedEmails || 0, campaign.clickedEmails || 0, campaign.bouncedEmails || 0, campaign.softBouncedEmails || 0, campaign.batchSize, campaign.delayMinutes, campaign.scheduledAt, campaign.startedAt, campaign.completedAt, campaign.id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: updateCampaign failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  deleteCampaign(id) {
    try {
      this.db.run('DELETE FROM campaign_logs WHERE campaignId = ?', [id]);
      this.db.run('DELETE FROM email_tracking WHERE campaignId = ?', [id]);
      this.db.run('DELETE FROM campaigns WHERE id = ?', [id]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: deleteCampaign failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  scheduleCampaign(campaignId, scheduledAt) {
    try {
      this.db.run(`UPDATE campaigns SET status = 'scheduled', scheduledAt = ? WHERE id = ?`, [scheduledAt, campaignId]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: scheduleCampaign failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  cancelScheduledCampaign(campaignId) {
    try {
      this.db.run(`UPDATE campaigns SET status = 'draft', scheduledAt = NULL WHERE id = ?`, [campaignId]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: cancelScheduledCampaign failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== CAMPAIGN LOGS ====================
  addCampaignLog(log) {
    const id = uuidv4();
    try {
      this.db.run(`INSERT INTO campaign_logs (id, campaignId, contactId, email, status, variant, smtpCode, smtpResponse, failureType, failureReason, trackingId, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, log.campaignId, log.contactId || null, log.email, log.status, log.variant || 'A', log.smtpCode || null, log.smtpResponse || null, log.failureType || null, log.failureReason || null, log.trackingId || null, log.error || null]);
      this.saveDebounced();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addCampaignLog failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  getCampaignLogs(campaignId) {
    try {
      const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? ORDER BY sentAt DESC`, [campaignId]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getCampaignLogs failed:', error.message);
      return [];
    }
  }

  // Get logs by status (for analytics)
  getCampaignLogsByStatus(campaignId, status) {
    try {
      const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND status = ? ORDER BY sentAt DESC`, [campaignId, status]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getCampaignLogsByStatus failed:', error.message);
      return [];
    }
  }

  // Get bounced emails for a campaign
  getCampaignBounces(campaignId) {
    try {
      const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND (status = 'bounced' OR status = 'soft_bounce' OR failureType LIKE '%bounce%') ORDER BY sentAt DESC`, [campaignId]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getCampaignBounces failed:', error.message);
      return [];
    }
  }

  // Update log when email is opened/clicked
  updateCampaignLogTracking(trackingId, type) {
    try {
      // Whitelist allowed tracking fields to prevent SQL injection
      const ALLOWED_TRACKING_FIELDS = { open: 'openedAt', click: 'clickedAt' };
      const field = ALLOWED_TRACKING_FIELDS[type];
      if (!field) {
        console.error('BulkyDatabase: updateCampaignLogTracking invalid type:', type);
        return;
      }
      this.db.run(`UPDATE campaign_logs SET ${field} = CURRENT_TIMESTAMP WHERE trackingId = ?`, [trackingId]);
      this.saveDebounced();
    } catch (error) {
      console.error('BulkyDatabase: updateCampaignLogTracking failed:', error.message);
    }
  }

  // Get campaign log by tracking ID
  getCampaignLogByTracking(campaignId, trackingId) {
    try {
      const result = this.db.exec(`SELECT * FROM campaign_logs WHERE campaignId = ? AND trackingId = ?`, [campaignId, trackingId]);
      const arr = this.resultToObjects(result);
      return arr.length > 0 ? arr[0] : null;
    } catch (error) {
      console.error('BulkyDatabase: getCampaignLogByTracking failed:', error.message);
      return null;
    }
  }

  // Update log when email is opened
  updateCampaignLogOpened(campaignId, trackingId) {
    try {
      this.db.run(`UPDATE campaign_logs SET openedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND trackingId = ? AND openedAt IS NULL`, [campaignId, trackingId]);
      this.saveDebounced();
    } catch (error) {
      console.error('BulkyDatabase: updateCampaignLogOpened failed:', error.message);
    }
  }

  // Update log when email is clicked
  updateCampaignLogClicked(campaignId, trackingId) {
    try {
      this.db.run(`UPDATE campaign_logs SET clickedAt = CURRENT_TIMESTAMP WHERE campaignId = ? AND trackingId = ? AND clickedAt IS NULL`, [campaignId, trackingId]);
      this.saveDebounced();
    } catch (error) {
      console.error('BulkyDatabase: updateCampaignLogClicked failed:', error.message);
    }
  }

  // ==================== EMAIL TRACKING ====================
  addTrackingEvent(event) {
    try {
      const id = uuidv4();
      this.db.run(`INSERT INTO email_tracking (id, campaignId, contactId, email, type, link, userAgent, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, event.campaignId, event.contactId || null, event.email, event.type, event.link || null, event.userAgent || null, event.ipAddress || null]);
      if (event.type === 'open') this.db.run(`UPDATE campaigns SET openedEmails = openedEmails + 1 WHERE id = ?`, [event.campaignId]);
      else if (event.type === 'click') this.db.run(`UPDATE campaigns SET clickedEmails = clickedEmails + 1 WHERE id = ?`, [event.campaignId]);
      if (event.contactId) this.updateContactEngagement(event.contactId, event.type);
      if (event.trackingId) this.updateCampaignLogTracking(event.trackingId, event.type);
      this.saveDebounced();
      return { success: true, id };
    } catch (error) {
      console.error('BulkyDatabase: addTrackingEvent failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  getTrackingEvents(campaignId) {
    try {
      const result = this.db.exec(`SELECT * FROM email_tracking WHERE campaignId = ? ORDER BY createdAt DESC`, [campaignId]);
      return this.resultToObjects(result);
    } catch (error) {
      console.error('BulkyDatabase: getTrackingEvents failed:', error.message);
      return [];
    }
  }

  // ==================== ANALYTICS ====================
  getCampaignAnalytics(campaignId) {
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: getCampaignAnalytics failed:', error.message);
      return { campaign: {}, metrics: { sent: 0, delivered: 0, bounced: 0, failed: 0, opened: 0, clicked: 0, deliveryRate: 0, bounceRate: 0, openRate: 0, clickRate: 0 }, statusBreakdown: [], bounceReasons: [], opensByHour: [], clicksByLink: [] };
    }
  }

  // ==================== APP SETTINGS ====================
  getSettings() {
    try {
      const result = this.db.exec('SELECT * FROM app_settings WHERE id = 1');
      const arr = this.resultToObjects(result);
      return arr.length > 0 ? arr[0] : null;
    } catch (error) {
      console.error('BulkyDatabase: getSettings failed:', error.message);
      return null;
    }
  }

  saveSettings(settings) {
    try {
      this.db.run(`UPDATE app_settings SET theme = ?, defaultBatchSize = ?, defaultDelayMinutes = ?, maxRetriesPerEmail = ?, enableTracking = ?, trackingDomain = ?, enableSmtpVerification = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1`,
        [settings.theme, settings.defaultBatchSize, settings.defaultDelayMinutes, settings.maxRetriesPerEmail, settings.enableTracking ? 1 : 0, settings.trackingDomain, settings.enableSmtpVerification ? 1 : 0]);
      this.save();
      return { success: true };
    } catch (error) {
      console.error('BulkyDatabase: saveSettings failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== DASHBOARD STATS ====================
  getDashboardStats() {
    try {
      const totalContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts')[0]?.values[0][0] || 0;
      const activeContacts = this.db.exec("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'")[0]?.values[0][0] || 0;
      const verifiedContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 1')[0]?.values[0][0] || 0;
      const bouncedContacts = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE bounceCount > 0')[0]?.values[0][0] || 0;
      const totalCampaigns = this.db.exec('SELECT COUNT(*) as count FROM campaigns')[0]?.values[0][0] || 0;
      const activeCampaigns = this.db.exec("SELECT COUNT(*) as count FROM campaigns WHERE status = 'sending' OR status = 'scheduled'")[0]?.values[0][0] || 0;
      const totalSent = this.db.exec('SELECT COALESCE(SUM(sentEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
      const totalBounced = this.db.exec('SELECT COALESCE(SUM(bouncedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
      const totalOpened = this.db.exec('SELECT COALESCE(SUM(openedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
      const totalClicked = this.db.exec('SELECT COALESCE(SUM(clickedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;
      const totalFailed = this.db.exec('SELECT COALESCE(SUM(failedEmails), 0) as count FROM campaigns')[0]?.values[0][0] || 0;

      // Calculate real rates
      const delivered = totalSent - totalBounced;
      const deliveryRate = totalSent > 0 ? ((delivered / totalSent) * 100).toFixed(1) : 0;
      const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : 0;
      const openRate = delivered > 0 ? ((totalOpened / delivered) * 100).toFixed(1) : 0;
      const clickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : 0;

      const recentResult = this.db.exec(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id ORDER BY c.createdAt DESC LIMIT 5`);
      const blacklistCount = this.db.exec('SELECT COUNT(*) as count FROM blacklist')[0]?.values[0][0] || 0;
      const unsubscribeCount = this.db.exec('SELECT COUNT(*) as count FROM unsubscribes')[0]?.values[0][0] || 0;
      const totalLists = this.db.exec('SELECT COUNT(*) as count FROM lists')[0]?.values[0][0] || 0;
      const totalTemplates = this.db.exec('SELECT COUNT(*) as count FROM templates')[0]?.values[0][0] || 0;
      const totalSmtpAccounts = this.db.exec('SELECT COUNT(*) as count FROM smtp_accounts WHERE isActive = 1')[0]?.values[0][0] || 0;

      // Recent bounces
      const recentBounces = this.db.exec(`
        SELECT email, failureReason, sentAt
        FROM campaign_logs
        WHERE status = 'bounced' OR failureType = 'hard_bounce'
        ORDER BY sentAt DESC LIMIT 10
      `);

      // Emails sent in last 7 days
      const sentLast7Days = this.db.exec("SELECT COUNT(*) as count FROM campaign_logs WHERE status = 'sent' AND sentAt >= datetime('now', '-7 days')")[0]?.values[0][0] || 0;

      // Emails sent in last 30 days
      const sentLast30Days = this.db.exec("SELECT COUNT(*) as count FROM campaign_logs WHERE status = 'sent' AND sentAt >= datetime('now', '-30 days')")[0]?.values[0][0] || 0;

      return {
        totalContacts,
        activeContacts,
        verifiedContacts,
        bouncedContacts,
        totalCampaigns,
        activeCampaigns,
        totalSent,
        totalBounced,
        totalOpened,
        totalClicked,
        totalFailed,
        delivered,
        deliveryRate,
        bounceRate,
        openRate,
        clickRate,
        blacklistCount,
        unsubscribeCount,
        totalLists,
        totalTemplates,
        totalSmtpAccounts,
        sentLast7Days,
        sentLast30Days,
        recentCampaigns: this.resultToObjects(recentResult),
        recentBounces: this.resultToObjects(recentBounces)
      };
    } catch (error) {
      console.error('BulkyDatabase: getDashboardStats failed:', error.message);
      return {
        totalContacts: 0, activeContacts: 0, verifiedContacts: 0, bouncedContacts: 0,
        totalCampaigns: 0, activeCampaigns: 0, totalSent: 0, totalBounced: 0,
        totalOpened: 0, totalClicked: 0, totalFailed: 0, delivered: 0,
        deliveryRate: 0, bounceRate: 0, openRate: 0, clickRate: 0,
        blacklistCount: 0, unsubscribeCount: 0, totalLists: 0, totalTemplates: 0,
        totalSmtpAccounts: 0, sentLast7Days: 0, sentLast30Days: 0,
        recentCampaigns: [], recentBounces: []
      };
    }
  }

  // Get verification stats
  getVerificationStats() {
    try {
      const total = this.db.exec('SELECT COUNT(*) as count FROM contacts')[0]?.values[0][0] || 0;
      const valid = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 1 AND verificationScore >= 80')[0]?.values[0][0] || 0;
      const risky = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verificationScore >= 50 AND verificationScore < 80')[0]?.values[0][0] || 0;
      const invalid = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verified = 0 AND verificationScore < 50 AND verificationScore > 0')[0]?.values[0][0] || 0;
      const unverified = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE verificationScore = 0')[0]?.values[0][0] || 0;
      const disposable = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isDisposable = 1')[0]?.values[0][0] || 0;
      const roleBased = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isRoleBased = 1')[0]?.values[0][0] || 0;
      const catchAll = this.db.exec('SELECT COUNT(*) as count FROM contacts WHERE isCatchAll = 1')[0]?.values[0][0] || 0;

      return { total, valid, risky, invalid, unverified, disposable, roleBased, catchAll };
    } catch (error) {
      console.error('BulkyDatabase: getVerificationStats failed:', error.message);
      return { total: 0, valid: 0, risky: 0, invalid: 0, unverified: 0, disposable: 0, roleBased: 0, catchAll: 0 };
    }
  }

  // Get bounce stats
  getBounceStats() {
    try {
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
    } catch (error) {
      console.error('BulkyDatabase: getBounceStats failed:', error.message);
      return { total: 0, hard: 0, soft: 0, topReasons: [] };
    }
  }

  close() {
    if (this.db) {
      this.flushSave();
      this.save();
      this.db.close();
    }
  }
}

module.exports = BulkyDatabase;
