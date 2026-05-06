const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../db');

describe('Database workflow repository delegation', () => {
  let tempDir;
  let dbPath;
  let db;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulky-db-workflow-'));
    dbPath = path.join(tempDir, 'bulky-workflow.db');
    db = new Database(dbPath);
    await db.initialize();
  });

  afterEach(() => {
    db?.dispose?.();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates, updates, logs, and deletes automations with their logs', () => {
    const automationId = db.addAutomation({
      name: 'Welcome Flow',
      description: 'Runs when a contact is added',
      triggerType: 'contact_added',
      triggerConfig: JSON.stringify({}),
      nodes: [{ id: 'start' }],
      edges: [],
      isActive: true
    });

    db.addAutomationLog({
      automationId,
      email: 'hello@example.com',
      action: 'triggered',
      status: 'success'
    });

    const created = db.getAutomation(automationId);
    expect(created).toMatchObject({
      id: automationId,
      name: 'Welcome Flow',
      triggerType: 'contact_added',
      isActive: 1
    });
    expect(db.getAutomationLogs(automationId)).toHaveLength(1);

    db.updateAutomation({
      ...created,
      name: 'Updated Welcome Flow',
      nodes: [{ id: 'start' }, { id: 'email-1' }]
    });

    const updated = db.getAutomation(automationId);
    expect(updated.name).toBe('Updated Welcome Flow');
    expect(JSON.parse(updated.nodes || '[]')).toHaveLength(2);

    db.deleteAutomation(automationId);
    expect(db.getAutomation(automationId)).toBeNull();
    expect(db.getAutomationLogs(automationId)).toEqual([]);
  });

  it('creates, updates, and deletes drip sequences while preserving serialized steps', () => {
    const campaignId = db.addCampaign({
      name: 'Launch Campaign',
      subject: 'Hello',
      content: '<p>Hello</p>',
      status: 'draft'
    });

    const dripId = db.addDripSequence({
      name: 'Follow-up Series',
      campaignId,
      steps: [{ delay: 1, unit: 'days', subject: 'Step 1' }],
      isActive: true
    });

    const created = db.getDripSequence(dripId);
    expect(created).toMatchObject({
      id: dripId,
      name: 'Follow-up Series',
      campaignId,
      isActive: 1
    });
    expect(JSON.parse(created.steps || '[]')).toEqual([
      { delay: 1, unit: 'days', subject: 'Step 1' }
    ]);

    db.updateDripSequence({
      ...created,
      name: 'Follow-up Series v2',
      steps: [
        { delay: 1, unit: 'days', subject: 'Step 1' },
        { delay: 3, unit: 'days', subject: 'Step 2' }
      ]
    });

    const updated = db.getDripSequence(dripId);
    expect(updated.name).toBe('Follow-up Series v2');
    expect(JSON.parse(updated.steps || '[]')).toHaveLength(2);

    db.deleteDripSequence(dripId);
    expect(db.getDripSequence(dripId)).toBeNull();
  });
});
