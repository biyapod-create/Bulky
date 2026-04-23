const {
  validateBulkContactsInput,
  validateContactIdList,
  validateContactInput,
  validateContactQueryParams,
  validateContactVerificationStatus,
  validateId,
  validateImportFilePath
} = require('./validators');

const SUPPORTED_CONTACT_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json', '.txt'];
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

function registerContactsHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  path,
  getMainWindow
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
  safeHandler('contacts:add', (e, contact) => {
    const validated = validateContactInput(contact);
    if (validated.error) return { success: false, error: validated.error };
    const result = db.addContact(validated.value);
    if (result && result.error) return result;
    return { success: true, id: result };
  });
  safeHandler('contacts:addBulk', (e, contacts) => {
    const validated = validateBulkContactsInput(contacts);
    if (validated.error) return { error: validated.error };
    return db.addBulkContacts(validated.value);
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

    let updated = 0;
    for (const id of validatedIds.value) {
      try {
        const contact = db._get('SELECT * FROM contacts WHERE id = ?', [id]);
        if (!contact) continue;
        const tags = JSON.parse(contact.tags || '[]');
        if (!tags.includes(validatedTagId.value)) {
          tags.push(validatedTagId.value);
          db._run("UPDATE contacts SET tags = ?, updatedAt = datetime('now') WHERE id = ?", [JSON.stringify(tags), id]);
          updated++;
        }
      } catch (error) {}
    }
    return { success: true, updated };
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
}

module.exports = registerContactsHandlers;
