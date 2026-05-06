const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database contact lists and tags', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-contacts-'));
    dbPath = path.join(tempDir, 'bulky-contacts.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate list and tag names case-insensitively', () => {
    expect(db.addList({ name: 'Leads' })).toEqual(expect.any(String));
    expect(db.addList({ name: ' leads ' })).toEqual({ error: 'List name already exists' });

    expect(db.addTag({ name: 'VIP', color: '#ff0000' })).toEqual(expect.any(String));
    expect(db.addTag({ name: 'vip', color: '#00ff00' })).toEqual({ error: 'Tag already exists' });
  });

  it('removes deleted tag references from stored contacts', () => {
    const tagId = db.addTag({ name: 'Newsletter', color: '#5bb4d4' });
    const contactId = db.addContact({
      email: 'hello@example.com',
      firstName: 'Hello',
      tags: [tagId]
    });

    db.deleteTag(tagId);

    const stored = db.getAllContacts().find((contact) => contact.id === contactId);
    expect(JSON.parse(stored.tags || '[]')).toEqual([]);
    expect(db.getFilteredContacts({ tag: tagId })).toEqual([]);
  });

  it('returns a duplicate error instead of silently ignoring existing contacts', () => {
    expect(db.addContact({ email: 'team@example.com' })).toEqual(expect.any(String));
    expect(db.addContact({ email: 'TEAM@example.com' })).toEqual({
      error: 'Contact already exists',
      email: 'team@example.com'
    });
  });

  it('normalizes legacy tag names so filtering still works by tag id', () => {
    const vipTagId = db.addTag({ name: 'VIP', color: '#ff0000' });
    const contactId = db.addContact({
      email: 'vip@example.com',
      tags: ['VIP']
    });

    const filtered = db.getFilteredContacts({ tag: vipTagId });
    const stored = db.getAllContacts().find((contact) => contact.id === contactId);

    expect(filtered.map((contact) => contact.id)).toEqual([contactId]);
    expect(JSON.parse(stored.tags || '[]')).toEqual([vipTagId]);
  });

  it('returns contact detail history from sends, opens, clicks, and unsubscribes', () => {
    const contactId = db.addContact({ email: 'history@example.com', firstName: 'History' });
    const campaignId = db.addCampaign({
      name: 'History Campaign',
      subject: 'Hi',
      content: '<p>Hi</p>',
      status: 'completed'
    });

    db.addCampaignLog({
      campaignId,
      contactId,
      email: 'history@example.com',
      status: 'sent',
      trackingId: 'track-history'
    });
    db.addTrackingEvent({
      campaignId,
      contactId,
      email: 'history@example.com',
      type: 'open'
    });
    db.addTrackingEvent({
      campaignId,
      contactId,
      email: 'history@example.com',
      type: 'click',
      link: 'https://example.com'
    });
    db.addUnsubscribe('history@example.com', campaignId, 'No longer interested');

    const detail = db.getContactDetail(contactId);
    const historyTypes = detail.history.map((entry) => entry.type);

    expect(detail.email).toBe('history@example.com');
    expect(historyTypes).toEqual(expect.arrayContaining(['sent', 'open', 'click', 'unsubscribe']));
  });

  it('treats only unverified contacts as needing verification', () => {
    db.addContact({ email: 'valid@example.com', verificationStatus: 'valid' });
    db.addContact({ email: 'risky@example.com', verificationStatus: 'risky' });
    db.addContact({ email: 'pending@example.com', verificationStatus: 'unverified' });

    const queue = db.getUnverifiedContacts(10);
    const count = db.getContactsNeedingVerificationCount();

    expect(queue.map((contact) => contact.email)).toEqual(['pending@example.com']);
    expect(count).toBe(1);
  });
});
