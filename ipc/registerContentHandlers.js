const {
  validateExportContactsInput,
  validateExportLogsInput,
  validateId,
  validateTemplateBlocksPayload,
  validateTemplateCategory,
  validateTemplateExportPayload,
  validateTemplateFileExportPayload,
  validateTemplateInput,
  validateVerificationResultsExportInput
} = require('./validators');

function registerContentHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  path,
  getMainWindow
}) {
  safeHandler('templates:getAll', () => db.getAllTemplates());
  safeHandler('templates:getByCategory', (e, category) => {
    const validated = validateTemplateCategory(category);
    if (validated.error) return { error: validated.error };
    return db.getTemplatesByCategory(validated.value);
  });
  safeHandler('templates:getWithBlocks', (e, templateId) => {
    const validated = validateId(templateId, 'templateId');
    if (validated.error) return { error: validated.error };
    return db.getTemplateWithBlocks(validated.value);
  });
  safeHandler('templates:saveBlocks', (e, data) => {
    const validated = validateTemplateBlocksPayload(data);
    if (validated.error) return { error: validated.error };
    db.saveTemplateBlocks(validated.value);
    return { success: true };
  });
  safeHandler('templates:getCategories', () => db.getTemplateCategories());
  safeHandler('templates:add', (e, template) => {
    const validated = validateTemplateInput(template);
    if (validated.error) return { error: validated.error };
    return db.addTemplate(validated.value);
  });
  safeHandler('templates:update', (e, template) => {
    const validated = validateTemplateInput(template, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateTemplate(validated.value);
    return { success: true };
  });
  safeHandler('templates:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteTemplate(validated.value);
    return { success: true };
  });

  safeHandler('templates:importFile', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Template',
      filters: [
        { name: 'Template Files', extensions: ['html', 'htm', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, path.extname(filePath));

    if (ext === '.json') {
      try {
        const parsed = JSON.parse(raw);
        db.addTemplate({
          name: parsed.name || baseName,
          subject: parsed.subject || '',
          content: parsed.content || raw,
          category: parsed.category || 'general'
        });
      } catch (error) {
        return { error: 'Invalid JSON template file' };
      }
    } else {
      db.addTemplate({
        name: baseName,
        subject: '',
        content: raw,
        category: 'general'
      });
    }
    return { success: true };
  });

  safeHandler('templates:exportTemplate', async (e, data) => {
    const validated = validateTemplateExportPayload(data);
    if (validated.error) return { error: validated.error };

    const { template, filename } = validated.value;
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Template',
      defaultPath: filename || 'template.html',
      filters: [
        { name: 'HTML Files', extensions: ['html'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { canceled: true };
    fs.writeFileSync(result.filePath, template.content || '');
    return { success: true, filePath: result.filePath };
  });

  safeHandler('export:contacts', async (e, contacts) => {
    const validated = validateExportContactsInput(contacts);
    if (validated.error) return { error: validated.error };

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Contacts',
      defaultPath: 'contacts.csv',
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'Excel Files', extensions: ['xlsx'] }
      ]
    });
    if (result.canceled) return { canceled: true };

    const data = validated.value && validated.value.length > 0 ? validated.value : db.getAllContacts();
    const ext = path.extname(result.filePath).toLowerCase();

    if (ext === '.json') {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    } else if (ext === '.xlsx') {
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
      XLSX.writeFile(wb, result.filePath);
    } else {
      const headers = ['email', 'firstName', 'lastName', 'company', 'phone', 'tags', 'verificationStatus'];
      const lines = [headers.join(',')];
      for (const contact of data) {
        lines.push(headers.map((header) => `"${(contact[header] || '').toString().replace(/"/g, '""')}"`).join(','));
      }
      fs.writeFileSync(result.filePath, lines.join('\n'));
    }
    return { success: true, path: result.filePath };
  });

  safeHandler('export:logs', async (e, logs) => {
    const validated = validateExportLogsInput(logs);
    if (validated.error) return { error: validated.error };

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Campaign Logs',
      defaultPath: 'campaign-logs.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (result.canceled) return { canceled: true };
    const headers = ['email', 'status', 'variant', 'smtpCode', 'failureReason', 'createdAt'];
    const lines = [headers.join(',')];
    for (const log of validated.value) {
      lines.push(headers.map((header) => `"${(log[header] || '').toString().replace(/"/g, '""')}"`).join(','));
    }
    fs.writeFileSync(result.filePath, lines.join('\n'));
    return { success: true, path: result.filePath };
  });

  safeHandler('export:blacklist', async () => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Blacklist',
      defaultPath: 'blacklist.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (result.canceled) return { canceled: true };
    const data = db.getAllBlacklist();
    const headers = ['email', 'domain', 'reason', 'source', 'createdAt'];
    const lines = [headers.join(',')];
    for (const entry of data) {
      lines.push(headers.map((header) => `"${(entry[header] || '').toString().replace(/"/g, '""')}"`).join(','));
    }
    fs.writeFileSync(result.filePath, lines.join('\n'));
    return { success: true, path: result.filePath };
  });

  safeHandler('export:verificationResults', async (e, results) => {
    const validated = validateVerificationResultsExportInput(results);
    if (validated.error) return { error: validated.error };

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Verification Results',
      defaultPath: 'verification-results.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (result.canceled) return { canceled: true };
    const headers = ['email', 'status', 'score', 'reason', 'inboxProvider', 'isDisposable', 'isRoleBased', 'isCatchAll'];
    const lines = [headers.join(',')];
    for (const entry of validated.value) {
      const row = [
        entry.email,
        entry.status,
        entry.score,
        entry.reason || '',
        entry.details?.inboxProvider || '',
        entry.details?.isDisposable ? 'Yes' : 'No',
        entry.details?.isRoleBased ? 'Yes' : 'No',
        entry.details?.isCatchAll ? 'Yes' : 'No'
      ];
      lines.push(row.map((value) => `"${(value || '').toString().replace(/"/g, '""')}"`).join(','));
    }
    fs.writeFileSync(result.filePath, lines.join('\n'));
    return { success: true, path: result.filePath };
  });

  safeHandler('export:templateFile', async (e, data) => {
    const validated = validateTemplateFileExportPayload(data);
    if (validated.error) return { error: validated.error };

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Template',
      defaultPath: validated.value.filename || 'template.html',
      filters: [{ name: 'HTML Files', extensions: ['html'] }]
    });
    if (result.canceled) return { canceled: true };
    fs.writeFileSync(result.filePath, validated.value.data || '');
    return { success: true, path: result.filePath };
  });
}

module.exports = registerContentHandlers;
