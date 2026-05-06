const { v4: uuidv4 } = require('uuid');

function getAllContacts(db) {
  return db._all('SELECT * FROM contacts ORDER BY createdAt DESC');
}

function getFilteredContacts(db, filter) {
  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];

  if (filter.listId) {
    sql += ' AND listId = ?';
    params.push(filter.listId);
  }
  if (filter.verificationStatus) {
    sql += ' AND verificationStatus = ?';
    params.push(filter.verificationStatus);
  }
  if (filter.search) {
    sql += ' AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ?)';
    const search = `%${filter.search}%`;
    params.push(search, search, search, search);
  }

  sql += ' ORDER BY createdAt DESC';
  return db._filterContactsByTags(db._all(sql, params), filter?.tag);
}

function getContactsPage(db, params) {
  const page = params.page || 1;
  const limit = params.perPage || params.limit || 50;
  const offset = (page - 1) * limit;

  let countSql = 'SELECT COUNT(*) as total FROM contacts WHERE 1=1';
  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const countParams = [];
  const queryParams = [];

  if (params.listId) {
    countSql += ' AND listId = ?';
    sql += ' AND listId = ?';
    countParams.push(params.listId);
    queryParams.push(params.listId);
  }
  if (params.status) {
    countSql += ' AND status = ?';
    sql += ' AND status = ?';
    countParams.push(params.status);
    queryParams.push(params.status);
  }
  if (params.verificationStatus) {
    countSql += ' AND verificationStatus = ?';
    sql += ' AND verificationStatus = ?';
    countParams.push(params.verificationStatus);
    queryParams.push(params.verificationStatus);
  }
  if (params.search) {
    const searchClause = ' AND (email LIKE ? OR firstName LIKE ? OR lastName LIKE ? OR company LIKE ?)';
    const search = `%${params.search}%`;
    countSql += searchClause;
    sql += searchClause;
    countParams.push(search, search, search, search);
    queryParams.push(search, search, search, search);
  }

  const allowedSortCols = ['email', 'firstName', 'lastName', 'company', 'createdAt', 'updatedAt', 'verificationStatus', 'verificationScore'];
  const sortCol = allowedSortCols.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
  const hasTagFilter = db._normalizeTagFilter(params.tag).length > 0;
  sql += ` ORDER BY ${sortCol} ${sortDir}`;
  if (!hasTagFilter) {
    sql += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);
  }

  const countResult = db._get(countSql, countParams);
  let contacts = db._all(sql, queryParams);
  contacts = db._filterContactsByTags(contacts, params.tag);
  const total = hasTagFilter ? contacts.length : (countResult ? countResult.total : 0);
  if (hasTagFilter) {
    contacts = contacts.slice(offset, offset + limit);
  }

  return {
    contacts,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

function getContactStats(db) {
  const total = db._get('SELECT COUNT(*) as count FROM contacts');
  const verified = db._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'valid'");
  const unverified = db._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'unverified' OR verificationStatus IS NULL");
  const invalid = db._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'invalid'");
  const risky = db._get("SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = 'risky'");
  const active = db._get("SELECT COUNT(*) as count FROM contacts WHERE status = 'active'");

  return {
    total: total?.count || 0,
    verified: verified?.count || 0,
    unverified: unverified?.count || 0,
    invalid: invalid?.count || 0,
    risky: risky?.count || 0,
    active: active?.count || 0
  };
}

function addContact(db, contact) {
  const email = (contact.email || '').trim().toLowerCase();
  if (!db._isValidEmail(email)) {
    return { error: 'Invalid email format', email: contact.email };
  }

  const existing = db._get('SELECT id FROM contacts WHERE email = ?', [email]);
  if (existing) {
    return { error: 'Contact already exists', email };
  }

  const id = contact.id || uuidv4();
  const tags = JSON.stringify(db._normalizeStoredContactTags(contact.tags));
  const verificationStatus = contact.verificationStatus || (contact.verified ? 'valid' : 'unverified');
  const verificationScore = contact.verificationScore || 0;
  const verificationDetails = contact.verificationDetails ? JSON.stringify(contact.verificationDetails) : '{}';

  db._run(
    `INSERT OR IGNORE INTO contacts (id, email, firstName, lastName, company, phone, customField1, customField2, tags, listId, status, verificationStatus, verificationScore, verificationDetails)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      email,
      contact.firstName || '',
      contact.lastName || '',
      contact.company || '',
      contact.phone || '',
      contact.customField1 || '',
      contact.customField2 || '',
      tags,
      contact.listId || '',
      contact.status || 'active',
      verificationStatus,
      verificationScore,
      verificationDetails
    ]
  );

  return id;
}

function addBulkContacts(db, contacts) {
  let added = 0;
  let skipped = 0;
  let duplicates = 0;
  let invalid = 0;
  const seen = new Set();

  db.db.run('BEGIN TRANSACTION');
  try {
    for (const contact of contacts) {
      try {
        const email = (contact.email || '').trim().toLowerCase();

        if (!db._isValidEmail(email)) {
          invalid++;
          skipped++;
          continue;
        }

        if (seen.has(email)) {
          duplicates++;
          skipped++;
          continue;
        }
        seen.add(email);

        const existing = db._get('SELECT id FROM contacts WHERE email = ?', [email]);
        if (existing) {
          duplicates++;
          skipped++;
          continue;
        }

        const result = addContact(db, contact);
        if (result && typeof result === 'string') {
          added++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }
    db.db.run('COMMIT');
  } catch (error) {
    try {
      db.db.run('ROLLBACK');
    } catch {}
    throw error;
  }

  db._save();
  return { added, inserted: added, skipped, duplicates, invalid, total: contacts.length };
}

function updateContact(db, contact) {
  const tags = JSON.stringify(db._normalizeStoredContactTags(contact.tags));
  db._run(
    `UPDATE contacts SET firstName=?, lastName=?, company=?, phone=?, customField1=?, customField2=?,
     tags=?, listId=?, verificationStatus=?, verificationScore=?, verificationDetails=?,
     updatedAt=datetime('now') WHERE id=?`,
    [
      contact.firstName || '',
      contact.lastName || '',
      contact.company || '',
      contact.phone || '',
      contact.customField1 || '',
      contact.customField2 || '',
      tags,
      contact.listId || '',
      contact.verificationStatus || 'unverified',
      contact.verificationScore || 0,
      JSON.stringify(contact.verificationDetails || {}),
      contact.id
    ]
  );
}

function deleteContacts(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db._run(`DELETE FROM contacts WHERE id IN (${placeholders})`, ids);
}

function deleteContactsByVerification(db, status) {
  db._run('DELETE FROM contacts WHERE verificationStatus = ?', [status]);
}

function addContactToList(db, contactId, listId) {
  db._run(
    "UPDATE contacts SET listId=?, updatedAt=datetime('now') WHERE id=?",
    [listId, contactId]
  );
}

function removeContactFromList(db, contactId, listId) {
  const contact = db._get('SELECT listId FROM contacts WHERE id=?', [contactId]);
  if (contact && contact.listId === listId) {
    db._run("UPDATE contacts SET listId='', updatedAt=datetime('now') WHERE id=?", [contactId]);
  }
}

function getContactLists(db, contactId) {
  const contact = db._get('SELECT listId FROM contacts WHERE id=?', [contactId]);
  if (!contact || !contact.listId) return [];
  const list = db._get('SELECT * FROM lists WHERE id=?', [contact.listId]);
  return list ? [list] : [];
}

function addTagToContact(db, contactId, tagName) {
  const contact = db._get('SELECT tags FROM contacts WHERE id=?', [contactId]);
  if (!contact) return;
  const tags = db._normalizeStoredContactTags(contact.tags);
  const [tag] = db._normalizeStoredContactTags([tagName]);
  if (tag && !tags.includes(tag)) {
    tags.push(tag);
    db._run(
      "UPDATE contacts SET tags=?, updatedAt=datetime('now') WHERE id=?",
      [JSON.stringify(tags), contactId]
    );
  }
}

function removeTagFromContact(db, contactId, tagName) {
  const contact = db._get('SELECT tags FROM contacts WHERE id=?', [contactId]);
  if (!contact) return;
  const tags = db._normalizeStoredContactTags(contact.tags);
  const [tag] = db._normalizeStoredContactTags([tagName]);
  const next = tags.filter((value) => value !== tag);
  db._run(
    "UPDATE contacts SET tags=?, updatedAt=datetime('now') WHERE id=?",
    [JSON.stringify(next), contactId]
  );
}

function getContactTags(db, contactId) {
  const contact = db._get('SELECT tags FROM contacts WHERE id=?', [contactId]);
  if (!contact) return [];
  return db._normalizeStoredContactTags(contact.tags);
}

function getContactDetail(db, contactId) {
  const contact = db._get('SELECT * FROM contacts WHERE id = ?', [contactId]);
  if (!contact) return null;

  const email = String(contact.email || '').toLowerCase();
  const history = [];

  const logs = db._all(
    `SELECT status, failureReason, createdAt, openedAt, clickedAt, campaignId
     FROM campaign_logs
     WHERE contactId = ? OR lower(email) = ?
     ORDER BY createdAt DESC
     LIMIT 50`,
    [contactId, email]
  );

  for (const log of logs) {
    if (log.createdAt) {
      history.push({
        type: log.status || 'sent',
        message: log.status === 'bounced'
          ? `Bounced${log.failureReason ? `: ${log.failureReason}` : ''}`
          : `Email ${log.status || 'sent'}`,
        time: log.createdAt,
        createdAt: log.createdAt
      });
    }
    if (log.openedAt) {
      history.push({
        type: 'open',
        message: 'Email opened',
        time: log.openedAt,
        createdAt: log.openedAt
      });
    }
    if (log.clickedAt) {
      history.push({
        type: 'click',
        message: 'Link clicked',
        time: log.clickedAt,
        createdAt: log.clickedAt
      });
    }
  }

  const trackingEvents = db._all(
    `SELECT type, createdAt, link
     FROM tracking_events
     WHERE contactId = ? OR lower(email) = ?
     ORDER BY createdAt DESC
     LIMIT 25`,
    [contactId, email]
  );

  for (const event of trackingEvents) {
    history.push({
      type: event.type || 'activity',
      message: event.type === 'click'
        ? `Clicked${event.link ? `: ${event.link}` : ''}`
        : event.type === 'open'
          ? 'Opened email'
          : event.type || 'Tracked activity',
      time: event.createdAt,
      createdAt: event.createdAt
    });
  }

  const unsubscribe = db._get(
    'SELECT createdAt, reason FROM unsubscribes WHERE lower(email) = ?',
    [email]
  );
  if (unsubscribe?.createdAt) {
    history.push({
      type: 'unsubscribe',
      message: `Unsubscribed${unsubscribe.reason ? `: ${unsubscribe.reason}` : ''}`,
      time: unsubscribe.createdAt,
      createdAt: unsubscribe.createdAt
    });
  }

  history.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return {
    ...contact,
    tags: JSON.stringify(db._normalizeStoredContactTags(contact.tags)),
    history: history.slice(0, 50)
  };
}

function getRecipientCount(db, filter) {
  const manualEmails = Array.isArray(filter?.emails)
    ? filter.emails.filter(Boolean)
    : [];
  if (manualEmails.length > 0) {
    return [...new Set(manualEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))].length;
  }

  let sql = 'SELECT COUNT(*) as count FROM contacts WHERE 1=1';
  const params = [];

  if (filter.listId) {
    sql += ' AND listId = ?';
    params.push(filter.listId);
  }
  if (filter.verificationStatus) {
    sql += ' AND verificationStatus = ?';
    params.push(filter.verificationStatus);
  }

  return db._filterContactsByTags(
    db._all(sql.replace('COUNT(*) as count', '*'), params),
    filter?.tags ?? filter?.tag
  ).length;
}

function getContactsForCampaign(db, filter) {
  const manualEmails = Array.isArray(filter?.emails)
    ? [...new Set(filter.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))]
    : [];
  if (manualEmails.length > 0) {
    const placeholders = manualEmails.map(() => '?').join(',');
    return db._all(`SELECT * FROM contacts WHERE lower(email) IN (${placeholders})`, manualEmails);
  }

  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];

  if (filter.listId) {
    sql += ' AND listId = ?';
    params.push(filter.listId);
  }
  if (filter.verificationStatus) {
    if (filter.verificationStatus === 'verified_only') {
      sql += " AND verificationStatus = 'valid'";
    } else if (filter.verificationStatus === 'exclude_invalid') {
      sql += " AND verificationStatus != 'invalid'";
    }
  }

  return db._filterContactsByTags(db._all(sql, params), filter?.tags ?? filter?.tag);
}

function incrementContactBounce(db, contactId, reason) {
  db._run(
    `UPDATE contacts SET bounceCount = bounceCount + 1, lastBounceReason = ?, updatedAt = datetime('now') WHERE id = ?`,
    [reason || '', contactId]
  );
}

function getAllLists(db) {
  return db._all('SELECT * FROM lists ORDER BY createdAt DESC');
}

function getList(db, id) {
  return db._get('SELECT * FROM lists WHERE id = ?', [id]);
}

function addList(db, list) {
  const normalizedName = String(list.name || '').trim();
  const existing = db._get('SELECT id FROM lists WHERE lower(name) = lower(?)', [normalizedName]);
  if (existing) {
    return { error: 'List name already exists' };
  }
  const id = list.id || uuidv4();
  db._run(
    'INSERT INTO lists (id, name, description, color) VALUES (?, ?, ?, ?)',
    [id, normalizedName, list.description || '', list.color || '#6366f1']
  );
  return id;
}

function updateList(db, list) {
  db._run(
    'UPDATE lists SET name=?, description=?, color=? WHERE id=?',
    [list.name, list.description || '', list.color || '#6366f1', list.id]
  );
}

function deleteList(db, id) {
  db._run('DELETE FROM lists WHERE id = ?', [id]);
  db._run("UPDATE contacts SET listId = '' WHERE listId = ?", [id]);
}

function getListContacts(db, listId) {
  return db._all('SELECT * FROM contacts WHERE listId = ?', [listId]);
}

function getAllTags(db) {
  return db._all('SELECT * FROM tags ORDER BY name ASC');
}

function addTag(db, tag) {
  const normalizedName = String(tag.name || '').trim();
  const existing = db._get('SELECT id FROM tags WHERE lower(name) = lower(?)', [normalizedName]);
  if (existing) {
    return { error: 'Tag already exists' };
  }
  const id = tag.id || uuidv4();
  db._run(
    'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
    [id, normalizedName, tag.color || '#6366f1']
  );
  return id;
}

function deleteTag(db, id) {
  db._run('DELETE FROM tags WHERE id = ?', [id]);
  const taggedContacts = db._all("SELECT id, tags FROM contacts WHERE tags LIKE ?", [`%${id}%`]);
  for (const contact of taggedContacts) {
    try {
      const nextTags = JSON.parse(contact.tags || '[]')
        .map((tag) => String(tag || '').trim())
        .filter((tag) => tag && tag !== id);
      db._run(
        "UPDATE contacts SET tags = ?, updatedAt = datetime('now') WHERE id = ?",
        [JSON.stringify(nextTags), contact.id]
      );
    } catch {
      // Ignore malformed tag payloads while cleaning up deleted tag references.
    }
  }
}

function getAllBlacklist(db) {
  return db._all('SELECT * FROM blacklist ORDER BY createdAt DESC').map((entry) => {
    const storedValue = (entry.email || '').toLowerCase();
    if (storedValue.startsWith('@') && storedValue.length > 1) {
      return {
        ...entry,
        email: '',
        domain: storedValue.slice(1)
      };
    }

    return {
      ...entry,
      domain: ''
    };
  });
}

function addToBlacklist(db, entry) {
  const id = entry.id || uuidv4();
  const normalizedEmail = String(entry.email || '').trim().toLowerCase();
  const normalizedDomain = String(entry.domain || '').trim().toLowerCase();
  const address = normalizedEmail || (normalizedDomain ? `@${normalizedDomain}` : '');
  if (!address) return id;

  try {
    db._run(
      'INSERT OR IGNORE INTO blacklist (id, email, reason, source) VALUES (?, ?, ?, ?)',
      [id, address, entry.reason || '', entry.source || 'manual']
    );
  } catch {}

  return id;
}

function addBulkToBlacklist(db, entries) {
  let added = 0;
  db.db.run('BEGIN TRANSACTION');
  try {
    for (const entry of entries) {
      try {
        const normalizedEmail = String(entry.email || '').trim().toLowerCase();
        const normalizedDomain = String(entry.domain || '').trim().toLowerCase();
        const address = normalizedEmail || (normalizedDomain ? `@${normalizedDomain}` : '');
        if (!address) continue;

        const existing = db._get('SELECT id FROM blacklist WHERE email = ?', [address]);
        if (!existing) {
          addToBlacklist(db, entry);
          added++;
        }
      } catch {}
    }
    db.db.run('COMMIT');
  } catch {
    try {
      db.db.run('ROLLBACK');
    } catch {}
  }
  db._save();
  return { added, total: entries.length };
}

function removeFromBlacklist(db, id) {
  db._run('DELETE FROM blacklist WHERE id = ?', [id]);
}

function isBlacklisted(db, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  const domain = normalizedEmail.includes('@') ? `@${normalizedEmail.split('@')[1]}` : '';
  const result = domain
    ? db._get('SELECT id FROM blacklist WHERE email = ? OR email = ?', [normalizedEmail, domain])
    : db._get('SELECT id FROM blacklist WHERE email = ?', [normalizedEmail]);
  return !!result;
}

function autoBlacklistBounced(db) {
  const bounced = db._all('SELECT * FROM contacts WHERE bounceCount >= 2');
  let count = 0;
  for (const contact of bounced) {
    if (!isBlacklisted(db, contact.email)) {
      addToBlacklist(db, {
        email: contact.email,
        reason: `Auto-blacklisted: ${contact.bounceCount} bounces - ${contact.lastBounceReason}`,
        source: 'auto_bounce'
      });
      count++;
    }
  }
  return { blacklisted: count };
}

function getAllUnsubscribes(db) {
  return db._all('SELECT * FROM unsubscribes ORDER BY createdAt DESC');
}

function addUnsubscribe(db, email, campaignId, reason) {
  const id = uuidv4();
  try {
    db._run(
      'INSERT OR IGNORE INTO unsubscribes (id, email, campaignId, reason) VALUES (?, ?, ?, ?)',
      [id, email.toLowerCase(), campaignId || '', reason || '']
    );
  } catch {}
}

function removeUnsubscribe(db, email) {
  db._run('DELETE FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
}

function isUnsubscribed(db, email) {
  const result = db._get('SELECT id FROM unsubscribes WHERE email = ?', [email.toLowerCase()]);
  return !!result;
}

function getUnverifiedContacts(db, limit = 50) {
  return db._all(
    `SELECT id, email, firstName, lastName, status, verificationStatus
     FROM contacts
     WHERE verificationStatus IS NULL OR verificationStatus = '' OR verificationStatus = 'unverified'
     LIMIT ?`,
    [limit]
  );
}

function getContactsNeedingVerificationCount(db) {
  const row = db._get(
    `SELECT COUNT(*) as count FROM contacts
     WHERE verificationStatus IS NULL OR verificationStatus = '' OR verificationStatus = 'unverified'`
  );
  return row ? row.count : 0;
}

function updateContactEngagement(db, contactId) {
  const opens = db._get(
    "SELECT COUNT(*) AS c FROM campaign_logs WHERE contactId=? AND openedAt IS NOT NULL AND openedAt!=''",
    [contactId]
  )?.c || 0;
  const clicks = db._get(
    "SELECT COUNT(*) AS c FROM campaign_logs WHERE contactId=? AND clickedAt IS NOT NULL AND clickedAt!=''",
    [contactId]
  )?.c || 0;
  const sent = db._get(
    "SELECT COUNT(*) AS c FROM campaign_logs WHERE contactId=? AND status='sent'",
    [contactId]
  )?.c || 0;
  const score = sent > 0 ? Math.min(100, Math.round(((opens * 2 + clicks * 3) / sent) * 25)) : 0;
  const lastOpened = db._get(
    "SELECT MAX(openedAt) AS t FROM campaign_logs WHERE contactId=? AND openedAt IS NOT NULL",
    [contactId]
  )?.t || null;

  db._run(
    "UPDATE contacts SET engagementScore=COALESCE(?,0), lastOpenedAt=?, updatedAt=datetime('now') WHERE id=?",
    [score, lastOpened, contactId]
  );
  return score;
}

function getContactsByEngagement(db, minScore, maxScore) {
  return db._all(
    "SELECT * FROM contacts WHERE COALESCE(engagementScore,0) BETWEEN ? AND ? ORDER BY COALESCE(engagementScore,0) DESC",
    [minScore ?? 0, maxScore ?? 100]
  );
}

function getTopEngagedContacts(db, limit) {
  return db._all(
    'SELECT * FROM contacts ORDER BY COALESCE(engagementScore,0) DESC LIMIT ?',
    [limit || 50]
  );
}

function getColdContacts(db, daysInactive) {
  const days = parseInt(daysInactive, 10) || 90;
  return db._all(
    "SELECT * FROM contacts WHERE status='active' AND (lastOpenedAt IS NULL OR lastOpenedAt < datetime('now','-' || ? || ' days')) ORDER BY createdAt ASC",
    [days]
  );
}

function archiveInactiveContacts(db, daysInactive) {
  const days = parseInt(daysInactive, 10) || 180;
  db._run(
    "UPDATE contacts SET status='archived', updatedAt=datetime('now') WHERE status='active' AND (lastOpenedAt IS NULL OR lastOpenedAt < datetime('now','-' || ? || ' days'))",
    [days]
  );
  return { archived: db._get('SELECT changes() AS n')?.n || 0 };
}

function createReengagementSequence(db, name, daysInactive, campaignId) {
  const cold = getColdContacts(db, daysInactive);
  const id = require('crypto').randomUUID();
  db.addDripSequence({
    id,
    name,
    campaignId,
    steps: JSON.stringify([{ delay: 1, unit: 'days', subject: 'We miss you!' }]),
    isActive: true,
    status: 'active'
  });
  return { id, coldContactCount: cold.length };
}

module.exports = {
  getAllContacts,
  getFilteredContacts,
  getContactsPage,
  getContactStats,
  addContact,
  addBulkContacts,
  updateContact,
  deleteContacts,
  deleteContactsByVerification,
  addContactToList,
  removeContactFromList,
  getContactLists,
  addTagToContact,
  removeTagFromContact,
  getContactTags,
  getContactDetail,
  getRecipientCount,
  getContactsForCampaign,
  incrementContactBounce,
  getAllLists,
  getList,
  addList,
  updateList,
  deleteList,
  getListContacts,
  getAllTags,
  addTag,
  deleteTag,
  getAllBlacklist,
  addToBlacklist,
  addBulkToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  autoBlacklistBounced,
  getAllUnsubscribes,
  addUnsubscribe,
  removeUnsubscribe,
  isUnsubscribed,
  getUnverifiedContacts,
  getContactsNeedingVerificationCount,
  updateContactEngagement,
  getContactsByEngagement,
  getTopEngagedContacts,
  getColdContacts,
  archiveInactiveContacts,
  createReengagementSequence
};
