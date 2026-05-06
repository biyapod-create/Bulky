const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database analytics repository delegation', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-analytics-'));
    dbPath = path.join(tempDir, 'bulky-analytics.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('computes campaign analytics with bot filtering and A/B rollups preserved', () => {
    const campaignId = db.addCampaign({
      name: 'A/B Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      status: 'completed',
      isABTest: true
    });

    db.addCampaignLog({
      campaignId,
      contactId: 'contact-a',
      email: 'a@example.com',
      status: 'sent',
      variant: 'A'
    });
    db.addCampaignLog({
      campaignId,
      contactId: 'contact-b',
      email: 'b@example.com',
      status: 'sent',
      variant: 'B'
    });
    db.addCampaignLog({
      campaignId,
      contactId: 'contact-c',
      email: 'c@example.com',
      status: 'soft_bounce',
      variant: 'A'
    });

    db._run(
      "UPDATE campaign_logs SET openedAt = ?, clickedAt = ? WHERE campaignId = ? AND contactId = ?",
      ['2026-04-20T09:00:00.000Z', '2026-04-20T09:05:00.000Z', campaignId, 'contact-a']
    );
    db._run(
      "UPDATE campaign_logs SET openedAt = ? WHERE campaignId = ? AND contactId = ?",
      ['2026-04-20T10:00:00.000Z', campaignId, 'contact-b']
    );

    db.addTrackingEvent({
      campaignId,
      contactId: 'contact-a',
      email: 'a@example.com',
      type: 'open',
      isBot: false,
      link: ''
    });
    db.addTrackingEvent({
      campaignId,
      contactId: 'contact-a',
      email: 'a@example.com',
      type: 'click',
      isBot: false,
      link: 'https://example.com/a'
    });
    db.addTrackingEvent({
      campaignId,
      contactId: 'contact-b',
      email: 'b@example.com',
      type: 'open',
      isBot: false,
      link: ''
    });
    db.addTrackingEvent({
      campaignId,
      contactId: 'bot-1',
      email: 'bot@example.com',
      type: 'open',
      isBot: true,
      link: ''
    });
    db.addTrackingEvent({
      campaignId,
      contactId: 'bot-1',
      email: 'bot@example.com',
      type: 'click',
      isBot: true,
      link: 'https://example.com/a'
    });

    db._run("UPDATE tracking_events SET createdAt = ? WHERE campaignId = ? AND type = 'open' AND contactId = 'contact-a'", ['2026-04-20T10:15:00.000Z', campaignId]);
    db._run("UPDATE tracking_events SET createdAt = ? WHERE campaignId = ? AND type = 'click' AND contactId = 'contact-a'", ['2026-04-20T10:20:00.000Z', campaignId]);
    db._run("UPDATE tracking_events SET createdAt = ? WHERE campaignId = ? AND type = 'open' AND contactId = 'contact-b'", ['2026-04-20T10:10:00.000Z', campaignId]);
    db._run("UPDATE tracking_events SET createdAt = ? WHERE campaignId = ? AND type = 'open' AND contactId = 'bot-1'", ['2026-04-20T10:25:00.000Z', campaignId]);
    db._run("UPDATE tracking_events SET createdAt = ? WHERE campaignId = ? AND type = 'click' AND contactId = 'bot-1'", ['2026-04-20T10:30:00.000Z', campaignId]);

    const analytics = db.getCampaignAnalytics(campaignId);

    expect(analytics.campaign.isABTest).toBe(true);
    expect(analytics.sent).toBe(2);
    expect(analytics.softBounced).toBe(1);
    expect(analytics.uniqueOpens).toBe(2);
    expect(analytics.totalOpenEvents).toBe(2);
    expect(analytics.botOpenEvents).toBe(1);
    expect(analytics.totalClickEvents).toBe(1);
    expect(analytics.botClickEvents).toBe(1);
    const expectedOpenHour = new Date('2026-04-20T10:15:00.000Z').getHours().toString().padStart(2, '0');
    expect(analytics.opensByHour).toEqual([{ hour: expectedOpenHour, count: 3 }]);
    expect(analytics.clicksByLink).toEqual([{ link: 'https://example.com/a', count: 2 }]);
    expect(analytics.abTest).toEqual({
      A: { sent: 1, opened: 1 },
      B: { sent: 1, opened: 1 }
    });
    expect(analytics.lastOpenedAt).toBe('2026-04-20T10:15:00.000Z');
    expect(analytics.lastClickedAt).toBe('2026-04-20T10:20:00.000Z');
  });

  it('derives install date and engagement analytics from the selected period', () => {
    const campaignId = db.addCampaign({
      name: 'Engagement Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      status: 'completed'
    });

    db.addCampaignLog({ campaignId, email: 'prev@example.com', status: 'sent' });
    db.addCampaignLog({ campaignId, email: 'curr-1@example.com', status: 'sent' });
    db.addCampaignLog({ campaignId, email: 'curr-2@example.com', status: 'bounced' });

    const logs = db.getCampaignLogs(campaignId);
    const prevLog = logs.find((log) => log.email === 'prev@example.com');
    const currentSentLog = logs.find((log) => log.email === 'curr-1@example.com');
    const currentBounceLog = logs.find((log) => log.email === 'curr-2@example.com');

    db._run(
      'UPDATE campaign_logs SET createdAt = ?, openedAt = ?, clickedAt = ? WHERE id = ?',
      ['2026-04-08T08:00:00.000Z', '2026-04-08T08:30:00.000Z', '', prevLog.id]
    );
    db._run(
      'UPDATE campaign_logs SET createdAt = ?, openedAt = ?, clickedAt = ? WHERE id = ?',
      ['2026-04-10T09:00:00.000Z', '2026-04-10T09:15:00.000Z', '2026-04-10T09:25:00.000Z', currentSentLog.id]
    );
    db._run(
      'UPDATE campaign_logs SET createdAt = ? WHERE id = ?',
      ['2026-04-11T11:00:00.000Z', currentBounceLog.id]
    );

    expect(db.getInstallDate()).toBe('2026-04-08');

    const analytics = db.getEngagementAnalytics('2026-04-10', '2026-04-12');

    expect(analytics.installDate).toBe('2026-04-08');
    expect(analytics.totals).toEqual({
      sent: 1,
      opened: 1,
      clicked: 1,
      bounced: 1,
      failed: 0,
      replies: 0
    });
    expect(analytics.openRate).toBe(100);
    expect(analytics.clickRate).toBe(100);
    expect(analytics.bounceRate).toBe(100);
    expect(analytics.summary[0]).toMatchObject({
      key: 'likes',
      value: 1,
      change: 0,
      growth: 0
    });
    expect(analytics.summary[1]).toMatchObject({
      key: 'retweets',
      value: 1,
      change: 1,
      growth: 100
    });
    expect(analytics.daily).toHaveLength(2);
    expect(analytics.hasData).toBe(true);
  });

  it('builds the AI-facing deliverability snapshot from sending health signals', () => {
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
    db.incrementSmtpSentCount(smtpId);

    const campaignId = db.addCampaign({
      name: 'Snapshot Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      status: 'completed'
    });

    for (let i = 0; i < 30; i += 1) {
      db.addCampaignLog({ campaignId, email: `sent-${i}@example.com`, status: 'sent' });
    }
    for (let i = 0; i < 3; i += 1) {
      db.addCampaignLog({ campaignId, email: `bounce-${i}@example.com`, status: 'bounced' });
    }

    db._run(
      "UPDATE campaign_logs SET openedAt = '2026-04-20T09:00:00.000Z' WHERE campaignId = ? AND email IN (?, ?, ?)",
      [campaignId, 'sent-0@example.com', 'sent-1@example.com', 'sent-2@example.com']
    );
    db._run(
      "UPDATE campaign_logs SET clickedAt = '2026-04-20T09:05:00.000Z' WHERE campaignId = ? AND email IN (?, ?)",
      [campaignId, 'sent-0@example.com', 'sent-1@example.com']
    );

    db.addToBlacklist({
      email: 'blocked@example.com',
      reason: 'Suppressed',
      source: 'manual'
    });

    const snapshot = db.getDeliverabilitySnapshot();

    expect(snapshot.totalSent).toBe(30);
    expect(snapshot.totalBounced).toBe(3);
    expect(snapshot.totalOpened).toBe(3);
    expect(snapshot.totalClicked).toBe(2);
    expect(snapshot.activeSmtp).toBe(1);
    expect(snapshot.blacklistCount).toBe(1);
    expect(snapshot.isSafeToSend).toBe(false);
    expect(snapshot.warnings).toContain('Blacklist entries exist and may indicate list hygiene issues.');
    expect(snapshot.recommendations).toContain('Review blacklist and remove stale or risky addresses from future sends.');
  });
});
