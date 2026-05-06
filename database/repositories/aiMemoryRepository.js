const { v4: uuidv4 } = require('uuid');

function getAIMemory(db, key) {
  const row = db._get('SELECT value FROM ai_memories WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setAIMemory(db, key, value) {
  const existing = db._get('SELECT id FROM ai_memories WHERE key = ?', [key]);
  if (existing) {
    db._run('UPDATE ai_memories SET value = ?, updatedAt = datetime("now") WHERE key = ?', [value, key]);
    return;
  }

  db._run('INSERT INTO ai_memories (id, key, value) VALUES (?, ?, ?)', [uuidv4(), key, value]);
}

function getAllAIMemories(db) {
  return db._all('SELECT key, value FROM ai_memories ORDER BY updatedAt DESC');
}

function deleteAIMemory(db, key) {
  db._run('DELETE FROM ai_memories WHERE key = ?', [key]);
}

function saveMemory(db, key, value) {
  const id = key;
  const now = new Date().toISOString();
  db._run(
    `INSERT OR REPLACE INTO ai_memories (id, key, value, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [id, key, typeof value === 'string' ? value : JSON.stringify(value), now, now]
  );
}

function getMemory(db, key) {
  const result = db._get('SELECT value FROM ai_memories WHERE key = ?', [key]);
  if (!result) {
    return null;
  }

  try {
    return JSON.parse(result.value);
  } catch {
    return result.value;
  }
}

function getAllMemories(db) {
  return db._all('SELECT * FROM ai_memories ORDER BY createdAt DESC');
}

function deleteMemory(db, key) {
  db._run('DELETE FROM ai_memories WHERE key = ?', [key]);
}

module.exports = {
  getAIMemory,
  setAIMemory,
  getAllAIMemories,
  deleteAIMemory,
  saveMemory,
  getMemory,
  getAllMemories,
  deleteMemory
};
