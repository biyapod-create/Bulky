const {
  validateBulkContactsInput,
  validateContactImportPreviewPayload,
  validateContactIdList,
  validateContactInput,
  validateContactQueryParams,
  validateContactVerificationStatus,
  validateId,
  validateImportFilePath
} = require('./validators');

const SUPPORTED_CONTACT_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json', '.txt'];
const CONTACT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTACT_IMPORT_FILTERS = [
  { name: 'Supported Files', extensions: ['csv', 'xlsx', 'xls', 'json', 'txt'] },
  { name: 'CSV Files', extensions: ['csv'] },
  { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
  { name: 'JSON Files', extensions: ['json'] },
  { name: 'Text Files', extensions: ['txt'] },
  { name: 'All Files', extensions: ['*'] }
];

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCsvRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { error: 'File is empty or has no data rows' };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((value) => !value)) continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function buildAutoMapping(headers, rows) {
  const autoMapping = {};
  for (const key of headers) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['email', 'emailaddress', 'mail', 'emailid'].includes(normalized)) autoMapping[key] = 'email';
    else if (['firstname', 'first', 'fname', 'givenname'].includes(normalized)) autoMapping[key] = 'firstName';
    else if (['lastname', 'last', 'lname', 'surname', 'familyname'].includes(normalized)) autoMapping[key] = 'lastName';
    else if (['company', 'organization', 'org', 'companyname'].includes(normalized)) autoMapping[key] = 'company';
    else if (['phone', 'tel', 'telephone', 'mobile', 'phonenumber'].includes(normalized)) autoMapping[key] = 'phone';
    else if (['status'].includes(normalized)) autoMapping[key] = 'status';
    else if (['name', 'fullname', 'contactname'].includes(normalized) && !autoMapping[key]) autoMapping[key] = 'firstName';
  }

  if (!Object.values(autoMapping).includes('email')) {
    for (const key of headers) {
      const sample = rows.slice(0, 5).map((row) => row[key] || '');
      if (sample.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))) {
        autoMapping[key] = 'email';
        break;
      }
    }
  }

  return autoMapping;
}

function detectContactColumnMap(rows) {
  const colMap = {};
  const sampleKeys = Object.keys(rows[0] || {});
  for (const key of sampleKeys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['email', 'emailaddress', 'mail', 'emailid'].includes(normalized)) colMap.email = key;
    else if (['firstname', 'first', 'fname', 'givenname'].includes(normalized)) colMap.firstName = key;
    else if (['lastname', 'last', 'lname', 'surname', 'familyname'].includes(normalized)) colMap.lastName = key;
    else if (['company', 'organization', 'org', 'companyname'].includes(normalized)) colMap.company = key;
    else if (['phone', 'tel', 'telephone', 'mobile', 'phonenumber'].includes(normalized)) colMap.phone = key;
    else if (['name', 'fullname', 'contactname'].includes(normalized) && !colMap.firstName) colMap.fullName = key;
  }

  if (!colMap.email) {
    for (const key of sampleKeys) {
      const sample = rows.slice(0, 5).map((row) => row[key] || '');
      if (sample.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))) {
        colMap.email = key;
        break;
      }
    }
  }

  return colMap;
}

function mapRowsToContacts(rows) {
  if (rows.length === 0) {
    return { success: false, error: 'No data found in file' };
  }

  const colMap = detectContactColumnMap(rows);
  if (!colMap.email) {
    return { success: false, error: 'Could not detect an email column. Make sure headers include "email" or "Email Address".' };
  }

  const contacts = [];
  for (const row of rows) {
    const email = (row[colMap.email] || '').trim();
    if (!email) continue;

    let firstName = colMap.firstName ? (row[colMap.firstName] || '').trim() : '';
    let lastName = colMap.lastName ? (row[colMap.lastName] || '').trim() : '';

    if (!firstName && !lastName && colMap.fullName) {
      const parts = (row[colMap.fullName] || '').trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ');
    }

    contacts.push({
      email,
      firstName,
      lastName,
      company: colMap.company ? (row[colMap.company] || '').trim() : '',
      phone: colMap.phone ? (row[colMap.phone] || '').trim() : ''
    });
  }

  if (contacts.length === 0) {
    return { success: false, error: 'No valid email addresses found in file' };
  }

  return { success: true, contacts };
}

