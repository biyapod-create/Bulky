const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
    this._saveTimer = null;
    this._saveDebounceMs = 1500; // batch rapid writes into a single disk flush
  }

  async initialize() {
    const initSqlJs = require('sql.js');
    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this._createTables();
    this._migrateSchema();
    this._save();

    // Database integrity check
    this._checkIntegrity();

    // Auto-save every 30 seconds as crash safety net
    this._autoSaveInterval = setInterval(() => {
      this._save();
    }, 30000);

    return this;
  }

  _checkIntegrity() {
    try { // DB integrity check - errors are non-fatal but logged
      // Check for database corruption
      const integrity = this.db.exec("PRAGMA integrity_check");
      if (integrity[0]?.values?.[0]?.[0] !== 'ok') {
        // Attempt repair
        this.db.exec("REINDEX");
        this.db.exec("VACUUM");
      }

      // Check foreign key constraints
      this.db.exec("PRAGMA foreign_keys = ON");

      // Optimize database
      this.db.exec("PRAGMA optimize");
    } catch (e) {
      console.warn('DB integrity check error (non-fatal):', e.message);
    }
  }

  _save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // Debounced save — batches rapid writes (e.g. per-email campaign logging)
  // into a single disk flush after a quiet period, preventing I/O thrashing.
  _saveDebounced() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, this._saveDebounceMs);
  }

  // Flush any pending debounced write immediately (call before app exit / backup)
  flushSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._save(); // flush any pending debounced write immediately
  }

  dispose() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }

    if (this.db) {
      // Use flushSave() to guarantee any pending debounced write is committed
      // before the underlying sql.js db object is closed and nulled.
      this.flushSave();
      try { this.db.close(); } catch (e) {}
      this.db = null;
    }
  }

  _run(sql, params = []) {
    this.db.run(sql, params);
    this._saveDebounced(); // batch writes; flush explicitly on shutdown
  }

  _get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      return result;
    } catch (e) {
      if (e.message && e.message.includes('no such column')) {
        return null;
      }
      throw e;
    }
  }

  _all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (e) {
      // If query fails due to missing column in ORDER BY, retry without ORDER BY
      if (e.message && e.message.includes('no such column') && sql.includes('ORDER BY')) {
        const stripped = sql.replace(/\s+ORDER BY\s+[^\s,)]+(\s+(ASC|DESC))?/gi, '');
        const stmt = this.db.prepare(stripped);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
      throw e;
    }
  }

  _createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        firstName TEXT DEFAULT '',
        lastName TEXT DEFAULT '',
        company TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        customField1 TEXT DEFAULT '',
        customField2 TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        listId TEXT DEFAULT '',
        verificationStatus TEXT DEFAULT 'unverified',
        verificationScore INTEGER DEFAULT 0,
        verificationDetails TEXT DEFAULT '{}',
        bounceCount INTEGER DEFAULT 0,
        lastBounceReason TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        color TEXT DEFAULT '#6366f1',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6366f1',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        reason TEXT DEFAULT '',
        source TEXT DEFAULT 'manual',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS unsubscribes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        campaignId TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT DEFAULT '',
        content TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        blocks TEXT DEFAULT '[]',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS smtp_accounts (
        id TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        host TEXT NOT NULL,
        port INTEGER DEFAULT 587,
        secure INTEGER DEFAULT 0,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        fromName TEXT DEFAULT '',
        fromEmail TEXT DEFAULT '',
        replyTo TEXT DEFAULT '',
        dailyLimit INTEGER DEFAULT 500,
        sentToday INTEGER DEFAULT 0,
        lastResetDate TEXT DEFAULT '',
        isActive INTEGER DEFAULT 1,
        isDefault INTEGER DEFAULT 0,
        warmUpEnabled INTEGER DEFAULT 0,
        warmUpStartDate TEXT DEFAULT '',
        warmUpSchedule TEXT DEFAULT '',
        rejectUnauthorized INTEGER DEFAULT 1,
        unsubscribeEmail TEXT DEFAULT '',
        dkimDomain TEXT DEFAULT '',
        dkimSelector TEXT DEFAULT '',
        dkimPrivateKey TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT DEFAULT '',
        content TEXT DEFAULT '',
        subjectB TEXT DEFAULT '',
        contentB TEXT DEFAULT '',
        isABTest INTEGER DEFAULT 0,
        abTestPercent INTEGER DEFAULT 10,
        status TEXT DEFAULT 'draft',
        listId TEXT DEFAULT '',
        tagFilter TEXT DEFAULT '',
        manualEmails TEXT DEFAULT '',
        verificationFilter TEXT DEFAULT '',
        smtpAccountId TEXT DEFAULT '',
        batchSize INTEGER DEFAULT 50,
        delayMinutes INTEGER DEFAULT 10,
        delayBetweenEmails INTEGER DEFAULT 2000,
        maxRetries INTEGER DEFAULT 3,
        totalEmails INTEGER DEFAULT 0,
        sentEmails INTEGER DEFAULT 0,
        failedEmails INTEGER DEFAULT 0,
        bouncedEmails INTEGER DEFAULT 0,
        scheduledAt TEXT DEFAULT '',
        startedAt TEXT DEFAULT '',
        completedAt TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaign_logs (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT DEFAULT '',
        email TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        variant TEXT DEFAULT 'A',
        smtpCode INTEGER DEFAULT NULL,
        smtpResponse TEXT DEFAULT '',
        failureType TEXT DEFAULT '',
        failureReason TEXT DEFAULT '',
        trackingId TEXT DEFAULT '',
        openedAt TEXT DEFAULT '',
        clickedAt TEXT DEFAULT '',
        error TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tracking_events (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT DEFAULT '',
        email TEXT DEFAULT '',
        type TEXT NOT NULL,
        link TEXT DEFAULT '',
        userAgent TEXT DEFAULT '',
        ipAddress TEXT DEFAULT '',
        client TEXT DEFAULT '',
        device TEXT DEFAULT '',
        os TEXT DEFAULT '',
        isBot INTEGER DEFAULT 0,
        country TEXT DEFAULT '',
        region TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS spam_replacements (
        id TEXT PRIMARY KEY,
        spamWord TEXT NOT NULL,
        replacement TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT DEFAULT ''
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS warmup_schedules (
        id TEXT PRIMARY KEY,
        smtpAccountId TEXT NOT NULL,
        schedule TEXT DEFAULT '{}',
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    // Segments for contact segmentation
    this.db.run(`
      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filters TEXT DEFAULT '{}',
        contactCount INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    // Retry queue for failed emails
    this.db.run(`
      CREATE TABLE IF NOT EXISTS retry_queue (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT DEFAULT '',
        email TEXT NOT NULL,
        subject TEXT DEFAULT '',
        content TEXT DEFAULT '',
        variant TEXT DEFAULT 'A',
        attempts INTEGER DEFAULT 0,
        maxAttempts INTEGER DEFAULT 3,
        lastError TEXT DEFAULT '',
        nextRetryAt TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    // Deliverability metrics per SMTP account over time
    this.db.run(`
      CREATE TABLE IF NOT EXISTS deliverability_log (
        id TEXT PRIMARY KEY,
        smtpAccountId TEXT NOT NULL,
        date TEXT NOT NULL,
        sent INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        bounced INTEGER DEFAULT 0,
        complained INTEGER DEFAULT 0,
        opened INTEGER DEFAULT 0,
        clicked INTEGER DEFAULT 0,
        score REAL DEFAULT 100,
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    // Backup history
    this.db.run(`
      CREATE TABLE IF NOT EXISTS backup_history (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        type TEXT DEFAULT 'manual',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

  }

  // Migrate schema: add missing columns to existing tables from older versions
  _migrateSchema() {
    const migrations = [
      // contacts table - columns that may not exist in older DBs
      { table: 'contacts', column: 'verificationStatus', sql: "ALTER TABLE contacts ADD COLUMN verificationStatus TEXT DEFAULT 'unverified'" },
      { table: 'contacts', column: 'verificationScore', sql: "ALTER TABLE contacts ADD COLUMN verificationScore INTEGER DEFAULT 0" },
      { table: 'contacts', column: 'verificationDetails', sql: "ALTER TABLE contacts ADD COLUMN verificationDetails TEXT DEFAULT '{}'" },
      { table: 'contacts', column: 'bounceCount', sql: "ALTER TABLE contacts ADD COLUMN bounceCount INTEGER DEFAULT 0" },
      { table: 'contacts', column: 'lastBounceReason', sql: "ALTER TABLE contacts ADD COLUMN lastBounceReason TEXT DEFAULT ''" },
      { table: 'contacts', column: 'customField1', sql: "ALTER TABLE contacts ADD COLUMN customField1 TEXT DEFAULT ''" },
      { table: 'contacts', column: 'customField2', sql: "ALTER TABLE contacts ADD COLUMN customField2 TEXT DEFAULT ''" },
      { table: 'contacts', column: 'tags', sql: "ALTER TABLE contacts ADD COLUMN tags TEXT DEFAULT '[]'" },
      { table: 'contacts', column: 'listId', sql: "ALTER TABLE contacts ADD COLUMN listId TEXT DEFAULT ''" },
      { table: 'contacts', column: 'updatedAt', sql: "ALTER TABLE contacts ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },
      { table: 'contacts', column: 'status', sql: "ALTER TABLE contacts ADD COLUMN status TEXT DEFAULT 'active'" },

      // campaigns table
      { table: 'campaigns', column: 'subjectB', sql: "ALTER TABLE campaigns ADD COLUMN subjectB TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'contentB', sql: "ALTER TABLE campaigns ADD COLUMN contentB TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'isABTest', sql: "ALTER TABLE campaigns ADD COLUMN isABTest INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'abTestPercent', sql: "ALTER TABLE campaigns ADD COLUMN abTestPercent INTEGER DEFAULT 10" },
      { table: 'campaigns', column: 'tagFilter', sql: "ALTER TABLE campaigns ADD COLUMN tagFilter TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'manualEmails', sql: "ALTER TABLE campaigns ADD COLUMN manualEmails TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'verificationFilter', sql: "ALTER TABLE campaigns ADD COLUMN verificationFilter TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'smtpAccountId', sql: "ALTER TABLE campaigns ADD COLUMN smtpAccountId TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'delayBetweenEmails', sql: "ALTER TABLE campaigns ADD COLUMN delayBetweenEmails INTEGER DEFAULT 2000" },
      { table: 'campaigns', column: 'maxRetries', sql: "ALTER TABLE campaigns ADD COLUMN maxRetries INTEGER DEFAULT 3" },
      { table: 'campaigns', column: 'bouncedEmails', sql: "ALTER TABLE campaigns ADD COLUMN bouncedEmails INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'scheduledAt', sql: "ALTER TABLE campaigns ADD COLUMN scheduledAt TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'updatedAt', sql: "ALTER TABLE campaigns ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },

      // campaign_logs table
      { table: 'campaign_logs', column: 'variant', sql: "ALTER TABLE campaign_logs ADD COLUMN variant TEXT DEFAULT 'A'" },
      { table: 'campaign_logs', column: 'smtpCode', sql: "ALTER TABLE campaign_logs ADD COLUMN smtpCode INTEGER DEFAULT NULL" },
      { table: 'campaign_logs', column: 'smtpResponse', sql: "ALTER TABLE campaign_logs ADD COLUMN smtpResponse TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'failureType', sql: "ALTER TABLE campaign_logs ADD COLUMN failureType TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'failureReason', sql: "ALTER TABLE campaign_logs ADD COLUMN failureReason TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'trackingId', sql: "ALTER TABLE campaign_logs ADD COLUMN trackingId TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'openedAt', sql: "ALTER TABLE campaign_logs ADD COLUMN openedAt TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'clickedAt', sql: "ALTER TABLE campaign_logs ADD COLUMN clickedAt TEXT DEFAULT ''" },

      // smtp_accounts table
      { table: 'smtp_accounts', column: 'warmUpEnabled', sql: "ALTER TABLE smtp_accounts ADD COLUMN warmUpEnabled INTEGER DEFAULT 0" },
      { table: 'smtp_accounts', column: 'warmUpStartDate', sql: "ALTER TABLE smtp_accounts ADD COLUMN warmUpStartDate TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'warmUpSchedule', sql: "ALTER TABLE smtp_accounts ADD COLUMN warmUpSchedule TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'rejectUnauthorized', sql: "ALTER TABLE smtp_accounts ADD COLUMN rejectUnauthorized INTEGER DEFAULT 1" },
      { table: 'smtp_accounts', column: 'unsubscribeEmail', sql: "ALTER TABLE smtp_accounts ADD COLUMN unsubscribeEmail TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'dkimDomain', sql: "ALTER TABLE smtp_accounts ADD COLUMN dkimDomain TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'dkimSelector', sql: "ALTER TABLE smtp_accounts ADD COLUMN dkimSelector TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'dkimPrivateKey', sql: "ALTER TABLE smtp_accounts ADD COLUMN dkimPrivateKey TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'sentToday', sql: "ALTER TABLE smtp_accounts ADD COLUMN sentToday INTEGER DEFAULT 0" },
      { table: 'smtp_accounts', column: 'lastResetDate', sql: "ALTER TABLE smtp_accounts ADD COLUMN lastResetDate TEXT DEFAULT ''" },
      { table: 'smtp_accounts', column: 'isDefault', sql: "ALTER TABLE smtp_accounts ADD COLUMN isDefault INTEGER DEFAULT 0" },

      // templates table
      { table: 'templates', column: 'blocks', sql: "ALTER TABLE templates ADD COLUMN blocks TEXT DEFAULT '[]'" },

      // blacklist table
      { table: 'blacklist', column: 'source', sql: "ALTER TABLE blacklist ADD COLUMN source TEXT DEFAULT 'manual'" },

      // createdAt columns on tables that older schemas may lack
      { table: 'campaign_logs', column: 'createdAt', sql: "ALTER TABLE campaign_logs ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'contacts', column: 'createdAt', sql: "ALTER TABLE contacts ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'campaigns', column: 'createdAt', sql: "ALTER TABLE campaigns ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'templates', column: 'createdAt', sql: "ALTER TABLE templates ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'templates', column: 'updatedAt', sql: "ALTER TABLE templates ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },
      { table: 'blacklist', column: 'createdAt', sql: "ALTER TABLE blacklist ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'unsubscribes', column: 'createdAt', sql: "ALTER TABLE unsubscribes ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'tracking_events', column: 'createdAt', sql: "ALTER TABLE tracking_events ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'smtp_accounts', column: 'createdAt', sql: "ALTER TABLE smtp_accounts ADD COLUMN createdAt TEXT DEFAULT (datetime('now'))" },
      { table: 'smtp_accounts', column: 'updatedAt', sql: "ALTER TABLE smtp_accounts ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },

      // campaign resume support
      { table: 'campaigns', column: 'resumeData', sql: "ALTER TABLE campaigns ADD COLUMN resumeData TEXT DEFAULT ''" },

      // unsubscribe campaign tracking
      { table: 'unsubscribes', column: 'campaignId', sql: "ALTER TABLE unsubscribes ADD COLUMN campaignId TEXT DEFAULT ''" },

      // smtp account health score
      { table: 'smtp_accounts', column: 'healthScore', sql: "ALTER TABLE smtp_accounts ADD COLUMN healthScore REAL DEFAULT 100" },

      // tracking_events table columns
      { table: 'tracking_events', column: 'client', sql: "ALTER TABLE tracking_events ADD COLUMN client TEXT DEFAULT ''" },
      { table: 'tracking_events', column: 'device', sql: "ALTER TABLE tracking_events ADD COLUMN device TEXT DEFAULT ''" },
      { table: 'tracking_events', column: 'os', sql: "ALTER TABLE tracking_events ADD COLUMN os TEXT DEFAULT ''" },
      { table: 'tracking_events', column: 'isBot', sql: "ALTER TABLE tracking_events ADD COLUMN isBot INTEGER DEFAULT 0" },
      { table: 'tracking_events', column: 'country', sql: "ALTER TABLE tracking_events ADD COLUMN country TEXT DEFAULT ''" },
      { table: 'tracking_events', column: 'region', sql: "ALTER TABLE tracking_events ADD COLUMN region TEXT DEFAULT ''" },
    ];

    for (const m of migrations) {
      if (!this._columnExists(m.table, m.column)) {
        try {
          this.db.run(m.sql);
        } catch (e) {
          // Ignore errors from already-applied migrations
        }
      }
    }

    // Now safe to create indexes (columns guaranteed to exist)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_listId ON contacts(listId)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_verification ON contacts(verificationStatus)',
      'CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaignId ON campaign_logs(campaignId)',
      'CREATE INDEX IF NOT EXISTS idx_campaign_logs_trackingId ON campaign_logs(trackingId)',
      'CREATE INDEX IF NOT EXISTS idx_tracking_events_campaignId ON tracking_events(campaignId)',
      'CREATE INDEX IF NOT EXISTS idx_blacklist_email ON blacklist(email)',
      'CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email)',
    ];
    for (const idx of indexes) {
      try { this.db.run(idx); } catch (e) {}
    }

    this._ensureDefaultSmtpAccount();
  }

  _columnExists(table, column) {
    try {
      const info = this._all(`PRAGMA table_info(${table})`);
      return info.some(col => col.name === column);
    } catch (e) {
      return false;
    }
  }

  // =================== CONTACTS ===================
  getAllContacts() {
    return this._all('SELECT * FROM contacts ORDER BY createdAt DESC');
  }

  getFilteredContacts(filter) {
    let sql = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (filter.listId) {
      sql += ' AND listId = ?';
      params.push(filter.listId);
    }
    if (filter.tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${filter.tag}%`);
    }
    if (filter.verificationStatus) {
      sql += ' AND verificationStatus = ?';
      params.push(filter.verificationStatus);
    }
    if (filter.search) {
      sql += ' AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ?)';
      const s = `%${filter.search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY createdAt DESC';
    return this._all(sql, params);
  }

  getContactsPage(params) {
    const page = params.page || 1;
    const limit = params.perPage || params.limit || 50;
    const offset = (page - 1) * limit;

    let countSql = 'SELECT COUNT(*) as total FROM contacts WHERE 1=1';
    let sql = 'SELECT * FROM contacts WHERE 1=1';
    const countParams = [];
    const queryParams = [];

    if (params.listId) {
      countSql += ' AND listId = ?';
      sql += ' AND listId = ?';
      countParams.push(params.listId);
      queryParams.push(params.listId);
    }
    if (params.status) {
      countSql += ' AND status = ?';
      sql += ' AND status = ?';
      countParams.push(params.status);
      queryParams.push(params.status);
    }
    if (params.tag) {
      countSql += ' AND tags LIKE ?';
      sql += ' AND tags LIKE ?';
      const tagParam = `%${params.tag}%`;
      countParams.push(tagParam);
      queryParams.push(tagParam);
    }
    if (params.verificationStatus) {
      countSql += ' AND verificationStatus = ?';
      sql += ' AND verificationStatus = ?';
      countParams.push(params.verificationStatus);
      queryParams.push(params.verificationStatus);
    }
    if (params.search) {
      const searchClause = ' AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ?)';
      countSql += searchClause;
      sql += searchClause;
      const s = `%${params.search}%`;
      countParams.push(s, s, s, s);
      queryParams.push(s, s, s, s);
    }

    // Dynamic sort — whitelist columns to prevent injection
    const allowedSortCols = ['email', 'firstName', 'lastName', 'company', 'createdAt', 'updatedAt', 'verificationStatus', 'verificationScore'];
    const sortCol = allowedSortCols.includes(params.sortBy) ? params.sortBy : 'createdAt';
    const sortDir = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const countResult = this._get(countSql, countParams);
    const contacts = this._all(sql, queryParams);

    return {
      contacts,
      total: countResult ? countResult.total : 0,
      page,
      limit,
      totalPages: Math.ceil((countResult ? countResult.total : 0) / limit)
    };
  }

  getContactStats() {
    const total = this._get('SELECT COUNT(*) as count FROM contacts');
    const verified = this._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'valid'");
    const unverified = this._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'unverified' OR verificationStatus IS NULL");
    const invalid = this._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'invalid'");
    const risky = this._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'risky'");
    const active = this._get("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'");

    return {
      total: total?.count || 0,
      verified: verified?.count || 0,
      unverified: unverified?.count || 0,
      invalid: invalid?.count || 0,
      risky: risky?.count || 0,
      active: active?.count || 0
    };
  }

  // Validate email format
  _isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return emailRegex.test(email.trim());
  }

  addContact(contact) {
    const email = (contact.email || '').trim().toLowerCase();
    if (!this._isValidEmail(email)) {
      return { error: 'Invalid email format', email: contact.email };
    }
    const id = contact.id || uuidv4();
    const tags = Array.isArray(contact.tags) ? JSON.stringify(contact.tags) : (contact.tags || '[]');
    const verificationStatus = contact.verificationStatus || (contact.verified ? 'valid' : 'unverified');
    const verificationScore = contact.verificationScore || 0;
    const verificationDetails = contact.verificationDetails ? JSON.stringify(contact.verificationDetails) : '{}';
    this._run(
      `INSERT OR IGNORE INTO contacts (id, email, firstName, lastName, company, phone, customField1, customField2, tags, listId, status, verificationStatus, verificationScore, verificationDetails)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, contact.firstName || '', contact.lastName || '', contact.company || '',
       contact.phone || '', contact.customField1 || '', contact.customField2 || '', tags, contact.listId || '',
       contact.status || 'active', verificationStatus, verificationScore, verificationDetails]
    );
    return id;
  }

  addBulkContacts(contacts) {
    let added = 0;
    let skipped = 0;
    let duplicates = 0;
    let invalid = 0;
    const seen = new Set();

    // Wrap in transaction for atomicity and performance
    this.db.run('BEGIN TRANSACTION');
    try {
    for (const contact of contacts) {
      try {
        const email = (contact.email || '').trim().toLowerCase();

        // Validate format
        if (!this._isValidEmail(email)) {
          invalid++;
          skipped++;
          continue;
        }

        // Check in-batch duplicates
        if (seen.has(email)) {
          duplicates++;
          skipped++;
          continue;
        }
        seen.add(email);

        // Check existing in DB
        const existing = this._get('SELECT id FROM contacts WHERE email = ?', [email]);
        if (existing) {
          duplicates++;
          skipped++;
          continue;
        }

        this.addContact(contact); // _save() is called once after COMMIT below
        added++;
      } catch (e) {
        skipped++;
      }
    }
    this.db.run('COMMIT');
    } catch (e) {
      try { this.db.run('ROLLBACK'); } catch (re) {}
      throw e;
    }
    // Save once after bulk
    this._save();
    return { added, inserted: added, skipped, duplicates, invalid, total: contacts.length };
  }

  updateContact(contact) {
    const tags = Array.isArray(contact.tags) ? JSON.stringify(contact.tags) : (contact.tags || '[]');
    this._run(
      `UPDATE contacts SET firstName=?, lastName=?, company=?, phone=?, customField1=?, customField2=?,
       tags=?, listId=?, verificationStatus=?, verificationScore=?, verificationDetails=?,
       updatedAt=datetime('now') WHERE id=?`,
      [contact.firstName || '', contact.lastName || '', contact.company || '', contact.phone || '',
       contact.customField1 || '', contact.customField2 || '', tags, contact.listId || '',
       contact.verificationStatus || 'unverified', contact.verificationScore || 0,
       JSON.stringify(contact.verificationDetails || {}), contact.id]
    );
  }

  deleteContacts(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this._run(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
  }

  deleteContactsByVerification(status) {
    this._run('DELETE FROM contacts WHERE verificationStatus = ?', [status]);
  }

  getRecipientCount(filter) {
    const manualEmails = Array.isArray(filter?.emails)
      ? filter.emails.filter(Boolean)
      : [];
    if (manualEmails.length > 0) {
      return [...new Set(manualEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))].length;
    }

    let sql = 'SELECT COUNT(*) as count FROM contacts WHERE 1=1';
    const params = [];

    if (filter.listId) {
      sql += ' AND listId = ?';
      params.push(filter.listId);
    }
    // Support both legacy `filter.tag` and current `filter.tags` array.
    const rawTags = filter?.tags ?? filter?.tag;
    let tagsToMatch = [];
    if (Array.isArray(rawTags)) {
      tagsToMatch = rawTags;
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      try {
        const parsed = JSON.parse(rawTags);
        tagsToMatch = Array.isArray(parsed) ? parsed : [rawTags];
      } catch {
        tagsToMatch = [rawTags];
      }
    }
    for (const t of tagsToMatch) {
      if (!t) continue;
      sql += ' AND tags LIKE ?';
      params.push(`%${t}%`);
    }
    if (filter.verificationStatus) {
      sql += ' AND verificationStatus = ?';
      params.push(filter.verificationStatus);
    }

    const result = this._get(sql, params);
    return result?.count || 0;
  }

  getContactsForCampaign(filter) {
    const manualEmails = Array.isArray(filter?.emails)
      ? [...new Set(filter.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))]
      : [];
    if (manualEmails.length > 0) {
      const placeholders = manualEmails.map(() => '?').join(',');
      return this._all(`SELECT * FROM contacts WHERE lower(email) IN (${placeholders})`, manualEmails);
    }

    let sql = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (filter.listId) {
      sql += ' AND listId = ?';
      params.push(filter.listId);
    }
    // Support both legacy `filter.tag` and current `filter.tags` array.
    const rawTags = filter?.tags ?? filter?.tag;
    let tagsToMatch = [];
    if (Array.isArray(rawTags)) {
      tagsToMatch = rawTags;
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      try {
        const parsed = JSON.parse(rawTags);
        tagsToMatch = Array.isArray(parsed) ? parsed : [rawTags];
      } catch {
        tagsToMatch = [rawTags];
      }
    }
    for (const t of tagsToMatch) {
      if (!t) continue;
      sql += ' AND tags LIKE ?';
      params.push(`%${t}%`);
    }
    if (filter.verificationStatus) {
      if (filter.verificationStatus === 'verified_only') {
        sql += " AND verificationStatus = 'valid'";
      } else if (filter.verificationStatus === 'exclude_invalid') {
        sql += " AND verificationStatus != 'invalid'";
      }
    }

    return this._all(sql, params);
  }

  incrementContactBounce(contactId, reason) {
    this._run(
      `UPDATE contacts SET bounceCount = bounceCount + 1, lastBounceReason = ?, updatedAt = datetime('now') WHERE id = ?`,
      [reason || '', contactId]
    );
  }

  // =================== LISTS ===================
  getAllLists() {
    return this._all('SELECT * FROM lists ORDER BY createdAt DESC');
  }

  addList(list) {
    const id = list.id || uuidv4();
    this._run('INSERT INTO lists (id, name, description, color) VALUES (?, ?, ?, ?)',
      [id, list.name, list.description || '', list.color || '#6366f1']);
    return id;
  }

  updateList(list) {
    this._run('UPDATE lists SET name=?, description=?, color=? WHERE id=?',
      [list.name, list.description || '', list.color || '#6366f1', list.id]);
  }

  deleteList(id) {
    this._run('DELETE FROM lists WHERE id = ?', [id]);
    // Clear listId from contacts that used this list
    this._run("UPDATE contacts SET listId = '' WHERE listId = ?", [id]);
  }

  getListContacts(listId) {
    return this._all('SELECT * FROM contacts WHERE listId = ?', [listId]);
  }

  // =================== TAGS ===================
  getAllTags() {
    return this._all('SELECT * FROM tags ORDER BY name ASC');
  }

  addTag(tag) {
    const id = tag.id || uuidv4();
    try {
      this._run('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
        [id, tag.name, tag.color || '#6366f1']);
    } catch (e) {
      // Duplicate tag name - ignore
    }
    return id;
  }

  deleteTag(id) {
    this._run('DELETE FROM tags WHERE id = ?', [id]);
  }

  // =================== BLACKLIST ===================
  getAllBlacklist() {
    return this._all('SELECT * FROM blacklist ORDER BY createdAt DESC').map((entry) => {
      const storedValue = (entry.email || '').toLowerCase();
      if (storedValue.startsWith('@') && storedValue.length > 1) {
        return {
          ...entry,
          email: '',
          domain: storedValue.slice(1)
        };
      }

      return {
        ...entry,
        domain: ''
      };
    });
  }

  addToBlacklist(entry) {
    const id = entry.id || uuidv4();
    const normalizedEmail = String(entry.email || '').trim().toLowerCase();
    const normalizedDomain = String(entry.domain || '').trim().toLowerCase();
    const address = normalizedEmail || (normalizedDomain ? `@${normalizedDomain}` : '');
    if (!address) return id;

    try {
      this._run('INSERT OR IGNORE INTO blacklist (id, email, reason, source) VALUES (?, ?, ?, ?)',
        [id, address, entry.reason || '', entry.source || 'manual']);
    } catch (e) {
      // Duplicate - ignore
    }
    return id;
  }

  addBulkToBlacklist(entries) {
    let added = 0;
    this.db.run('BEGIN TRANSACTION');
    try {
      for (const entry of entries) {
        try {
          const normalizedEmail = String(entry.email || '').trim().toLowerCase();
          const normalizedDomain = String(entry.domain || '').trim().toLowerCase();
          const address = normalizedEmail || (normalizedDomain ? `@${normalizedDomain}` : '');
          if (!address) continue;

          const existing = this._get('SELECT id FROM blacklist WHERE email = ?', [address]);
          if (!existing) {
            this.addToBlacklist(entry);
            added++;
          }
        } catch (e) {
          // ignore duplicate entry
        }
      }
      this.db.run('COMMIT');
    } catch (e) {
      try { this.db.run('ROLLBACK'); } catch (re) {}
    }
    this._save();
    return { added, total: entries.length };
  }

  removeFromBlacklist(id) {
    this._run('DELETE FROM blacklist WHERE id = ?', [id]);
  }

  isBlacklisted(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return false;

    const domain = normalizedEmail.includes('@') ? `@${normalizedEmail.split('@')[1]}` : '';
    const result = domain
      ? this._get('SELECT id FROM blacklist WHERE email = ? OR email = ?', [normalizedEmail, domain])
      : this._get('SELECT id FROM blacklist WHERE email = ?', [normalizedEmail]);
    return !!result;
  }

  // Auto-blacklist contacts that hard bounced 2+ times
  autoBlacklistBounced() {
    const bounced = this._all('SELECT * FROM contacts WHERE bounceCount >= 2');
    let count = 0;
    for (const contact of bounced) {
      if (!this.isBlacklisted(contact.email)) {
        this.addToBlacklist({
          email: contact.email,
          reason: `Auto-blacklisted: ${contact.bounceCount} bounces - ${contact.lastBounceReason}`,
          source: 'auto_bounce'
        });
        count++;
      }
    }
    return { blacklisted: count };
  }

  // =================== UNSUBSCRIBES ===================
  getAllUnsubscribes() {
    return this._all('SELECT * FROM unsubscribes ORDER BY createdAt DESC');
  }

  addUnsubscribe(email, campaignId, reason) {
    const id = uuidv4();
    try {
      this._run('INSERT OR IGNORE INTO unsubscribes (id, email, campaignId, reason) VALUES (?, ?, ?, ?)',
        [id, email.toLowerCase(), campaignId || '', reason || '']);
    } catch (e) {
      // ignore duplicate or error
    }
  }

  removeUnsubscribe(email) {
    this._run('DELETE FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
  }

  isUnsubscribed(email) {
    const result = this._get('SELECT id FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
    return !!result;
  }

  // =================== TEMPLATES ===================
  getAllTemplates() {
    return this._all('SELECT * FROM templates ORDER BY updatedAt DESC');
  }

  getTemplatesByCategory(category) {
    return this._all('SELECT * FROM templates WHERE category = ? ORDER BY updatedAt DESC', [category]);
  }

  getTemplateWithBlocks(templateId) {
    return this._get('SELECT * FROM templates WHERE id = ?', [templateId]);
  }

  saveTemplateBlocks(data) {
    this._run("UPDATE templates SET blocks = ?, updatedAt = datetime('now') WHERE id = ?",
      [JSON.stringify(data.blocks || []), data.templateId]);
  }

  getTemplateCategories() {
    const results = this._all('SELECT DISTINCT category FROM templates ORDER BY category ASC');
    return results.map(r => r.category).filter(Boolean);
  }

  addTemplate(template) {
    const id = template.id || uuidv4();
    this._run(
      'INSERT INTO templates (id, name, subject, content, category, blocks) VALUES (?, ?, ?, ?, ?, ?)',
      [id, template.name, template.subject || '', template.content || '',
       template.category || 'general', JSON.stringify(template.blocks || [])]
    );
    return id;
  }

  updateTemplate(template) {
    this._run(
      "UPDATE templates SET name=?, subject=?, content=?, category=?, blocks=?, updatedAt=datetime('now') WHERE id=?",
      [template.name, template.subject || '', template.content || '',
       template.category || 'general', JSON.stringify(template.blocks || []), template.id]
    );
  }

  deleteTemplate(id) {
    this._run('DELETE FROM templates WHERE id = ?', [id]);
  }

  // =================== SMTP ACCOUNTS ===================
  getAllSmtpAccounts() {
    return this._all('SELECT * FROM smtp_accounts ORDER BY isDefault DESC, createdAt DESC');
  }

  getActiveSmtpAccounts() {
    // Reset daily counts if the date has changed
    this._resetDailyCounts();
    return this._all('SELECT * FROM smtp_accounts WHERE isActive = 1 ORDER BY isDefault DESC, createdAt DESC');
  }

  getPrimarySmtpAccount(activeOnly = false) {
    const filter = activeOnly ? 'WHERE isActive = 1' : '';
    return this._get(`SELECT * FROM smtp_accounts ${filter} ORDER BY isDefault DESC, createdAt DESC LIMIT 1`);
  }

  _ensureDefaultSmtpAccount(preferredId = '') {
    const accounts = this._all('SELECT id, isDefault FROM smtp_accounts ORDER BY createdAt DESC');
    if (accounts.length === 0) return null;

    let selectedId = preferredId && accounts.some((account) => account.id === preferredId)
      ? preferredId
      : null;

    if (!selectedId) {
      selectedId = accounts.find((account) => !!account.isDefault)?.id || accounts[0].id;
    }

    this.db.run(
      'UPDATE smtp_accounts SET isDefault = CASE WHEN id = ? THEN 1 ELSE 0 END',
      [selectedId]
    );

    return selectedId;
  }

  addSmtpAccount(account) {
    const id = account.id || uuidv4();
    this.db.run(
      `INSERT INTO smtp_accounts (id, name, host, port, secure, username, password, fromName, fromEmail, replyTo,
        dailyLimit, isActive, isDefault, warmUpEnabled, warmUpStartDate, warmUpSchedule, rejectUnauthorized, unsubscribeEmail,
        dkimDomain, dkimSelector, dkimPrivateKey)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account.name || '', account.host, account.port || 587, account.secure ? 1 : 0,
       account.username, account.password, account.fromName || '', account.fromEmail || '',
       account.replyTo || '', account.dailyLimit || 500, account.isActive !== false ? 1 : 0, account.isDefault ? 1 : 0,
       account.warmUpEnabled ? 1 : 0, account.warmUpStartDate || '',
       JSON.stringify(account.warmUpSchedule || {}), account.rejectUnauthorized !== false ? 1 : 0,
       account.unsubscribeEmail || '', account.dkimDomain || '', account.dkimSelector || '',
       account.dkimPrivateKey || '']
    );
    this._ensureDefaultSmtpAccount(account.isDefault ? id : '');
    this._saveDebounced();
    return id;
  }

  updateSmtpAccount(account) {
    this.db.run(
      `UPDATE smtp_accounts SET name=?, host=?, port=?, secure=?, username=?, password=?, fromName=?, fromEmail=?,
       replyTo=?, dailyLimit=?, isActive=?, isDefault=?, warmUpEnabled=?, warmUpStartDate=?, warmUpSchedule=?,
       rejectUnauthorized=?, unsubscribeEmail=?, dkimDomain=?, dkimSelector=?, dkimPrivateKey=?,
       updatedAt=datetime('now') WHERE id=?`,
      [account.name || '', account.host, account.port || 587, account.secure ? 1 : 0,
       account.username, account.password, account.fromName || '', account.fromEmail || '',
       account.replyTo || '', account.dailyLimit || 500, account.isActive !== false ? 1 : 0, account.isDefault ? 1 : 0,
       account.warmUpEnabled ? 1 : 0, account.warmUpStartDate || '',
       JSON.stringify(account.warmUpSchedule || {}), account.rejectUnauthorized !== false ? 1 : 0,
       account.unsubscribeEmail || '', account.dkimDomain || '', account.dkimSelector || '',
       account.dkimPrivateKey || '', account.id]
    );
    this._ensureDefaultSmtpAccount(account.isDefault ? account.id : '');
    this._saveDebounced();
  }

  deleteSmtpAccount(id) {
    const target = this._get('SELECT id, isDefault FROM smtp_accounts WHERE id = ?', [id]);
    this.db.run('DELETE FROM smtp_accounts WHERE id = ?', [id]);
    if (target?.isDefault) {
      this._ensureDefaultSmtpAccount();
    }
    this._saveDebounced();
  }

  incrementSmtpSentCount(accountId) {
    this._run('UPDATE smtp_accounts SET sentToday = sentToday + 1 WHERE id = ?', [accountId]);
  }

  _resetDailyCounts() {
    const today = new Date().toISOString().split('T')[0];
    // Cache the last reset date so we only run the UPDATE once per calendar day,
    // instead of on every getActiveSmtpAccounts() call (which fires per-email).
    if (this._lastResetDate === today) return;
    this._lastResetDate = today;
    this._run(
      "UPDATE smtp_accounts SET sentToday = 0, lastResetDate = ? WHERE lastResetDate != ?",
      [today, today]
    );
  }

  // =================== CAMPAIGNS ===================
  getAllCampaigns() {
    // JOIN campaign_logs to compute live opened/clicked counts so the
    // campaign list page always shows accurate rates without a separate
    // getCampaignAnalytics() call per row.
    return this._all(`
      SELECT c.*,
             l.name AS listName,
             COALESCE(stats.openedEmails,  0) AS openedEmails,
             COALESCE(stats.clickedEmails, 0) AS clickedEmails
      FROM campaigns c
      LEFT JOIN lists l ON c.listId = l.id
      LEFT JOIN (
        SELECT campaignId,
               SUM(CASE WHEN openedAt IS NOT NULL AND openedAt != '' THEN 1 ELSE 0 END) AS openedEmails,
               SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS clickedEmails
        FROM campaign_logs
        GROUP BY campaignId
      ) stats ON stats.campaignId = c.id
      ORDER BY c.createdAt DESC
    `);
  }

  getScheduledCampaigns() {
    return this._all(`SELECT c.*, l.name as listName FROM campaigns c LEFT JOIN lists l ON c.listId = l.id WHERE c.status = 'scheduled' AND c.scheduledAt != '' ORDER BY c.scheduledAt ASC`);
  }

  addCampaign(campaign) {
    const id = campaign.id || uuidv4();
    this._run(
      `INSERT INTO campaigns (id, name, subject, content, subjectB, contentB, isABTest, abTestPercent,
        status, listId, tagFilter, manualEmails, verificationFilter, smtpAccountId, batchSize, delayMinutes,
        delayBetweenEmails, maxRetries, scheduledAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, campaign.name || '', campaign.subject || '', campaign.content || '',
       campaign.subjectB || '', campaign.contentB || '', campaign.isABTest ? 1 : 0,
       campaign.abTestPercent || 10, campaign.status || 'draft', campaign.listId || '',
       campaign.tagFilter || '', campaign.manualEmails || '', campaign.verificationFilter || '', campaign.smtpAccountId || '',
       campaign.batchSize || 50, campaign.delayMinutes || 10, campaign.delayBetweenEmails || 2000,
       campaign.maxRetries || 3, campaign.scheduledAt || '']
    );
    return id;
  }

  updateCampaign(campaign) {
    this._run(
      `UPDATE campaigns SET name=?, subject=?, content=?, subjectB=?, contentB=?, isABTest=?,
       abTestPercent=?, status=?, listId=?, tagFilter=?, manualEmails=?, verificationFilter=?, smtpAccountId=?,
       batchSize=?, delayMinutes=?, delayBetweenEmails=?, maxRetries=?, totalEmails=?,
       sentEmails=?, failedEmails=?, bouncedEmails=?, scheduledAt=?, startedAt=?, completedAt=?,
       updatedAt=datetime('now') WHERE id=?`,
      [campaign.name || '', campaign.subject || '', campaign.content || '',
       campaign.subjectB || '', campaign.contentB || '', campaign.isABTest ? 1 : 0,
       campaign.abTestPercent || 10, campaign.status || 'draft', campaign.listId || '',
       campaign.tagFilter || '', campaign.manualEmails || '', campaign.verificationFilter || '', campaign.smtpAccountId || '',
       campaign.batchSize || 50, campaign.delayMinutes || 10, campaign.delayBetweenEmails || 2000,
       campaign.maxRetries || 3, campaign.totalEmails || 0, campaign.sentEmails || 0,
       campaign.failedEmails || 0, campaign.bouncedEmails || 0, campaign.scheduledAt || '',
       campaign.startedAt || '', campaign.completedAt || '', campaign.id]
    );
  }

  deleteCampaign(id) {
    this._run('DELETE FROM campaigns WHERE id = ?', [id]);
    this._run('DELETE FROM campaign_logs WHERE campaignId = ?', [id]);
  }

  // =================== CAMPAIGN LOGS ===================
  getCampaignLogs(campaignId) {
    return this._all('SELECT * FROM campaign_logs WHERE campaignId = ? ORDER BY createdAt DESC', [campaignId]);
  }

  addCampaignLog(log) {
    const id = log.id || uuidv4();
    this._run(
      `INSERT INTO campaign_logs (id, campaignId, contactId, email, status, variant, smtpCode,
        smtpResponse, failureType, failureReason, trackingId, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, log.campaignId, log.contactId || '', log.email, log.status || 'pending',
       log.variant || 'A', log.smtpCode || null, log.smtpResponse || '',
       log.failureType || '', log.failureReason || '', log.trackingId || '', log.error || '']
    );
  }

  addCampaignLogBatch(logs) {
    for (const log of logs) {
      const id = log.id || uuidv4();
      this._run(
        `INSERT INTO campaign_logs (id, campaignId, contactId, email, status, variant, smtpCode,
          smtpResponse, failureType, failureReason, trackingId, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, log.campaignId, log.contactId || '', log.email, log.status || 'pending',
         log.variant || 'A', log.smtpCode || null, log.smtpResponse || '',
         log.failureType || '', log.failureReason || '', log.trackingId || '', log.error || '']
      );
    }
    // Single debounced save for all logs
    this._saveDebounced();
  }

  getCampaignLogByTracking(campaignId, trackingId) {
    return this._get('SELECT * FROM campaign_logs WHERE campaignId = ? AND trackingId = ?',
      [campaignId, trackingId]);
  }

  updateCampaignLogOpened(campaignId, trackingId) {
    this._run(
      "UPDATE campaign_logs SET openedAt = datetime('now') WHERE campaignId = ? AND trackingId = ? AND (openedAt IS NULL OR openedAt = '')",
      [campaignId, trackingId]
    );
  }

  updateCampaignLogClicked(campaignId, trackingId) {
    this._run(
      "UPDATE campaign_logs SET clickedAt = datetime('now') WHERE campaignId = ? AND trackingId = ? AND (clickedAt IS NULL OR clickedAt = '')",
      [campaignId, trackingId]
    );
  }

  getCampaignAnalytics(campaignId) {
    const campaign = this._get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) return null;

    const logs = this.getCampaignLogs(campaignId);
    const events = this.getTrackingEvents(campaignId);

    const sent = logs.filter(l => l.status === 'sent').length;
    const failed = logs.filter(l => l.status === 'failed').length;
    const bounced = logs.filter(l => l.status === 'bounced').length;
    const softBounced = logs.filter(l => l.status === 'soft_bounce').length;
    const opened = logs.filter(l => l.openedAt).length;
    const clicked = logs.filter(l => l.clickedAt).length;

    const openEvents = events.filter(e => e.type === 'open');
    const clickEvents = events.filter(e => e.type === 'click');
    const uniqueOpens = new Set(openEvents.map(e => e.contactId)).size;
    const uniqueClicks = new Set(clickEvents.map(e => e.contactId)).size;

    // A/B test results
    const variantA = logs.filter(l => l.variant === 'A');
    const variantB = logs.filter(l => l.variant === 'B');

    // Opens by hour from tracking events
    const opensByHourMap = {};
    openEvents.forEach(e => {
      const hour = new Date(e.createdAt).getHours().toString().padStart(2, '0');
      opensByHourMap[hour] = (opensByHourMap[hour] || 0) + 1;
    });
    const opensByHour = Object.entries(opensByHourMap)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Clicks by link from tracking events
    const clicksByLinkMap = {};
    clickEvents.forEach(e => {
      if (e.link) clicksByLinkMap[e.link] = (clicksByLinkMap[e.link] || 0) + 1;
    });
    const clicksByLink = Object.entries(clicksByLinkMap)
      .map(([link, count]) => ({ link, count }))
      .sort((a, b) => b.count - a.count);

    // Enrich campaign record with computed tracking fields
    const enrichedCampaign = {
      ...campaign,
      isABTest: !!campaign.isABTest,
      sentEmails: campaign.sentEmails || sent,
      totalEmails: campaign.totalEmails || logs.length,
      failedEmails: campaign.failedEmails || failed,
      bouncedEmails: campaign.bouncedEmails || bounced,
      softBouncedEmails: softBounced,
      openedEmails: opened,
      clickedEmails: clicked,
      openedEmailsA: variantA.filter(l => l.openedAt).length,
      openedEmailsB: variantB.filter(l => l.openedAt).length,
      sentEmailsA: variantA.filter(l => l.status === 'sent').length,
      sentEmailsB: variantB.filter(l => l.status === 'sent').length,
    };

    return {
      campaign: enrichedCampaign,
      logs,
      opensByHour,
      clicksByLink,
      total: logs.length,
      sent,
      failed,
      bounced,
      softBounced,
      opened,
      clicked,
      uniqueOpens,
      uniqueClicks,
      openRate: sent > 0 ? ((uniqueOpens / sent) * 100).toFixed(1) : 0,
      clickRate: sent > 0 ? ((uniqueClicks / sent) * 100).toFixed(1) : 0,
      bounceRate: logs.length > 0 ? (((bounced + softBounced) / logs.length) * 100).toFixed(1) : 0,
      abTest: {
        A: { sent: variantA.filter(l => l.status === 'sent').length, opened: variantA.filter(l => l.openedAt).length },
        B: { sent: variantB.filter(l => l.status === 'sent').length, opened: variantB.filter(l => l.openedAt).length }
      }
    };
  }

  // =================== TRACKING EVENTS ===================
  getTrackingEvents(campaignId) {
    return this._all('SELECT * FROM tracking_events WHERE campaignId = ? ORDER BY createdAt DESC', [campaignId]);
  }

  addTrackingEvent(event) {
    const id = event.id || uuidv4();
    this._run(
      `INSERT INTO tracking_events (id, campaignId, contactId, email, type, link, userAgent,
        ipAddress, client, device, os, isBot, country, region)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, event.campaignId, event.contactId || '', event.email || '', event.type,
       event.link || '', event.userAgent || '', event.ipAddress || '',
       event.client || '', event.device || '', event.os || '', event.isBot ? 1 : 0,
       event.country || '', event.region || '']
    );
  }

  // =================== SPAM REPLACEMENTS ===================
  getAllSpamReplacements() {
    return this._all('SELECT * FROM spam_replacements ORDER BY spamWord ASC');
  }

  addSpamReplacement(item) {
    const id = item.id || uuidv4();
    this._run('INSERT INTO spam_replacements (id, spamWord, replacement, category) VALUES (?, ?, ?, ?)',
      [id, item.spamWord, item.replacement || '', item.category || 'general']);
    return id;
  }

  updateSpamReplacement(item) {
    this._run('UPDATE spam_replacements SET spamWord=?, replacement=?, category=? WHERE id=?',
      [item.spamWord, item.replacement || '', item.category || 'general', item.id]);
  }

  deleteSpamReplacement(id) {
    this._run('DELETE FROM spam_replacements WHERE id = ?', [id]);
  }

  // =================== SETTINGS ===================
  getSetting(key) {
    const result = this._get('SELECT value FROM settings WHERE key = ?', [key]);
    return result ? result.value : null;
  }

  setSetting(key, value) {
    this._run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }

  getAllSettings() {
    const rows = this._all('SELECT * FROM settings');
    const settings = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch (e) {
        settings[row.key] = row.value;
      }
    }
    return settings;
  }

  saveAllSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      this.setSetting(key, value);
    }
  }

  // =================== WARMUP SCHEDULES ===================
  getWarmupSchedules() {
    return this._all('SELECT * FROM warmup_schedules ORDER BY createdAt DESC');
  }

  createWarmupSchedule(schedule) {
    const id = schedule.id || uuidv4();
    this._run('INSERT INTO warmup_schedules (id, smtpAccountId, schedule, isActive) VALUES (?, ?, ?, ?)',
      [id, schedule.smtpAccountId, JSON.stringify(schedule.schedule || {}), schedule.isActive ? 1 : 0]);
    return id;
  }

  updateWarmupSchedule(schedule) {
    this._run('UPDATE warmup_schedules SET schedule=?, isActive=? WHERE id=?',
      [JSON.stringify(schedule.schedule || {}), schedule.isActive ? 1 : 0, schedule.id]);
  }

  deleteWarmupSchedule(id) {
    this._run('DELETE FROM warmup_schedules WHERE id = ?', [id]);
  }

  // =================== DASHBOARD STATS ===================
  getDashboardStats() {
    const contactStats = this.getContactStats();

    const campaigns = this._all('SELECT * FROM campaigns ORDER BY createdAt DESC');
    const blacklistCount = this._get('SELECT COUNT(*) as count FROM blacklist') || { count: 0 };
    const unsubCount = this._get('SELECT COUNT(*) as count FROM unsubscribes') || { count: 0 };

    const totalSent = campaigns.reduce((sum, c) => sum + (c.sentEmails || 0), 0);
    const totalFailed = campaigns.reduce((sum, c) => sum + (c.failedEmails || 0), 0);
    const totalBounced = campaigns.reduce((sum, c) => sum + (c.bouncedEmails || 0), 0);

    // Calculate open/click rates from campaign logs
    let allLogs = [];
    try { allLogs = this._all('SELECT openedAt, clickedAt FROM campaign_logs WHERE status = ?', ['sent']); } catch(e) {}
    const openedLogs = allLogs.filter(l => l.openedAt);
    const clickedLogs = allLogs.filter(l => l.clickedAt);

    const openRate = allLogs.length > 0 ? ((openedLogs.length / allLogs.length) * 100).toFixed(1) : 0;
    const clickRate = allLogs.length > 0 ? ((clickedLogs.length / allLogs.length) * 100).toFixed(1) : 0;

    // Recent campaigns (last 10)
    const recentCampaigns = campaigns.slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      sent: c.sentEmails || 0,
      total: c.totalEmails || 0,
      startedAt: c.startedAt,
      completedAt: c.completedAt
    }));

    // SMTP account health
    const smtpAccounts = this.getAllSmtpAccounts();
    const smtpHealth = smtpAccounts.map(a => ({
      id: a.id,
      name: a.name || a.fromEmail,
      isActive: !!a.isActive,
      sentToday: a.sentToday || 0,
      dailyLimit: a.dailyLimit,
      warmUpEnabled: !!a.warmUpEnabled
    }));

    // Send history (last 30 days) - wrapped in try/catch for schema compatibility
    let recentLogs = [];
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      recentLogs = this._all(
        "SELECT date(createdAt) as day, COUNT(*) as count FROM campaign_logs WHERE createdAt >= ? AND status = 'sent' GROUP BY date(createdAt) ORDER BY day ASC",
        [thirtyDaysAgo]
      );
    } catch (e) {
      // Older schema may lack createdAt - return empty history
    }

    // Compute overall deliverability score from multiple signals
    let deliverabilityScore = 0;
    const scores = [];
    // Factor 1: Email delivery success rate (weight: 40%)
    const deliveryRate = totalSent > 0 ? ((totalSent - totalBounced) / totalSent) * 100 : 100;
    scores.push({ value: deliveryRate, weight: 0.4 });
    // Factor 2: Contact list quality — verified ratio (weight: 25%)
    const contactTotal = contactStats.total || 0;
    const contactVerified = contactStats.verified || 0;
    const listQuality = contactTotal > 0 ? (contactVerified / contactTotal) * 100 : 50;
    scores.push({ value: listQuality, weight: 0.25 });
    // Factor 3: Engagement — open rate (weight: 20%)
    const engagementScore = Math.min(parseFloat(openRate) * 2, 100); // 50% open rate = perfect
    scores.push({ value: engagementScore, weight: 0.2 });
    // Factor 4: Complaint/bounce penalty (weight: 15%)
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) : 0;
    const cleanScore = Math.max(0, 100 - (bounceRate * 300)); // 33% bounce = 0 score
    scores.push({ value: cleanScore, weight: 0.15 });
    deliverabilityScore = Math.round(scores.reduce((sum, s) => sum + s.value * s.weight, 0));
    // Clamp 0-100
    deliverabilityScore = Math.max(0, Math.min(100, deliverabilityScore));

    return {
      contacts: contactStats,
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter(c => c.status === 'running').length,
        completed: campaigns.filter(c => c.status === 'completed').length,
        scheduled: campaigns.filter(c => c.status === 'scheduled').length,
        draft: campaigns.filter(c => c.status === 'draft').length
      },
      emails: {
        totalSent,
        totalFailed,
        totalBounced,
        successRate: totalSent > 0 ? (((totalSent - totalBounced) / totalSent) * 100).toFixed(1) : 0,
        openRate,
        clickRate
      },
      deliverabilityScore,
      blacklisted: blacklistCount?.count || 0,
      unsubscribed: unsubCount?.count || 0,
      recentCampaigns,
      smtpHealth,
      sendHistory: recentLogs
    };
  }

  // =================== BACKUP & RESTORE ===================
  createBackup(backupPath) {
    this.flushSave(); // ensure all pending writes are on disk first
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);
    return { success: true, path: backupPath, size: buffer.length };
  }

  restoreFromBackup(backupPath) {
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Backup file not found' };
    }
    const fileBuffer = fs.readFileSync(backupPath);
    this.db.close();
    this.db = new this.SQL.Database(fileBuffer);
    this._save();
    return { success: true };
  }

  getBackupInfo() {
    if (fs.existsSync(this.dbPath)) {
      const stats = fs.statSync(this.dbPath);
      return {
        exists: true,
        path: this.dbPath,
        size: stats.size,
        lastModified: stats.mtime.toISOString()
      };
    }
    return { exists: false };
  }

  // =================== CAMPAIGN RESUME ===================
  getResumableCampaigns() {
    return this._all("SELECT * FROM campaigns WHERE status = 'running' OR status = 'paused'");
  }

  getSentEmailsForCampaign(campaignId) {
    return this._all("SELECT email FROM campaign_logs WHERE campaignId = ? AND status = 'sent'", [campaignId])
      .map(r => r.email);
  }

  saveCampaignResumeData(campaignId, data) {
    this._run("UPDATE campaigns SET resumeData = ?, updatedAt = datetime('now') WHERE id = ?",
      [JSON.stringify(data), campaignId]);
  }

  // =================== SEGMENTS ===================
  getAllSegments() {
    return this._all('SELECT * FROM segments ORDER BY name ASC');
  }

  getSegment(id) {
    return this._get('SELECT * FROM segments WHERE id = ?', [id]);
  }

  addSegment(segment) {
    const id = segment.id || uuidv4();
    const filters = typeof segment.filters === 'string' ? segment.filters : JSON.stringify(segment.filters || {});
    this._run('INSERT INTO segments (id, name, filters) VALUES (?, ?, ?)', [id, segment.name, filters]);
    return id;
  }

  updateSegment(segment) {
    const filters = typeof segment.filters === 'string' ? segment.filters : JSON.stringify(segment.filters || {});
    this._run("UPDATE segments SET name=?, filters=?, contactCount=?, updatedAt=datetime('now') WHERE id=?",
      [segment.name, filters, segment.contactCount || 0, segment.id]);
  }

  deleteSegment(id) {
    this._run('DELETE FROM segments WHERE id = ?', [id]);
  }

  getSegmentContacts(filters) {
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (filters.listId) { query += ' AND listId = ?'; params.push(filters.listId); }
    if (filters.verificationStatus) { query += ' AND verificationStatus = ?'; params.push(filters.verificationStatus); }
    if (filters.tag) { query += ' AND tags LIKE ?'; params.push(`%${filters.tag}%`); }
    if (filters.hasCompany) { query += " AND company != ''"; }
    if (filters.minBounce !== undefined) { query += ' AND bounceCount >= ?'; params.push(filters.minBounce); }
    if (filters.maxBounce !== undefined) { query += ' AND bounceCount <= ?'; params.push(filters.maxBounce); }
    if (filters.addedAfter) { query += ' AND createdAt >= ?'; params.push(filters.addedAfter); }
    if (filters.addedBefore) { query += ' AND createdAt <= ?'; params.push(filters.addedBefore); }

    query += ' ORDER BY createdAt DESC';
    return this._all(query, params);
  }

  // =================== RETRY QUEUE ===================
  addToRetryQueue(item) {
    const id = item.id || uuidv4();
    const nextRetry = new Date(Date.now() + Math.pow(2, item.attempts || 0) * 60000).toISOString();
    this._run(
      `INSERT OR IGNORE INTO retry_queue (id, campaignId, contactId, email, subject, content, variant, attempts, maxAttempts, lastError, nextRetryAt, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item.campaignId, item.contactId || '', item.email, item.subject || '', item.content || '',
       item.variant || 'A', item.attempts || 0, item.maxAttempts || 3, item.lastError || '', nextRetry, 'pending']
    );
    return id;
  }

  getPendingRetries() {
    const now = new Date().toISOString();
    return this._all("SELECT * FROM retry_queue WHERE status = 'pending' AND nextRetryAt <= ? ORDER BY nextRetryAt ASC LIMIT 50", [now]);
  }

  updateRetryItem(id, updates) {
    if (updates.status === 'completed' || updates.status === 'failed') {
      this._run('UPDATE retry_queue SET status=?, lastError=?, attempts=? WHERE id=?',
        [updates.status, updates.lastError || '', updates.attempts || 0, id]);
    } else {
      const nextRetry = new Date(Date.now() + Math.pow(2, updates.attempts || 0) * 60000).toISOString();
      this._run('UPDATE retry_queue SET attempts=?, lastError=?, nextRetryAt=? WHERE id=?',
        [updates.attempts, updates.lastError || '', nextRetry, id]);
    }
  }

  getRetryQueueStats() {
    const pending = this._get("SELECT COUNT(*) as count FROM retry_queue WHERE status = 'pending'");
    const completed = this._get("SELECT COUNT(*) as count FROM retry_queue WHERE status = 'completed'");
    const failed = this._get("SELECT COUNT(*) as count FROM retry_queue WHERE status = 'failed'");
    return { pending: pending?.count || 0, completed: completed?.count || 0, failed: failed?.count || 0 };
  }

  clearRetryQueue(campaignId) {
    if (campaignId) {
      this._run('DELETE FROM retry_queue WHERE campaignId = ?', [campaignId]);
    } else {
      this._run('DELETE FROM retry_queue');
    }
  }

  // =================== DELIVERABILITY LOG ===================
  logDeliverability(entry) {
    const id = entry.id || uuidv4();
    const existing = this._get('SELECT * FROM deliverability_log WHERE smtpAccountId = ? AND date = ?',
      [entry.smtpAccountId, entry.date]);

    if (existing) {
      this._run(
        `UPDATE deliverability_log SET sent=sent+?, delivered=delivered+?, bounced=bounced+?,
         complained=complained+?, opened=opened+?, clicked=clicked+? WHERE id=?`,
        [entry.sent || 0, entry.delivered || 0, entry.bounced || 0,
         entry.complained || 0, entry.opened || 0, entry.clicked || 0, existing.id]
      );
    } else {
      this._run(
        `INSERT INTO deliverability_log (id, smtpAccountId, date, sent, delivered, bounced, complained, opened, clicked, score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, entry.smtpAccountId, entry.date, entry.sent || 0, entry.delivered || 0,
         entry.bounced || 0, entry.complained || 0, entry.opened || 0, entry.clicked || 0, entry.score || 100]
      );
    }
  }

  getDeliverabilityHistory(smtpAccountId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return this._all(
      'SELECT * FROM deliverability_log WHERE smtpAccountId = ? AND date >= ? ORDER BY date ASC',
      [smtpAccountId, since]
    );
  }

  getDeliverabilityScore(smtpAccountId) {
    const recent = this.getDeliverabilityHistory(smtpAccountId, 7);
    if (recent.length === 0) return 100;
    const totalSent = recent.reduce((s, r) => s + r.sent, 0);
    const totalBounced = recent.reduce((s, r) => s + r.bounced, 0);
    const totalComplained = recent.reduce((s, r) => s + r.complained, 0);
    if (totalSent === 0) return 100;
    const bounceRate = totalBounced / totalSent;
    const complaintRate = totalComplained / totalSent;
    return Math.max(0, Math.round(100 - (bounceRate * 200) - (complaintRate * 500)));
  }

  // =================== BACKUP HISTORY ===================
  addBackupRecord(record) {
    const id = record.id || uuidv4();
    this._run('INSERT INTO backup_history (id, filename, size, type) VALUES (?, ?, ?, ?)',
      [id, record.filename, record.size || 0, record.type || 'manual']);
    return id;
  }

  getBackupHistory() {
    return this._all('SELECT * FROM backup_history ORDER BY createdAt DESC LIMIT 20');
  }

  // =================== GLOBAL SEARCH ===================
  globalSearch(query) {
    const q = `%${query}%`;
    const contacts = this._all(
      "SELECT id, email, firstName, lastName, company, 'contact' as type FROM contacts WHERE email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ? LIMIT 10",
      [q, q, q, q]
    );
    const campaigns = this._all(
      "SELECT id, name, status, 'campaign' as type FROM campaigns WHERE name LIKE ? OR subject LIKE ? LIMIT 10",
      [q, q]
    );
    const templates = this._all(
      "SELECT id, name, category, 'template' as type FROM templates WHERE name LIKE ? OR subject LIKE ? LIMIT 10",
      [q, q]
    );
    return { contacts, campaigns, templates };
  }

  // =================== EXPORT HELPERS ===================
  exportContactsData(contacts) {
    if (!contacts || contacts.length === 0) {
      return this.getAllContacts();
    }
    return contacts;
  }

  close() {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }
    if (this.db) {
      this.flushSave(); // flush any pending debounced write before closing
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = Database;
