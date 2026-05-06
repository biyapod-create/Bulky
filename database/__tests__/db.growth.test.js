const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database growth and AI memory repository delegation', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-growth-'));
    dbPath = path.join(tempDir, 'bulky-growth.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates signup forms, records submissions, confirms them, and cleans up dependent submissions', () => {
    const listId = db.addList({ name: 'Newsletter', description: 'Primary list' });
    const formId = db.addSignupForm({
      name: 'Homepage Form',
      listId,
      fields: [{ name: 'email', type: 'email' }],
      style: { accent: '#0f172a' },
      redirectUrl: 'https://example.com/thanks'
    });

    const createdForm = db.getSignupForm(formId);
    expect(createdForm).toMatchObject({
      id: formId,
      name: 'Homepage Form',
      listId,
      isActive: 1
    });

    const submissionId = db.addFormSubmission({
      formId,
      email: 'reader@example.com',
      data: { source: 'hero' }
    });

    let submissions = db.getFormSubmissions(formId);
    expect(submissions).toHaveLength(1);
    expect(JSON.parse(submissions[0].data || '{}')).toEqual({ source: 'hero' });
    expect(submissions[0].status).toBe('pending');

    db.confirmFormSubmission(submissionId);
    submissions = db.getFormSubmissions(formId);
    expect(submissions[0].status).toBe('confirmed');
    expect(submissions[0].confirmedAt).toBeTruthy();

    db.deleteSignupForm(formId);
    expect(db.getSignupForm(formId)).toBeNull();
    expect(db.getFormSubmissions(formId)).toEqual([]);
  });

  it('persists A/B tests and calculates winners from campaign logs', () => {
    const campaignId = db.addCampaign({
      name: 'Launch',
      subject: 'Variant A',
      content: '<p>Hello</p>',
      status: 'draft'
    });

    const abTestId = db.addABTest({
      name: 'Subject Test',
      campaignId,
      variants: [{ id: 'A' }, { id: 'B' }]
    });

    const created = db.getABTest(abTestId);
    expect(created).toMatchObject({
      id: abTestId,
      name: 'Subject Test',
      campaignId,
      status: 'draft'
    });

    db.updateABTest({
      ...created,
      status: 'running',
      winner: 'A',
      confidence: 87.5,
      variants: [{ id: 'A', subject: 'Hello' }, { id: 'B', subject: 'Hi' }]
    });

    const updated = db.getABTest(abTestId);
    expect(updated.status).toBe('running');
    expect(updated.winner).toBe('A');
    expect(JSON.parse(updated.variants || '[]')).toHaveLength(2);

    db.addCampaignLog({ campaignId, email: 'a1@example.com', status: 'sent', variant: 'A' });
    db.addCampaignLog({ campaignId, email: 'a2@example.com', status: 'sent', variant: 'A' });
    db.addCampaignLog({ campaignId, email: 'a3@example.com', status: 'sent', variant: 'A' });
    db.addCampaignLog({ campaignId, email: 'b1@example.com', status: 'sent', variant: 'B' });
    db.addCampaignLog({ campaignId, email: 'b2@example.com', status: 'sent', variant: 'B' });
    db.addCampaignLog({ campaignId, email: 'b3@example.com', status: 'sent', variant: 'B' });

    db._run(
      "UPDATE campaign_logs SET openedAt = datetime('now') WHERE campaignId = ? AND email IN (?, ?, ?)",
      [campaignId, 'a1@example.com', 'a2@example.com', 'b1@example.com']
    );

    const significance = db.calculateABSignificance(campaignId);
    expect(significance.sampleSizeA).toBe(3);
    expect(significance.sampleSizeB).toBe(3);
    expect(significance.rateA).toBeGreaterThan(significance.rateB);
    expect(significance.winner).toBe('A');
    expect(significance.confidence).toBeGreaterThan(0);

    db.deleteABTest(abTestId);
    expect(db.getABTest(abTestId)).toBeNull();
  });

  it('manages seed accounts and active account filtering', () => {
    const activeId = db.addSeedAccount({
      provider: 'Gmail',
      email: 'seed-a@example.com',
      imapHost: 'imap.gmail.com',
      imapUser: 'seed-a@example.com',
      imapPassword: 'secret-a',
      isActive: true
    });
    const inactiveId = db.addSeedAccount({
      provider: 'Outlook',
      email: 'seed-b@example.com',
      imapHost: 'imap-mail.outlook.com',
      imapUser: 'seed-b@example.com',
      imapPassword: 'secret-b',
      isActive: false
    });

    expect(db.getAllSeedAccounts()).toHaveLength(2);
    expect(db.getActiveSeedAccounts().map((account) => account.id)).toEqual([activeId]);

    const inactive = db.getSeedAccount(inactiveId);
    db.updateSeedAccount({
      ...inactive,
      isActive: true,
      folder: 'Inbox'
    });

    expect(db.getActiveSeedAccounts().map((account) => account.id).sort()).toEqual(
      [activeId, inactiveId].sort()
    );

    db.deleteSeedAccount(activeId);
    expect(db.getSeedAccount(activeId)).toBeNull();
    expect(db.getAllSeedAccounts()).toHaveLength(1);
  });

  it('supports both AI memory interfaces against the same persistence store', () => {
    db.setAIMemory('tone', 'friendly');
    expect(db.getAIMemory('tone')).toBe('friendly');
    expect(db.getAllAIMemories()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'tone', value: 'friendly' })])
    );

    db.saveMemory('assistant-profile', { audience: 'marketers', mode: 'concise' });
    expect(db.getMemory('assistant-profile')).toEqual({
      audience: 'marketers',
      mode: 'concise'
    });
    expect(db.getAllMemories()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'assistant-profile' })])
    );

    db.deleteAIMemory('tone');
    db.deleteMemory('assistant-profile');

    expect(db.getAIMemory('tone')).toBeNull();
    expect(db.getMemory('assistant-profile')).toBeNull();
  });
});