async function readRowsFromFile({ filePath, fs, path, xlsxOptions = undefined }) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);

  try {
    if (ext === '.json') {
      const data = JSON.parse(content.toString('utf8'));
      const rows = Array.isArray(data) ? data : [data];
      return { success: true, ext, rows, headers: Object.keys(rows[0] || {}) };
    }

    if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(content, xlsxOptions || { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      return { success: true, ext, rows, headers: Object.keys(rows[0] || {}) };
    }

    const parsed = parseCsvRows(content.toString('utf8'));
    if (parsed.error) {
      return { success: false, error: parsed.error };
    }

    return { success: true, ext, rows: parsed.rows, headers: parsed.headers };
  } catch (error) {
    return { success: false, error: `Failed to parse file: ${error.message}` };
  }
}

async function showContactImportDialog(dialog, mainWindow) {
  return dialog.showOpenDialog(mainWindow, {
    title: 'Import Contacts',
    filters: CONTACT_IMPORT_FILTERS,
    properties: ['openFile']
  });
}

async function validateBinaryMime(filePath, ext) {
  const textExtensions = ['.csv', '.txt', '.json'];
  if (textExtensions.includes(ext)) return null;

  try {
    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(filePath);
    const binaryAllowed = {
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.xls': ['application/vnd.ms-excel']
    };
    if (!detected || !binaryAllowed[ext]?.includes(detected.mime)) {
      return 'Invalid file type';
    }
  } catch (error) {
    // Allow parse step to catch bad files when file-type is unavailable.
  }

  return null;
}

function normalizeImportCellValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function buildContactsFromMapping(rows, mapping) {
  const fieldsByHeader = Object.entries(mapping || {}).filter(([, field]) => field && field !== 'skip');
  const emailEntry = fieldsByHeader.find(([, field]) => field === 'email');

  if (!emailEntry) {
    return { success: false, error: 'Import mapping must include an email column' };
  }

  const contacts = [];
  let blankEmailRows = 0;

  for (const row of rows) {
    const email = normalizeImportCellValue(row?.[emailEntry[0]]).toLowerCase();
    if (!email) {
      blankEmailRows++;
      continue;
    }

    const contact = {
      email,
      firstName: '',
      lastName: '',
      company: '',
      phone: ''
    };

    for (const [header, field] of fieldsByHeader) {
      if (field === 'email') continue;
      const value = normalizeImportCellValue(row?.[header]);
      if (!value) continue;
      contact[field] = value;
    }

    contacts.push(contact);
  }

  return { success: true, contacts, blankEmailRows };
}

function getListRecord(db, listId) {
  if (!listId) return null;
  if (typeof db._get === 'function') {
    return db._get('SELECT id, name FROM lists WHERE id = ?', [listId]);
  }
  const lists = typeof db.getAllLists === 'function' ? db.getAllLists() : [];
  return Array.isArray(lists) ? lists.find((list) => list.id === listId) || null : null;
}

function getTagRecord(db, tagId) {
  if (!tagId) return null;
  if (typeof db._get === 'function') {
    return db._get('SELECT id, name FROM tags WHERE id = ?', [tagId]);
  }
  const tags = typeof db.getAllTags === 'function' ? db.getAllTags() : [];
  return Array.isArray(tags) ? tags.find((tag) => tag.id === tagId) || null : null;
}

