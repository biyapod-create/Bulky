const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database support repository delegation', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-support-'));
    dbPath = path.join(tempDir, 'bulky-support.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists settings with string and object values and returns parsed settings maps', () => {
    db.setSetting('trackingBaseUrl', 'https://track.example.com');
    db.saveAllSettings({
      warmup: { enabled: true, daily: 50 },
      deliverability: { threshold: 92 }
    });

    expect(db.getSetting('trackingBaseUrl')).toBe('https://track.example.com');
    expect(db.getSetting('warmup')).toBe(JSON.stringify({ enabled: true, daily: 50 }));
    expect(db.getAllSettings()).toEqual(
      expect.objectContaining({
        trackingBaseUrl: 'https://track.example.com',
        warmup: { enabled: true, daily: 50 },
        deliverability: { threshold: 92 }
      })
    );
  });

  it('creates, updates, and deletes warmup schedules while preserving schedule JSON', () => {
    const scheduleId = db.createWarmupSchedule({
      smtpAccountId: 'smtp-1',
      schedule: { startPerDay: 10, targetPerDay: 75 },
      isActive: true
    });

    let schedules = db.getWarmupSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      id: scheduleId,
      smtpAccountId: 'smtp-1',
      isActive: 1
    });
    expect(JSON.parse(schedules[0].schedule || '{}')).toEqual({
      startPerDay: 10,
      targetPerDay: 75
    });

    db.updateWarmupSchedule({
      id: scheduleId,
      schedule: { startPerDay: 20, targetPerDay: 100 },
      isActive: false
    });

    schedules = db.getWarmupSchedules();
    expect(JSON.parse(schedules[0].schedule || '{}')).toEqual({
      startPerDay: 20,
      targetPerDay: 100
    });
    expect(schedules[0].isActive).toBe(0);

    db.deleteWarmupSchedule(scheduleId);
    expect(db.getWarmupSchedules()).toEqual([]);
  });

  it('stores tracking events and spam replacements through the delegated support repository', () => {
    const campaignId = db.addCampaign({
      name: 'Tracking Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      status: 'draft'
    });

    db.addTrackingEvent({
      campaignId,
      email: 'reader@example.com',
      type: 'click',
      link: 'https://example.com/page',
      userAgent: 'Mozilla/5.0',
      device: 'desktop',
      isBot: false
    });

    const replacementId = db.addSpamReplacement({
      spamWord: 'free',
      replacement: 'complimentary',
      category: 'offers'
    });

    let replacements = db.getAllSpamReplacements();
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      id: replacementId,
      spamWord: 'free',
      replacement: 'complimentary'
    });

    db.updateSpamReplacement({
      id: replacementId,
      spamWord: 'free',
      replacement: 'included',
      category: 'offers'
    });

    replacements = db.getAllSpamReplacements();
    expect(replacements[0].replacement).toBe('included');

    const trackingEvents = db.getTrackingEvents(campaignId);
    expect(trackingEvents).toHaveLength(1);
    expect(trackingEvents[0]).toMatchObject({
      campaignId,
      type: 'click',
      link: 'https://example.com/page',
      device: 'desktop',
      isBot: 0
    });

    db.deleteSpamReplacement(replacementId);
    expect(db.getAllSpamReplacements()).toEqual([]);
  });

  it('records backup history entries and keeps the most recent 20 records', () => {
    for (let i = 0; i < 22; i += 1) {
      db.addBackupRecord({
        filename: `backup-${i}.db`,
        size: 1024 + i,
        type: i % 2 === 0 ? 'manual' : 'auto'
      });
    }

    const history = db.getBackupHistory();
    expect(history).toHaveLength(20);
    expect(history[0].filename).toContain('backup-');
    expect(history.every((entry) => typeof entry.filename === 'string')).toBe(true);
  });
});
