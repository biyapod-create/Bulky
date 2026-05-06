const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const workflowRepository = require('./repositories/workflowRepository');
const growthRepository = require('./repositories/growthRepository');
const aiMemoryRepository = require('./repositories/aiMemoryRepository');
const supportRepository = require('./repositories/supportRepository');
const analyticsRepository = require('./repositories/analyticsRepository');
const contactsRepository = require('./repositories/contactsRepository');

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

  // Debounced save -- batches rapid writes (e.g. per-email campaign logging)
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

  // Public health check -- used by service monitor in main.js
  isOpen() {
    return this.db !== null;
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
      // If query fails due to missing column in ORDER BY, retry without the entire ORDER BY clause
      if (e.message && e.message.includes('no such column') && sql.includes('ORDER BY')) {
        // Strip the entire ORDER BY clause (handles single and multi-column sorts)
        const stripped = sql.replace(/\s+ORDER BY\s+.+$/is, '');
        const stmt2 = this.db.prepare(stripped);
        stmt2.bind(params);
        const results = [];
        while (stmt2.step()) {
          results.push(stmt2.getAsObject());
        }
        stmt2.free();
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
        resumeData TEXT DEFAULT '',
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
        openedAt TEXT DEFAULT NULL,
        clickedAt TEXT DEFAULT NULL,
        error TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tracking_events (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT DEFAULT '',
        trackingId TEXT DEFAULT '',
        cloudEventId TEXT DEFAULT '',
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

      // Automation workflows (Phase 1)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS automations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT DEFAULT 'draft',
          triggerType TEXT NOT NULL,
          triggerConfig TEXT DEFAULT '{}',
          nodes TEXT DEFAULT '[]',
          edges TEXT DEFAULT '[]',
          isActive INTEGER DEFAULT 0,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Seed accounts for inbox placement testing
      this.db.run(`
        CREATE TABLE IF NOT EXISTS seed_accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          email TEXT NOT NULL,
          imapHost TEXT DEFAULT '',
          imapPort INTEGER DEFAULT 993,
          imapUser TEXT DEFAULT '',
          imapPassword TEXT DEFAULT '',
          folder TEXT DEFAULT 'INBOX',
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Automation execution logs
      this.db.run(`
        CREATE TABLE IF NOT EXISTS automation_logs (
          id TEXT PRIMARY KEY,
          automationId TEXT NOT NULL,
          contactId TEXT DEFAULT '',
          email TEXT DEFAULT '',
          nodeId TEXT DEFAULT '',
          action TEXT DEFAULT '',
          status TEXT DEFAULT 'success',
          error TEXT DEFAULT '',
          createdAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Drip sequences (Phase 1)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS drip_sequences (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          campaignId TEXT NOT NULL,
          steps TEXT DEFAULT '[]',
          status TEXT DEFAULT 'draft',
          isActive INTEGER DEFAULT 0,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Signup forms for embeddable forms (Phase 1)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS signup_forms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          listId TEXT NOT NULL,
          fields TEXT DEFAULT '[]',
          style TEXT DEFAULT '{}',
          successMessage TEXT DEFAULT 'Thank you for subscribing!',
          redirectUrl TEXT DEFAULT '',
          isActive INTEGER DEFAULT 1,
          doubleOptin INTEGER DEFAULT 0,
          confirmationSubject TEXT DEFAULT 'Please confirm your subscription',
          confirmationTemplate TEXT DEFAULT 'Click the link below to confirm your subscription: {{confirmLink}}',
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Form submissions
      this.db.run(`
        CREATE TABLE IF NOT EXISTS form_submissions (
          id TEXT PRIMARY KEY,
          formId TEXT NOT NULL,
          contactId TEXT DEFAULT '',
          email TEXT NOT NULL,
          data TEXT DEFAULT '{}',
          status TEXT DEFAULT 'pending',
          confirmedAt TEXT DEFAULT '',
          createdAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // AI assistant memories / notes
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_memories (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // A/B tests
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ab_tests (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          campaignId TEXT NOT NULL,
          variants TEXT DEFAULT '[]',
          status TEXT DEFAULT 'draft',
          winner TEXT DEFAULT '',
          confidence REAL DEFAULT 0,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // Drip queue — per-contact step schedule for drip sequences
      this.db.run(`
        CREATE TABLE IF NOT EXISTS drip_queue (
          id TEXT PRIMARY KEY,
          sequenceId TEXT NOT NULL,
          contactId TEXT DEFAULT '',
          email TEXT NOT NULL,
          stepIndex INTEGER DEFAULT 0,
          subject TEXT DEFAULT '',
          runAt TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          error TEXT DEFAULT '',
          createdAt TEXT DEFAULT (datetime('now'))
        )
      `);

      const migrations = [
      { table: 'contacts', column: 'customField1', sql: "ALTER TABLE contacts ADD COLUMN customField1 TEXT DEFAULT ''" },
      { table: 'contacts', column: 'customField2', sql: "ALTER TABLE contacts ADD COLUMN customField2 TEXT DEFAULT ''" },
      { table: 'contacts', column: 'tags', sql: "ALTER TABLE contacts ADD COLUMN tags TEXT DEFAULT '[]'" },
      { table: 'contacts', column: 'listId', sql: "ALTER TABLE contacts ADD COLUMN listId TEXT DEFAULT ''" },
      { table: 'contacts', column: 'updatedAt', sql: "ALTER TABLE contacts ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },
      { table: 'contacts', column: 'status', sql: "ALTER TABLE contacts ADD COLUMN status TEXT DEFAULT 'active'" },
      { table: 'contacts', column: 'verificationScore', sql: "ALTER TABLE contacts ADD COLUMN verificationScore INTEGER DEFAULT 0" },
      { table: 'contacts', column: 'verificationDetails', sql: "ALTER TABLE contacts ADD COLUMN verificationDetails TEXT DEFAULT '{}'" },
      { table: 'contacts', column: 'bounceCount', sql: "ALTER TABLE contacts ADD COLUMN bounceCount INTEGER DEFAULT 0" },
      { table: 'contacts', column: 'lastBounceReason', sql: "ALTER TABLE contacts ADD COLUMN lastBounceReason TEXT DEFAULT ''" },

      // campaigns table
      { table: 'campaigns', column: 'subjectB', sql: "ALTER TABLE campaigns ADD COLUMN subjectB TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'contentB', sql: "ALTER TABLE campaigns ADD COLUMN contentB TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'isABTest', sql: "ALTER TABLE campaigns ADD COLUMN isABTest INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'abTestPercent', sql: "ALTER TABLE campaigns ADD COLUMN abTestPercent INTEGER DEFAULT 10" },
      { table: 'campaigns', column: 'tagFilter', sql: "ALTER TABLE campaigns ADD COLUMN tagFilter TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'manualEmails', sql: "ALTER TABLE campaigns ADD COLUMN manualEmails TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'verificationFilter', sql: "ALTER TABLE campaigns ADD COLUMN verificationFilter TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'smtpAccountId', sql: "ALTER TABLE campaigns ADD COLUMN smtpAccountId TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'batchSize', sql: "ALTER TABLE campaigns ADD COLUMN batchSize INTEGER DEFAULT 50" },
      { table: 'campaigns', column: 'delayMinutes', sql: "ALTER TABLE campaigns ADD COLUMN delayMinutes INTEGER DEFAULT 10" },
      { table: 'campaigns', column: 'delayBetweenEmails', sql: "ALTER TABLE campaigns ADD COLUMN delayBetweenEmails INTEGER DEFAULT 2000" },
      { table: 'campaigns', column: 'maxRetries', sql: "ALTER TABLE campaigns ADD COLUMN maxRetries INTEGER DEFAULT 3" },
      { table: 'campaigns', column: 'totalEmails', sql: "ALTER TABLE campaigns ADD COLUMN totalEmails INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'sentEmails', sql: "ALTER TABLE campaigns ADD COLUMN sentEmails INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'failedEmails', sql: "ALTER TABLE campaigns ADD COLUMN failedEmails INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'bouncedEmails', sql: "ALTER TABLE campaigns ADD COLUMN bouncedEmails INTEGER DEFAULT 0" },
      { table: 'campaigns', column: 'scheduledAt', sql: "ALTER TABLE campaigns ADD COLUMN scheduledAt TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'startedAt', sql: "ALTER TABLE campaigns ADD COLUMN startedAt TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'completedAt', sql: "ALTER TABLE campaigns ADD COLUMN completedAt TEXT DEFAULT ''" },
      { table: 'campaigns', column: 'updatedAt', sql: "ALTER TABLE campaigns ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },

      // campaign_logs table
      { table: 'campaign_logs', column: 'variant', sql: "ALTER TABLE campaign_logs ADD COLUMN variant TEXT DEFAULT 'A'" },
      { table: 'campaign_logs', column: 'smtpCode', sql: "ALTER TABLE campaign_logs ADD COLUMN smtpCode INTEGER DEFAULT NULL" },
      { table: 'campaign_logs', column: 'smtpResponse', sql: "ALTER TABLE campaign_logs ADD COLUMN smtpResponse TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'failureType', sql: "ALTER TABLE campaign_logs ADD COLUMN failureType TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'failureReason', sql: "ALTER TABLE campaign_logs ADD COLUMN failureReason TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'trackingId', sql: "ALTER TABLE campaign_logs ADD COLUMN trackingId TEXT DEFAULT ''" },
      { table: 'campaign_logs', column: 'openedAt', sql: "ALTER TABLE campaign_logs ADD COLUMN openedAt TEXT DEFAULT NULL" },
      { table: 'campaign_logs', column: 'clickedAt', sql: "ALTER TABLE campaign_logs ADD COLUMN clickedAt TEXT DEFAULT NULL" },

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
      { table: 'tracking_events', column: 'trackingId', sql: "ALTER TABLE tracking_events ADD COLUMN trackingId TEXT DEFAULT ''" },
      { table: 'tracking_events', column: 'cloudEventId', sql: "ALTER TABLE tracking_events ADD COLUMN cloudEventId TEXT DEFAULT ''" },
      { table: 'signup_forms', column: 'doubleOptin', sql: "ALTER TABLE signup_forms ADD COLUMN doubleOptin INTEGER DEFAULT 0" },
      { table: 'signup_forms', column: 'confirmationSubject', sql: "ALTER TABLE signup_forms ADD COLUMN confirmationSubject TEXT DEFAULT 'Please confirm your subscription'" },
      { table: 'signup_forms', column: 'confirmationTemplate', sql: "ALTER TABLE signup_forms ADD COLUMN confirmationTemplate TEXT DEFAULT 'Click the link below to confirm your subscription: {{confirmLink}}'" },

      // drip_queue retry support
      { table: 'drip_queue', column: 'attempts', sql: "ALTER TABLE drip_queue ADD COLUMN attempts INTEGER DEFAULT 0" },
      { table: 'drip_queue', column: 'updatedAt', sql: "ALTER TABLE drip_queue ADD COLUMN updatedAt TEXT DEFAULT (datetime('now'))" },
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
      'CREATE INDEX IF NOT EXISTS idx_drip_queue_runAt ON drip_queue(status, runAt)',
      'CREATE INDEX IF NOT EXISTS idx_drip_queue_sequence ON drip_queue(sequenceId, contactId)',
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
    return contactsRepository.getAllContacts(this);
  }

  _normalizeTagFilter(rawTags) {
    if (Array.isArray(rawTags)) {
      return rawTags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }
    if (typeof rawTags === 'string' && rawTags.trim()) {
      try {
        const parsed = JSON.parse(rawTags);
        if (Array.isArray(parsed)) {
          return parsed.map((tag) => String(tag || '').trim()).filter(Boolean);
        }
      } catch {}
      return [rawTags.trim()];
    }
    return [];
  }

  _getTagLookupMaps() {
    const tags = this.getAllTags();
    const byId = new Map();
    const idByName = new Map();

    for (const tag of tags) {
      const id = String(tag?.id || '').trim();
      const name = String(tag?.name || '').trim();
      if (!id) continue;
      byId.set(id, tag);
      if (name) {
        idByName.set(name.toLowerCase(), id);
      }
    }

    return { byId, idByName };
  }

  _normalizeStoredContactTags(rawTags) {
    const inputTags = this._normalizeTagFilter(rawTags);
    if (inputTags.length === 0) return [];

    const { byId, idByName } = this._getTagLookupMaps();
    const normalized = [];

    for (const rawTag of inputTags) {
      const candidate = String(rawTag || '').trim();
      if (!candidate) continue;
      if (byId.has(candidate)) {
        normalized.push(candidate);
        continue;
      }

      const resolvedId = idByName.get(candidate.toLowerCase());
      normalized.push(resolvedId || candidate);
    }

    return [...new Set(normalized)];
  }

  _contactHasAnyTag(contact, rawTags) {
    const tagsToMatch = this._normalizeStoredContactTags(rawTags);
    if (tagsToMatch.length === 0) return true;

    const storedTags = this._normalizeStoredContactTags(contact?.tags);

    return tagsToMatch.some((tag) => storedTags.includes(tag));
  }

  _filterContactsByTags(contacts, rawTags) {
    const tagsToMatch = this._normalizeTagFilter(rawTags);
    if (tagsToMatch.length === 0) return contacts;
    return contacts.filter((contact) => this._contactHasAnyTag(contact, tagsToMatch));
  }

  getFilteredContacts(filter) {
    return contactsRepository.getFilteredContacts(this, filter);
  }

  getContactsPage(params) {
    return contactsRepository.getContactsPage(this, params);
  }

  getContactStats() {
    return contactsRepository.getContactStats(this);
  }

  // Validate email format
  _isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return emailRegex.test(email.trim());
  }

  addContact(contact) {
    return contactsRepository.addContact(this, contact);
  }

  addBulkContacts(contacts) {
    return contactsRepository.addBulkContacts(this, contacts);
  }

  updateContact(contact) {
    contactsRepository.updateContact(this, contact);
  }

  deleteContacts(ids) {
    contactsRepository.deleteContacts(this, ids);
  }

  deleteContactsByVerification(status) {
    contactsRepository.deleteContactsByVerification(this, status);
  }

  // =================== CONTACT-LIST ASSIGNMENT ===================
  addContactToList(contactId, listId) {
    contactsRepository.addContactToList(this, contactId, listId);
  }

  removeContactFromList(contactId, listId) {
    contactsRepository.removeContactFromList(this, contactId, listId);
  }

  getContactLists(contactId) {
    return contactsRepository.getContactLists(this, contactId);
  }

  // =================== CONTACT TAG METHODS ===================
  addTagToContact(contactId, tagName) {
    contactsRepository.addTagToContact(this, contactId, tagName);
  }

  removeTagFromContact(contactId, tagName) {
    contactsRepository.removeTagFromContact(this, contactId, tagName);
  }

  getContactTags(contactId) {
    return contactsRepository.getContactTags(this, contactId);
  }

  getContactDetail(contactId) {
    return contactsRepository.getContactDetail(this, contactId);
  }

  getRecipientCount(filter) {
    return contactsRepository.getRecipientCount(this, filter);
  }

  getContactsForCampaign(filter) {
    return contactsRepository.getContactsForCampaign(this, filter);
  }

  incrementContactBounce(contactId, reason) {
    contactsRepository.incrementContactBounce(this, contactId, reason);
  }

  // =================== LISTS ===================
  getAllLists() {
    return contactsRepository.getAllLists(this);
  }

  getList(id) {
    return contactsRepository.getList(this, id);
  }

  addList(list) {
    return contactsRepository.addList(this, list);
  }

  updateList(list) {
    contactsRepository.updateList(this, list);
  }

  deleteList(id) {
    contactsRepository.deleteList(this, id);
  }

  getListContacts(listId) {
    return contactsRepository.getListContacts(this, listId);
  }

  // =================== TAGS ===================
  getAllTags() {
    return contactsRepository.getAllTags(this);
  }

  addTag(tag) {
    return contactsRepository.addTag(this, tag);
  }

  deleteTag(id) {
    contactsRepository.deleteTag(this, id);
  }

  // =================== BLACKLIST ===================
  getAllBlacklist() {
    return contactsRepository.getAllBlacklist(this);
  }

  addToBlacklist(entry) {
    return contactsRepository.addToBlacklist(this, entry);
  }

  addBulkToBlacklist(entries) {
    return contactsRepository.addBulkToBlacklist(this, entries);
  }

  removeFromBlacklist(id) {
    contactsRepository.removeFromBlacklist(this, id);
  }

  isBlacklisted(email) {
    return contactsRepository.isBlacklisted(this, email);
  }

  // Returns a Set of all blacklisted emails and domain patterns for in-memory batch checks.
  getBlacklistSet() {
    const rows = this._all('SELECT email FROM blacklist');
    return new Set(rows.map((r) => String(r.email || '').toLowerCase()));
  }

  // Returns a Set of all unsubscribed emails for in-memory batch checks.
  getUnsubscribeSet() {
    const rows = this._all('SELECT email FROM unsubscribes');
    return new Set(rows.map((r) => String(r.email || '').toLowerCase()));
  }

  // Auto-blacklist contacts that hard bounced 2+ times
  autoBlacklistBounced() {
    return contactsRepository.autoBlacklistBounced(this);
  }

  // =================== UNSUBSCRIBES ===================
  getAllUnsubscribes() {
    return contactsRepository.getAllUnsubscribes(this);
  }

  addUnsubscribe(email, campaignId, reason) {
    contactsRepository.addUnsubscribe(this, email, campaignId, reason);
  }

  removeUnsubscribe(email) {
    contactsRepository.removeUnsubscribe(this, email);
  }

  isUnsubscribed(email) {
    return contactsRepository.isUnsubscribed(this, email);
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
    this._resetDailyCounts();
    return this._all('SELECT * FROM smtp_accounts ORDER BY isDefault DESC, createdAt DESC');
  }

  getActiveSmtpAccounts() {
    // Reset daily counts if the date has changed
    this._resetDailyCounts();
    return this._all('SELECT * FROM smtp_accounts WHERE isActive = 1 ORDER BY isDefault DESC, createdAt DESC');
  }

  getPrimarySmtpAccount(activeOnly = false) {
    this._resetDailyCounts();
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
    const today = new Date().toISOString().split('T')[0];
    this._run(
      `UPDATE smtp_accounts
       SET sentToday = CASE WHEN lastResetDate = ? THEN sentToday + 1 ELSE 1 END,
           lastResetDate = ?
       WHERE id = ?`,
      [today, today, accountId]
    );
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
    return analyticsRepository.getCampaignAnalytics(this, campaignId);
  }

  // =================== TRACKING EVENTS ===================
  getTrackingEvents(campaignId) {
    return supportRepository.getTrackingEvents(this, campaignId);
  }

  addTrackingEvent(event) {
    supportRepository.addTrackingEvent(this, event);
  }

  // =================== SPAM REPLACEMENTS ===================
  getAllSpamReplacements() {
    return supportRepository.getAllSpamReplacements(this);
  }

  addSpamReplacement(item) {
    return supportRepository.addSpamReplacement(this, item);
  }

  updateSpamReplacement(item) {
    supportRepository.updateSpamReplacement(this, item);
  }

  deleteSpamReplacement(id) {
    supportRepository.deleteSpamReplacement(this, id);
  }

  // =================== SETTINGS ===================
  getSetting(key) {
    return supportRepository.getSetting(this, key);
  }

  setSetting(key, value) {
    supportRepository.setSetting(this, key, value);
  }

  getAllSettings() {
    return supportRepository.getAllSettings(this);
  }

  saveAllSettings(settings) {
    supportRepository.saveAllSettings(this, settings);
  }

  // =================== WARMUP SCHEDULES ===================
  getWarmupSchedules() {
    return supportRepository.getWarmupSchedules(this);
  }

  createWarmupSchedule(schedule) {
    return supportRepository.createWarmupSchedule(this, schedule);
  }

  updateWarmupSchedule(schedule) {
    supportRepository.updateWarmupSchedule(this, schedule);
  }

  deleteWarmupSchedule(id) {
    supportRepository.deleteWarmupSchedule(this, id);
  }

  // =================== DASHBOARD STATS ===================
  getDashboardStats() {
    return analyticsRepository.getDashboardStats(this);
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
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.db.close();
    this.db = new this.SQL.Database(fileBuffer);
    this._createTables();
    this._checkIntegrity();
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
    if (filters.hasCompany) { query += " AND company != ''"; }
    if (filters.minBounce !== undefined) { query += ' AND bounceCount >= ?'; params.push(filters.minBounce); }
    if (filters.maxBounce !== undefined) { query += ' AND bounceCount <= ?'; params.push(filters.maxBounce); }
    if (filters.addedAfter) { query += ' AND createdAt >= ?'; params.push(filters.addedAfter); }
    if (filters.addedBefore) { query += ' AND createdAt <= ?'; params.push(filters.addedBefore); }

    query += ' ORDER BY createdAt DESC';
    return this._filterContactsByTags(this._all(query, params), filters.tag);
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
    return supportRepository.addBackupRecord(this, record);
  }

  getBackupHistory() {
    return supportRepository.getBackupHistory(this);
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

  // =================== AUTOMATIONS (Phase 1) ===================
  getAllAutomations() {
    return workflowRepository.getAllAutomations(this);
  }

  getAutomation(id) {
    return workflowRepository.getAutomation(this, id);
  }

  addAutomation(automation) {
    return workflowRepository.addAutomation(this, automation);
  }

  updateAutomation(automation) {
    workflowRepository.updateAutomation(this, automation);
  }

  deleteAutomation(id) {
    workflowRepository.deleteAutomation(this, id);
  }

  // =================== AUTOMATION LOGS ===================
  getAutomationLogs(automationId) {
    return workflowRepository.getAutomationLogs(this, automationId);
  }

  addAutomationLog(log) {
    return workflowRepository.addAutomationLog(this, log);
  }

  // =================== DRIP SEQUENCES (Phase 1) ===================
  getAllDripSequences() {
    return workflowRepository.getAllDripSequences(this);
  }

  getDripSequence(id) {
    return workflowRepository.getDripSequence(this, id);
  }

  addDripSequence(sequence) {
    return workflowRepository.addDripSequence(this, sequence);
  }

  updateDripSequence(sequence) {
    workflowRepository.updateDripSequence(this, sequence);
  }

  deleteDripSequence(id) {
    workflowRepository.deleteDripSequence(this, id);
    // Clean up any pending queue entries for this sequence
    this._run("DELETE FROM drip_queue WHERE sequenceId = ? AND status = 'pending'", [id]);
  }

  // =================== DRIP QUEUE ===================
  addDripQueueItem(item) {
    const { v4: uuidv4 } = require('uuid');
    const id = item.id || uuidv4();
    this._run(
      `INSERT INTO drip_queue (id, sequenceId, contactId, email, stepIndex, subject, runAt, status, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item.sequenceId, item.contactId || '', item.email,
       item.stepIndex || 0, item.subject || '', item.runAt, item.status || 'pending', 0]
    );
    return id;
  }

  getDueDripItems() {
    const now = new Date().toISOString();
    // Recover items stuck in 'running' for more than 10 minutes (crash recovery)
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    this._run(
      "UPDATE drip_queue SET status = 'pending' WHERE status = 'running' AND updatedAt < ?",
      [stuckCutoff]
    );
    // Pick up pending items and failed items with < 3 attempts (retry)
    return this._all(
      `SELECT * FROM drip_queue
       WHERE (status = 'pending' AND runAt <= ?)
          OR (status = 'failed' AND attempts < 3 AND runAt <= ?)
       ORDER BY runAt ASC LIMIT 50`,
      [now, now]
    );
  }

  updateDripQueueItem(id, updates) {
    if (updates.status === 'completed' || updates.status === 'skipped') {
      this._run(
        "UPDATE drip_queue SET status = ?, error = ?, updatedAt = datetime('now') WHERE id = ?",
        [updates.status, updates.error || '', id]
      );
    } else if (updates.status === 'failed') {
      this._run(
        "UPDATE drip_queue SET status = 'failed', error = ?, attempts = attempts + 1, updatedAt = datetime('now') WHERE id = ?",
        [updates.error || '', id]
      );
    } else if (updates.status === 'running') {
      this._run(
        "UPDATE drip_queue SET status = 'running', updatedAt = datetime('now') WHERE id = ?",
        [id]
      );
    }
  }

  getDripQueueStats() {
    const pending   = this._get("SELECT COUNT(*) as count FROM drip_queue WHERE status = 'pending'");
    const running   = this._get("SELECT COUNT(*) as count FROM drip_queue WHERE status = 'running'");
    const completed = this._get("SELECT COUNT(*) as count FROM drip_queue WHERE status = 'completed'");
    const failed    = this._get("SELECT COUNT(*) as count FROM drip_queue WHERE status = 'failed'");
    return {
      pending:   pending?.count   || 0,
      running:   running?.count   || 0,
      completed: completed?.count || 0,
      failed:    failed?.count    || 0
    };
  }

  // =================== SIGNUP FORMS (Phase 1) ===================
  getAllSignupForms() {
    return growthRepository.getAllSignupForms(this);
  }

  getSignupForm(id) {
    return growthRepository.getSignupForm(this, id);
  }

  addSignupForm(form) {
    return growthRepository.addSignupForm(this, form);
  }

  updateSignupForm(form) {
    growthRepository.updateSignupForm(this, form);
  }

  deleteSignupForm(id) {
    growthRepository.deleteSignupForm(this, id);
  }

  // =================== FORM SUBMISSIONS ===================
  getFormSubmissions(formId) {
    return growthRepository.getFormSubmissions(this, formId);
  }

  addFormSubmission(submission) {
    return growthRepository.addFormSubmission(this, submission);
  }

  confirmFormSubmission(id) {
    growthRepository.confirmFormSubmission(this, id);
  }

  // =================== A/B TESTS (Phase 1) ===================
  getAllABTests() {
    return growthRepository.getAllABTests(this);
  }

  getABTest(id) {
    return growthRepository.getABTest(this, id);
  }

  addABTest(test) {
    return growthRepository.addABTest(this, test);
  }

  updateABTest(test) {
    growthRepository.updateABTest(this, test);
  }

  deleteABTest(id) {
    growthRepository.deleteABTest(this, id);
  }

  // Calculate A/B test statistical significance
  calculateABSignificance(campaignId) {
    return growthRepository.calculateABSignificance(this, campaignId);
  }

  // =================== SEED ACCOUNTS (Inbox Placement Testing) ===================
  getAllSeedAccounts() {
    return growthRepository.getAllSeedAccounts(this);
  }

  getSeedAccount(id) {
    return growthRepository.getSeedAccount(this, id);
  }

  addSeedAccount(account) {
    return growthRepository.addSeedAccount(this, account);
  }

  updateSeedAccount(account) {
    growthRepository.updateSeedAccount(this, account);
  }

  deleteSeedAccount(id) {
    growthRepository.deleteSeedAccount(this, id);
  }

  getActiveSeedAccounts() {
    return growthRepository.getActiveSeedAccounts(this);
  }

  // ─── AI Memories ───────────────────────────────────────────────────────────
  getAIMemory(key) {
    return aiMemoryRepository.getAIMemory(this, key);
  }

  setAIMemory(key, value) {
    aiMemoryRepository.setAIMemory(this, key, value);
  }

  getAllAIMemories() {
    return aiMemoryRepository.getAllAIMemories(this);
  }

  deleteAIMemory(key) {
    aiMemoryRepository.deleteAIMemory(this, key);
  }

  // ─── AI Tool Helpers ─────────────────────────────────────────────────────
  getUnverifiedContacts(limit = 50) {
    return contactsRepository.getUnverifiedContacts(this, limit);
  }

  getContactsNeedingVerificationCount() {
    return contactsRepository.getContactsNeedingVerificationCount(this);
  }

  // Quick deliverability health snapshot for AI
  getDeliverabilitySnapshot() {
    return analyticsRepository.getDeliverabilitySnapshot(this);
  }

  // =================== ENGAGEMENT ANALYTICS ===================
  getInstallDate() {
    return analyticsRepository.getInstallDate(this);
  }

  getEngagementAnalytics(dateFrom, dateTo) {
    return analyticsRepository.getEngagementAnalytics(this, dateFrom, dateTo);
  }

  // =================== AI MEMORIES ===================
  saveMemory(key, value) {
    aiMemoryRepository.saveMemory(this, key, value);
  }

  getMemory(key) {
    return aiMemoryRepository.getMemory(this, key);
  }

  getAllMemories() {
    return aiMemoryRepository.getAllMemories(this);
  }

  deleteMemory(key) {
    aiMemoryRepository.deleteMemory(this, key);
  }


  // ── Contact engagement scoring ─────────────────────────────────────────
  updateContactEngagement(contactId) {
    return contactsRepository.updateContactEngagement(this, contactId);
  }

  getContactsByEngagement(minScore, maxScore) {
    return contactsRepository.getContactsByEngagement(this, minScore, maxScore);
  }

  getTopEngagedContacts(limit) {
    return contactsRepository.getTopEngagedContacts(this, limit);
  }

  getColdContacts(daysInactive) {
    return contactsRepository.getColdContacts(this, daysInactive);
  }

  archiveInactiveContacts(daysInactive) {
    return contactsRepository.archiveInactiveContacts(this, daysInactive);
  }

  createReengagementSequence(name, daysInactive, campaignId) {
    return contactsRepository.createReengagementSequence(this, name, daysInactive, campaignId);
  }

  detectColdIP(smtpAccountId) {
    const accounts = this.getAllSmtpAccounts();
    const account = accounts.find(a => a.id === smtpAccountId);
    if (!account) return { error: 'Account not found' };
    const last = this._get("SELECT MAX(createdAt) AS t FROM campaign_logs")?.t;
    const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 999;
    return { isCold: daysSince > 30, daysSinceLastSend: daysSince };
  }

  getWarmupProgress(smtpAccountId) {
    const accounts = this.getAllSmtpAccounts();
    const account = accounts.find(a => a.id === smtpAccountId);
    if (!account) return { error: 'Account not found' };
    const startMs = account.warmUpStartDate ? Date.parse(account.warmUpStartDate) : 0;
    const daysSince = startMs > 0 ? Math.floor((Date.now() - startMs) / 86400000) : 0;
    const steps = [50, 100, 200, 400];
    const stepIdx = Math.min(Math.floor(daysSince / 7), steps.length - 1);
    const currentLimit = daysSince >= steps.length * 7 ? (account.dailyLimit || 500) : steps[stepIdx];
    return { daysSince, currentLimit, dailyLimit: account.dailyLimit || 500, stepIndex: stepIdx };
  }

  enforceWarmupLimit(smtpAccountId) {
    const progress = this.getWarmupProgress(smtpAccountId);
    if (progress.error) return progress;
    this._run("UPDATE smtp_accounts SET dailyLimit=? WHERE id=? AND warmUpEnabled=1", [progress.currentLimit, smtpAccountId]);
    return { success: true, enforcedLimit: progress.currentLimit };
  }

  calculateIPReputation(smtpAccountId) {
    const sent    = this._get("SELECT COUNT(*) AS c FROM campaign_logs")?.c || 0;
    const bounced = this._get("SELECT COUNT(*) AS c FROM campaign_logs WHERE status IN ('bounced','hard_bounce')")?.c || 0;
    const bounceRate = sent > 0 ? bounced / sent : 0;
    return { sent, bounced, bounceRate: parseFloat((bounceRate * 100).toFixed(2)), score: Math.max(0, Math.round(100 - bounceRate * 200)) };
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