function getExistingEmailSet(db, emails) {
  const normalizedEmails = [...new Set(
    (emails || [])
      .map((email) => String(email || '').trim().toLowerCase())
      .filter(Boolean)
  )];

  if (normalizedEmails.length === 0) return new Set();

  if (typeof db._all === 'function') {
    const existing = new Set();
    const chunkSize = 400;
    for (let index = 0; index < normalizedEmails.length; index += chunkSize) {
      const batch = normalizedEmails.slice(index, index + chunkSize);
      const placeholders = batch.map(() => '?').join(',');
      const rows = db._all(
        `SELECT lower(email) as email FROM contacts WHERE lower(email) IN (${placeholders})`,
        batch
      );
      for (const row of rows || []) {
        if (row?.email) existing.add(String(row.email).toLowerCase());
      }
    }
    return existing;
  }

  const contacts = typeof db.getAllContacts === 'function' ? db.getAllContacts() : [];
  return new Set(
    (contacts || [])
      .map((contact) => String(contact?.email || '').trim().toLowerCase())
      .filter((email) => normalizedEmails.includes(email))
  );
}

function prepareContactImport(db, { rows, mapping, listId }) {
  const mapped = buildContactsFromMapping(rows, mapping);
  if (!mapped.success) {
    return { success: false, error: mapped.error };
  }

  const existingEmails = getExistingEmailSet(db, mapped.contacts.map((contact) => contact.email));
  const readyContacts = [];
  const sampleContacts = [];
  const seenInFile = new Set();

  let invalidEmails = 0;
  let duplicateInFile = 0;
  let existingDuplicates = 0;

  for (const contact of mapped.contacts) {
    const email = String(contact.email || '').trim().toLowerCase();
    if (!CONTACT_EMAIL_REGEX.test(email)) {
      invalidEmails++;
      continue;
    }
    if (seenInFile.has(email)) {
      duplicateInFile++;
      continue;
    }
    seenInFile.add(email);
    if (existingEmails.has(email)) {
      existingDuplicates++;
      continue;
    }

    readyContacts.push(contact);
    if (sampleContacts.length < 100) {
      sampleContacts.push(contact);
    }
  }

  const list = listId ? getListRecord(db, listId) : null;

  return {
    success: true,
    contacts: readyContacts,
    sampleContacts,
    summary: {
      totalRows: rows.length,
      mappedRows: mapped.contacts.length,
      blankEmailRows: mapped.blankEmailRows,
      invalidEmails,
      duplicateInFile,
      existingDuplicates,
      readyToImport: readyContacts.length,
      skippedRows: rows.length - readyContacts.length,
      listId: list?.id || '',
      listName: list?.name || ''
    }
  };
}

function registerContactsHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  path,
  getMainWindow,
  automationEngine,
  dripEngine
}) {
  safeHandler('contacts:getAll', () => db.getAllContacts());
  safeHandler('contacts:getFiltered', (e, filter) => {
    const validated = validateContactQueryParams(filter);
    if (validated.error) return { error: validated.error };
    return db.getFilteredContacts(validated.value);
  });
  safeHandler('contacts:getPage', (e, params) => {
    const validated = validateContactQueryParams(params);
    if (validated.error) return { error: validated.error };
    return db.getContactsPage(validated.value);
  });
  safeHandler('contacts:getStats', () => db.getContactStats());
  safeHandler('contacts:getDetail', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getContactDetail(validated.value);
  });
  safeHandler('contacts:add', async (e, contact) => {
    const validated = validateContactInput(contact);
    if (validated.error) return { success: false, error: validated.error };
    const result = db.addContact(validated.value);
    if (result && result.error) return result;
    const ctx = { contactId: result, email: validated.value.email, listId: validated.value.listId || '' };
    automationEngine?.fire?.('contact_added', ctx).catch(() => {});
    dripEngine?.enqueueContact?.(result, validated.value.email, { listId: validated.value.listId || '' });
    return { success: true, id: result };
  });
  safeHandler('contacts:addBulk', async (e, contacts) => {
    const validated = validateBulkContactsInput(contacts);
    if (validated.error) return { error: validated.error };
    const insertedBefore = new Date().toISOString();
    const result = db.addBulkContacts(validated.value);

    if (result.added > 0 && (automationEngine || dripEngine)) {
      const emails = validated.value.map((c) => String(c.email || '').trim().toLowerCase()).filter(Boolean);
      const chunkSize = 400;
      for (let i = 0; i < emails.length; i += chunkSize) {
        const batch = emails.slice(i, i + chunkSize);
        const placeholders = batch.map(() => '?').join(',');
        const rows = typeof db._all === 'function'
          ? (db._all(
              `SELECT id, email, listId FROM contacts WHERE lower(email) IN (${placeholders}) AND createdAt >= ?`,
              [...batch, insertedBefore]
            ) || [])
          : [];
        for (const row of rows) {
          const ctx = { contactId: row.id, email: row.email, listId: row.listId || '' };
          automationEngine?.fire?.('contact_added', ctx).catch(() => {});
          dripEngine?.enqueueContact?.(row.id, row.email, { listId: row.listId || '' });
        }
      }
    }

    return result;
  });
  safeHandler('contacts:update', (e, contact) => {
    const validated = validateContactInput(contact, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateContact(validated.value);
    return { success: true };
  });
  safeHandler('contacts:delete', (e, ids) => {
    const validated = validateContactIdList(ids);
    if (validated.error) return { error: validated.error };
    db.deleteContacts(validated.value);
    return { success: true };
  });
  safeHandler('contacts:deleteByVerification', (e, status) => {
    const validated = validateContactVerificationStatus(status);
    if (validated.error) return { success: false, error: validated.error };
    const before = db._all('SELECT COUNT(*) as count FROM contacts WHERE verificationStatus = ?', [validated.value]);
    const deletedCount = before.length > 0 ? before[0].count : 0;
    db.deleteContactsByVerification(validated.value);
    return { success: true, deleted: deletedCount };
  });
  safeHandler('contacts:getRecipientCount', (e, filter) => {
    const validated = validateContactQueryParams(filter);
    if (validated.error) return { error: validated.error };
    return db.getRecipientCount(validated.value);
  });
  safeHandler('contacts:getForCampaign', (e, filter) => {
    const validated = validateContactQueryParams(filter);
    if (validated.error) return { error: validated.error };
    return db.getContactsForCampaign(validated.value);
  });

  safeHandler('contacts:addTagBulk', (e, contactIds, tagId) => {
    const validatedIds = validateContactIdList(contactIds, { field: 'contactIds' });
    if (validatedIds.error) return { success: false, error: validatedIds.error };

    const validatedTagId = validateId(tagId, 'tagId');
    if (validatedTagId.error) return { success: false, error: validatedTagId.error };

    const tag = getTagRecord(db, validatedTagId.value);
    if (!tag) return { success: false, error: 'Tag not found' };

    let updated = 0;
    let skipped = 0;
    const taggedContactIds = [];
    for (const id of validatedIds.value) {
      try {
        const existingTags = typeof db.getContactTags === 'function' ? db.getContactTags(id) : [];
        if (!Array.isArray(existingTags)) {
          skipped++;
          continue;
        }
        if (!existingTags.includes(validatedTagId.value)) {
          db.addTagToContact(id, validatedTagId.value);
          taggedContactIds.push(id);
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        skipped++;
      }
    }

    for (const id of taggedContactIds) {
      const contact = typeof db._get === 'function'
        ? db._get('SELECT email FROM contacts WHERE id = ?', [id])
        : null;
      automationEngine?.fire?.('tag_applied', {
        contactId: id,
        email: contact?.email || '',
        tagId: validatedTagId.value
      }).catch(() => {});
    }

    return { success: true, updated, skipped };
  });

  safeHandler('contacts:getRecipientBreakdown', (e, filter) => {
    const validated = validateContactQueryParams(filter);
    if (validated.error) return { error: validated.error };
    const all = db.getContactsForCampaign(validated.value);
    let blacklisted = 0;
    let unsubscribed = 0;
    for (const contact of all) {
      if (db.isBlacklisted(contact.email)) blacklisted++;
      else if (db.isUnsubscribed(contact.email)) unsubscribed++;
    }
    const valid = all.length - blacklisted - unsubscribed;
    return { total: all.length, blacklisted, unsubscribed, valid };
  });

  safeHandler('contacts:import', async () => {
    const result = await showContactImportDialog(dialog, getMainWindow());
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    if (stat.size > 50 * 1024 * 1024) {
      return { success: false, error: 'File too large (max 50MB)' };
    }

    const mimeError = await validateBinaryMime(filePath, ext);
    if (mimeError) {
      return { success: false, error: mimeError };
    }

    const parsed = await readRowsFromFile({
      filePath,
      fs,
      path,
      xlsxOptions: { type: 'buffer', cellFormula: false }
    });
    if (!parsed.success) return parsed;
    if (parsed.rows.length === 0) return { success: false, error: 'No data found in file' };

    const mapped = mapRowsToContacts(parsed.rows);
    if (!mapped.success) return mapped;

    return { success: true, contacts: mapped.contacts, filePath, type: ext.replace('.', '') };
  });

  safeHandler('contacts:importRaw', async () => {
    const result = await showContactImportDialog(dialog, getMainWindow());
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > 50 * 1024 * 1024) {
      return { success: false, error: 'File too large (max 50MB)' };
    }

    const parsed = await readRowsFromFile({ filePath, fs, path });
    if (!parsed.success) return parsed;
    if (parsed.rows.length === 0) return { success: false, error: 'No data found in file' };

    return {
      success: true,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.rows.length,
      autoMapping: buildAutoMapping(parsed.headers, parsed.rows),
      filePath,
      type: parsed.ext.replace('.', '')
    };
  });

  safeHandler('contacts:importFromPath', async (e, filePath) => {
    const validated = validateImportFilePath(filePath);
    if (validated.error) return { success: false, error: validated.error };
    if (!fs.existsSync(validated.value)) return { success: false, error: 'File not found' };
    const ext = path.extname(validated.value).toLowerCase();
    if (!SUPPORTED_CONTACT_EXTENSIONS.includes(ext)) return { success: false, error: 'Unsupported file type' };

    const stat = fs.statSync(validated.value);
    if (stat.size > 50 * 1024 * 1024) return { success: false, error: 'File too large (max 50MB)' };

    const parsed = await readRowsFromFile({
      filePath: validated.value,
      fs,
      path,
      xlsxOptions: { type: 'buffer', cellFormula: false }
    });
    if (!parsed.success) return parsed;
    if (parsed.rows.length === 0) return { success: false, error: 'No data found in file' };

    return {
      success: true,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.rows.length,
      autoMapping: buildAutoMapping(parsed.headers, parsed.rows),
      filePath: validated.value,
      type: ext.replace('.', '')
    };
  });

  safeHandler('contacts:prepareImport', (e, payload) => {
    const validated = validateContactImportPreviewPayload(payload);
    if (validated.error) return { success: false, error: validated.error };
    if (validated.value.listId && !getListRecord(db, validated.value.listId)) {
      return { success: false, error: 'List not found' };
    }
    return prepareContactImport(db, validated.value);
  });

  // =================== CONTACT ENGAGEMENT (Phase 2) ===================
  safeHandler('contacts:updateEngagement', (e, contactId) => {
    const validated = validateId(contactId, 'contactId');
    if (validated.error) return { error: validated.error };
    const score = db.updateContactEngagement(validated.value);
    return { success: true, score };
  });

  safeHandler('contacts:getByEngagement', (e, range) => {
    const minScore = range?.minScore ?? 0;
    const maxScore = range?.maxScore ?? 100;
    return db.getContactsByEngagement(minScore, maxScore);
  });

  safeHandler('contacts:getTopEngaged', (e, limit) => {
    return db.getTopEngagedContacts(limit || 50);
  });

  safeHandler('contacts:getCold', (e, daysInactive) => {
    return db.getColdContacts(daysInactive || 90);
  });

  // =================== RE-ENGAGEMENT FLOWS (Phase 2) ===================
  safeHandler('contacts:createReengagement', (e, payload) => {
    if (!payload || !payload.name || !payload.campaignId) {
      return { error: 'Name and campaignId are required' };
    }
    const result = db.createReengagementSequence(
      payload.name,
      payload.daysInactive || 90,
      payload.campaignId
    );
    return { success: true, ...result };
  });

  safeHandler('contacts:archiveInactive', (e, daysInactive) => {
    const result = db.archiveInactiveContacts(daysInactive || 180);
    return { success: true, ...result };
  });
  // =================== LIST ASSIGNMENT ===================
  safeHandler('contacts:addToListBulk', (e, contactIds, listId) => {
    const validatedIds = validateContactIdList(contactIds, { field: 'contactIds' });
    if (validatedIds.error) return { error: validatedIds.error };

    const validatedListId = validateId(listId, 'listId');
    if (validatedListId.error) return { error: validatedListId.error };

    const list = getListRecord(db, validatedListId.value);
    if (!list) return { error: 'List not found' };

    let updated = 0;
    let skipped = 0;
    for (const contactId of validatedIds.value) {
      try {
        const contact = typeof db._get === 'function'
          ? db._get('SELECT id, listId FROM contacts WHERE id = ?', [contactId])
          : null;
        if (!contact) {
          skipped++;
          continue;
        }
        if (contact.listId === validatedListId.value) {
          skipped++;
          continue;
        }
        db.addContactToList(contactId, validatedListId.value);
        updated++;
      } catch (_) {
        skipped++;
      }
    }
    try { db.flushSave?.(); } catch(_) {}
    return { success: true, updated, skipped };
  });

  safeHandler('contacts:addToList', (e, contactId, listId) => {
    const validatedContactId = validateId(contactId, 'contactId');
    if (validatedContactId.error) return { error: validatedContactId.error };

    const validatedListId = validateId(listId, 'listId');
    if (validatedListId.error) return { error: validatedListId.error };
    if (!getListRecord(db, validatedListId.value)) return { error: 'List not found' };

    db.addContactToList(validatedContactId.value, validatedListId.value);
    return { success: true };
  });

  safeHandler('contacts:removeFromList', (e, contactId, listId) => {
    const validatedContactId = validateId(contactId, 'contactId');
    if (validatedContactId.error) return { error: validatedContactId.error };

    const validatedListId = validateId(listId, 'listId');
    if (validatedListId.error) return { error: validatedListId.error };

    db.removeContactFromList(validatedContactId.value, validatedListId.value);
    return { success: true };
  });

  safeHandler('contacts:getLists', (e, contactId) => {
    const validated = validateId(contactId, 'contactId');
    if (validated.error) return { error: validated.error };
    return db.getContactLists(validated.value);
  });

  // =================== TAG ASSIGNMENT ===================
  safeHandler('contacts:addTag', (e, contactId, tagName) => {
    const validatedContactId = validateId(contactId, 'contactId');
    if (validatedContactId.error) return { error: validatedContactId.error };

    const validatedTagId = validateId(tagName, 'tagId');
    if (validatedTagId.error) return { error: validatedTagId.error };
    if (!getTagRecord(db, validatedTagId.value)) return { error: 'Tag not found' };

    db.addTagToContact(validatedContactId.value, validatedTagId.value);

    const contact = typeof db._get === 'function'
      ? db._get('SELECT email FROM contacts WHERE id = ?', [validatedContactId.value])
      : null;
    automationEngine?.fire?.('tag_applied', {
      contactId: validatedContactId.value,
      email: contact?.email || '',
      tagId: validatedTagId.value
    }).catch(() => {});

    return { success: true };
  });

  safeHandler('contacts:removeTag', (e, contactId, tagName) => {
    const validatedContactId = validateId(contactId, 'contactId');
    if (validatedContactId.error) return { error: validatedContactId.error };

    const validatedTagId = validateId(tagName, 'tagId');
    if (validatedTagId.error) return { error: validatedTagId.error };

    db.removeTagFromContact(validatedContactId.value, validatedTagId.value);
    return { success: true };
  });

  safeHandler('contacts:getTags', (e, contactId) => {
    const validated = validateId(contactId, 'contactId');
    if (validated.error) return { error: validated.error };
    return db.getContactTags(validated.value);
  });

}

module.exports = registerContactsHandlers;
