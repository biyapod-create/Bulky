const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database blacklist domain support', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-blacklist-'));
    dbPath = path.join(tempDir, 'bulky-blacklist.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('treats stored domain entries as blacklist matches for all addresses on that domain', () => {
    db.addToBlacklist({
      domain: 'example.com',
      reason: 'Blocked domain',
      source: 'manual'
    });

    const entries = db.getAllBlacklist();

    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe('');
    expect(entries[0].domain).toBe('example.com');
    expect(db.isBlacklisted('alice@example.com')).toBe(true);
    expect(db.isBlacklisted('bob@another.com')).toBe(false);
  });
});
