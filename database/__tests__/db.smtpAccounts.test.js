const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

function createAccount(overrides = {}) {
  return {
    name: 'SMTP Account',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'sender@example.com',
    password: 'secret',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    dailyLimit: 500,
    isActive: true,
    ...overrides
  };
}

describe('Database SMTP account defaults', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-test-'));
    dbPath = path.join(tempDir, 'bulky-test.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should make the first SMTP account default automatically', () => {
    const accountId = db.addSmtpAccount(createAccount());
    const primary = db.getPrimarySmtpAccount();

    expect(primary.id).toBe(accountId);
    expect(primary.isDefault).toBe(1);
  });

  it('should move the default flag when a different account is saved as default', () => {
    const firstId = db.addSmtpAccount(createAccount({
      name: 'First',
      username: 'first@example.com',
      fromEmail: 'first@example.com'
    }));
    const secondId = db.addSmtpAccount(createAccount({
      name: 'Second',
      username: 'second@example.com',
      fromEmail: 'second@example.com',
      isDefault: true
    }));

    const accounts = db.getAllSmtpAccounts();
    const defaults = accounts.filter((account) => account.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(secondId);
    expect(accounts[0].id).toBe(secondId);
    expect(accounts.find((account) => account.id === firstId).isDefault).toBe(0);
  });

  it('should promote another account when the default account is deleted', () => {
    const firstId = db.addSmtpAccount(createAccount({
      name: 'First',
      username: 'first@example.com',
      fromEmail: 'first@example.com'
    }));
    const secondId = db.addSmtpAccount(createAccount({
      name: 'Second',
      username: 'second@example.com',
      fromEmail: 'second@example.com'
    }));

    db.deleteSmtpAccount(firstId);

    const primary = db.getPrimarySmtpAccount();
    expect(primary.id).toBe(secondId);
    expect(primary.isDefault).toBe(1);
  });
});
