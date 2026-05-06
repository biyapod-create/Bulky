const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database schema migrations', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-migrations-'));
    dbPath = path.join(tempDir, 'bulky-legacy.db');
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('upgrades legacy schemas by adding missing columns before normal CRUD runs', async () => {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const legacyDb = new SQL.Database();

    legacyDb.run(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        firstName TEXT DEFAULT '',
        lastName TEXT DEFAULT '',
        company TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        verificationStatus TEXT DEFAULT ''
      );
    `);
    legacyDb.run(`
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT DEFAULT '',
        content TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        listId TEXT DEFAULT ''
      );
    `);
    legacyDb.run(`
      CREATE TABLE campaign_logs (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        contactId TEXT DEFAULT '',
        email TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error TEXT DEFAULT ''
      );
    `);
    legacyDb.run(`
      CREATE TABLE signup_forms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        listId TEXT NOT NULL,
        fields TEXT DEFAULT '[]',
        style TEXT DEFAULT '{}',
        successMessage TEXT DEFAULT 'Thank you!',
        redirectUrl TEXT DEFAULT '',
        isActive INTEGER DEFAULT 1
      );
    `);

    fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    db = new Database(dbPath);
    await db.initialize();

    expect(db._columnExists('contacts', 'tags')).toBe(true);
    expect(db._columnExists('contacts', 'listId')).toBe(true);
    expect(db._columnExists('contacts', 'verificationScore')).toBe(true);
    expect(db._columnExists('contacts', 'verificationDetails')).toBe(true);
    expect(db._columnExists('campaigns', 'resumeData')).toBe(true);
    expect(db._columnExists('campaign_logs', 'variant')).toBe(true);
    expect(db._columnExists('campaign_logs', 'openedAt')).toBe(true);
    expect(db._columnExists('signup_forms', 'doubleOptin')).toBe(true);
    expect(db._columnExists('signup_forms', 'confirmationSubject')).toBe(true);
    expect(db._columnExists('signup_forms', 'confirmationTemplate')).toBe(true);

    const listId = db.addList({ name: 'Migrated List' });
    const contactId = db.addContact({
      email: 'migrated@example.com',
      firstName: 'Legacy',
      lastName: 'User',
      listId,
      tags: ['vip']
    });
    const campaignId = db.addCampaign({
      name: 'Migrated Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      listId,
      status: 'draft'
    });

    db.addCampaignLog({
      campaignId,
      contactId,
      email: 'migrated@example.com',
      status: 'sent',
      variant: 'A',
      trackingId: 'trk-1'
    });

    const migratedContact = db._get('SELECT * FROM contacts WHERE id = ?', [contactId]);
    const logs = db.getCampaignLogs(campaignId);
    const formId = db.addSignupForm({
      name: 'Website Form',
      listId,
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      doubleOptin: true,
      confirmationSubject: 'Confirm me',
      confirmationTemplate: 'Click {{confirmLink}}'
    });
    const migratedForm = db.getSignupForm(formId);

    expect(contactId).toEqual(expect.any(String));
    expect(migratedContact.tags).toBe(JSON.stringify(['vip']));
    expect(logs[0]).toMatchObject({
      variant: 'A',
      trackingId: 'trk-1'
    });
    expect(migratedForm).toMatchObject({
      doubleOptin: 1,
      confirmationSubject: 'Confirm me'
    });
  });
});
