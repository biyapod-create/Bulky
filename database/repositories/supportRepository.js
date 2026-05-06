const { v4: uuidv4 } = require('uuid');

function getTrackingEvents(db, campaignId) {
  return db._all('SELECT * FROM tracking_events WHERE campaignId = ? ORDER BY createdAt DESC', [campaignId]);
}

function addTrackingEvent(db, event) {
  const id = event.id || uuidv4();
  db._run(
    `INSERT INTO tracking_events (id, campaignId, contactId, email, type, link, userAgent,
      ipAddress, client, device, os, isBot, country, region)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      event.campaignId,
      event.contactId || '',
      event.email || '',
      event.type,
      event.link || '',
      event.userAgent || '',
      event.ipAddress || '',
      event.client || '',
      event.device || '',
      event.os || '',
      event.isBot ? 1 : 0,
      event.country || '',
      event.region || ''
    ]
  );
}

function getAllSpamReplacements(db) {
  return db._all('SELECT * FROM spam_replacements ORDER BY spamWord ASC');
}

function addSpamReplacement(db, item) {
  const id = item.id || uuidv4();
  db._run(
    'INSERT INTO spam_replacements (id, spamWord, replacement, category) VALUES (?, ?, ?, ?)',
    [id, item.spamWord, item.replacement || '', item.category || 'general']
  );
  return id;
}

function updateSpamReplacement(db, item) {
  db._run(
    'UPDATE spam_replacements SET spamWord=?, replacement=?, category=? WHERE id=?',
    [item.spamWord, item.replacement || '', item.category || 'general', item.id]
  );
}

function deleteSpamReplacement(db, id) {
  db._run('DELETE FROM spam_replacements WHERE id = ?', [id]);
}

function getSetting(db, key) {
  const result = db._get('SELECT value FROM settings WHERE key = ?', [key]);
  return result ? result.value : null;
}

function setSetting(db, key, value) {
  db._run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, typeof value === 'string' ? value : JSON.stringify(value)]
  );
}

function getAllSettings(db) {
  const rows = db._all('SELECT * FROM settings');
  const settings = {};

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

function saveAllSettings(db, settings) {
  for (const [key, value] of Object.entries(settings)) {
    setSetting(db, key, value);
  }
}

function getWarmupSchedules(db) {
  return db._all('SELECT * FROM warmup_schedules ORDER BY createdAt DESC');
}

function createWarmupSchedule(db, schedule) {
  const id = schedule.id || uuidv4();
  db._run(
    'INSERT INTO warmup_schedules (id, smtpAccountId, schedule, isActive) VALUES (?, ?, ?, ?)',
    [id, schedule.smtpAccountId, JSON.stringify(schedule.schedule || {}), schedule.isActive ? 1 : 0]
  );
  return id;
}

function updateWarmupSchedule(db, schedule) {
  db._run(
    'UPDATE warmup_schedules SET schedule=?, isActive=? WHERE id=?',
    [JSON.stringify(schedule.schedule || {}), schedule.isActive ? 1 : 0, schedule.id]
  );
}

function deleteWarmupSchedule(db, id) {
  db._run('DELETE FROM warmup_schedules WHERE id = ?', [id]);
}

function addBackupRecord(db, record) {
  const id = record.id || uuidv4();
  db._run(
    'INSERT INTO backup_history (id, filename, size, type) VALUES (?, ?, ?, ?)',
    [id, record.filename, record.size || 0, record.type || 'manual']
  );
  return id;
}

function getBackupHistory(db) {
  return db._all('SELECT * FROM backup_history ORDER BY createdAt DESC LIMIT 20');
}

module.exports = {
  getTrackingEvents,
  addTrackingEvent,
  getAllSpamReplacements,
  addSpamReplacement,
  updateSpamReplacement,
  deleteSpamReplacement,
  getSetting,
  setSetting,
  getAllSettings,
  saveAllSettings,
  getWarmupSchedules,
  createWarmupSchedule,
  updateWarmupSchedule,
  deleteWarmupSchedule,
  addBackupRecord,
  getBackupHistory
};
