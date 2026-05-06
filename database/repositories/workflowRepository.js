const { v4: uuidv4 } = require('uuid');

function getAllAutomations(db) {
  return db._all('SELECT * FROM automations ORDER BY createdAt DESC');
}

function getAutomation(db, id) {
  return db._get('SELECT * FROM automations WHERE id = ?', [id]);
}

function addAutomation(db, automation) {
  const id = automation.id || uuidv4();
  db._run(
    `INSERT INTO automations (id, name, description, status, triggerType, triggerConfig, nodes, edges, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      automation.name,
      automation.description || '',
      automation.status || 'draft',
      automation.triggerType,
      automation.triggerConfig || '{}',
      JSON.stringify(automation.nodes || []),
      JSON.stringify(automation.edges || []),
      automation.isActive ? 1 : 0
    ]
  );
  return id;
}

function updateAutomation(db, automation) {
  db._run(
    `UPDATE automations SET name=?, description=?, status=?, triggerType=?, triggerConfig=?,
     nodes=?, edges=?, isActive=?, updatedAt=datetime('now') WHERE id=?`,
    [
      automation.name,
      automation.description || '',
      automation.status || 'draft',
      automation.triggerType,
      automation.triggerConfig || '{}',
      JSON.stringify(automation.nodes || []),
      JSON.stringify(automation.edges || []),
      automation.isActive ? 1 : 0,
      automation.id
    ]
  );
}

function deleteAutomation(db, id) {
  db._run('DELETE FROM automations WHERE id = ?', [id]);
  db._run('DELETE FROM automation_logs WHERE automationId = ?', [id]);
}

function getAutomationLogs(db, automationId) {
  return db._all('SELECT * FROM automation_logs WHERE automationId = ? ORDER BY createdAt DESC', [automationId]);
}

function addAutomationLog(db, log) {
  const id = log.id || uuidv4();
  db._run(
    `INSERT INTO automation_logs (id, automationId, contactId, email, nodeId, action, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      log.automationId,
      log.contactId || '',
      log.email || '',
      log.nodeId || '',
      log.action || '',
      log.status || 'success',
      log.error || ''
    ]
  );
  return id;
}

function getAllDripSequences(db) {
  return db._all('SELECT * FROM drip_sequences ORDER BY createdAt DESC');
}

function getDripSequence(db, id) {
  return db._get('SELECT * FROM drip_sequences WHERE id = ?', [id]);
}

function addDripSequence(db, sequence) {
  const id = sequence.id || uuidv4();
  db._run(
    `INSERT INTO drip_sequences (id, name, description, campaignId, steps, status, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sequence.name,
      sequence.description || '',
      sequence.campaignId,
      JSON.stringify(sequence.steps || []),
      sequence.status || 'draft',
      sequence.isActive ? 1 : 0
    ]
  );
  return id;
}

function updateDripSequence(db, sequence) {
  db._run(
    `UPDATE drip_sequences SET name=?, description=?, campaignId=?, steps=?, status=?, isActive=?, updatedAt=datetime('now') WHERE id=?`,
    [
      sequence.name,
      sequence.description || '',
      sequence.campaignId,
      JSON.stringify(sequence.steps || []),
      sequence.status || 'draft',
      sequence.isActive ? 1 : 0,
      sequence.id
    ]
  );
}

function deleteDripSequence(db, id) {
  db._run('DELETE FROM drip_sequences WHERE id = ?', [id]);
}

module.exports = {
  getAllAutomations,
  getAutomation,
  addAutomation,
  updateAutomation,
  deleteAutomation,
  getAutomationLogs,
  addAutomationLog,
  getAllDripSequences,
  getDripSequence,
  addDripSequence,
  updateDripSequence,
  deleteDripSequence
};
