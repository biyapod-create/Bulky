const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database dashboard and segment helpers', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-dashboard-'));
    dbPath = path.join(tempDir, 'bulky-dashboard.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns dashboard-ready recent campaigns, activity, and smtp health fields', () => {
    const listId = db.addList({ name: 'Customers' });
    const campaignId = db.addCampaign({
      name: 'Launch',
      subject: 'Hello',
      content: '<p>Hello</p>',
      listId,
      status: 'draft'
    });
    db.updateCampaign({
      ...db.getAllCampaigns().find((campaign) => campaign.id === campaignId),
      status: 'completed',
      totalEmails: 2,
      sentEmails: 2
    });

    db.addCampaignLog({
      campaignId,
      email: 'first@example.com',
      status: 'sent',
      trackingId: 'track-1'
    });
    db.addTrackingEvent({
      campaignId,
      contactId: 'contact-1',
      email: 'first@example.com',
      type: 'open'
    });

    const smtpId = db.addSmtpAccount({
      name: 'Primary SMTP',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'sender@example.com',
      password: 'secret',
      fromName: 'Sender',
      fromEmail: 'sender@example.com',
      dailyLimit: 500,
      isActive: true
    });
    for (let i = 0; i < 12; i += 1) {
      db.incrementSmtpSentCount(smtpId);
    }

    const stats = db.getDashboardStats();

    expect(stats.recentCampaigns[0]).toMatchObject({
      id: campaignId,
      listName: 'Customers',
      sentEmails: 2,
      totalEmails: 2
    });
    expect(stats.recentActivity.length).toBeGreaterThan(0);
    expect(stats.smtpHealth[0]).toMatchObject({
      name: 'Primary SMTP',
      host: 'smtp.example.com',
      sentToday: 12
    });
    expect(typeof stats.smtpHealth[0].health).toBe('number');
  });

  it('filters segment contacts by exact tag membership instead of substring matches', () => {
    const exactTagId = 'tag-1';
    const similarTagId = 'tag-10';

    const exactId = db.addContact({ email: 'exact@example.com', tags: [exactTagId] });
    db.addContact({ email: 'similar@example.com', tags: [similarTagId] });

    const results = db.getSegmentContacts({ tag: exactTagId });

    expect(results.map((contact) => contact.id)).toEqual([exactId]);
  });
});
