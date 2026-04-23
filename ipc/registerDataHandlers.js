const {
  validateBlacklistEntries,
  validateBlacklistEntry,
  validateId,
  validateListInput,
  validateTagInput,
  validateUnsubscribeInput,
  validateVerifyEmailInput
} = require('./validators');

function registerDataHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  getMainWindow
}) {
  safeHandler('tags:getAll', () => db.getAllTags());
  safeHandler('tags:add', (e, tag) => {
    const validated = validateTagInput(tag);
    if (validated.error) return { error: validated.error };
    return db.addTag(validated.value);
  });
  safeHandler('tags:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteTag(validated.value);
    return { success: true };
  });

  safeHandler('lists:getAll', () => db.getAllLists());
  safeHandler('lists:add', (e, list) => {
    const validated = validateListInput(list);
    if (validated.error) return { error: validated.error };
    return db.addList(validated.value);
  });
  safeHandler('lists:update', (e, list) => {
    const validated = validateListInput(list, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateList(validated.value);
    return { success: true };
  });
  safeHandler('lists:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteList(validated.value);
    return { success: true };
  });
  safeHandler('lists:getContacts', (e, listId) => {
    const validated = validateId(listId, 'listId');
    if (validated.error) return { error: validated.error };
    return db.getListContacts(validated.value);
  });

  safeHandler('blacklist:getAll', () => db.getAllBlacklist());
  safeHandler('blacklist:add', (e, entry) => {
    const validated = validateBlacklistEntry(entry);
    if (validated.error) return { error: validated.error };
    return db.addToBlacklist(validated.value);
  });
  safeHandler('blacklist:addBulk', (e, entries) => {
    const validated = validateBlacklistEntries(entries);
    if (validated.error) return { error: validated.error };
    return db.addBulkToBlacklist(validated.value);
  });
  safeHandler('blacklist:remove', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.removeFromBlacklist(validated.value);
    return { success: true };
  });
  safeHandler('blacklist:check', (e, email) => {
    const validated = validateVerifyEmailInput(email);
    if (validated.error) return { error: validated.error };
    return db.isBlacklisted(validated.value);
  });

  safeHandler('blacklist:import', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Blacklist',
      filters: [
        { name: 'Text/CSV Files', extensions: ['csv', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    const emails = content.split(/[\r\n,;]+/).map((entry) => entry.trim()).filter((entry) => entry.includes('@'));
    const blacklistEntries = emails.map((email) => ({ email, reason: 'Imported', source: 'import' }));
    return db.addBulkToBlacklist(blacklistEntries);
  });

  safeHandler('bounces:autoBlacklist', () => db.autoBlacklistBounced());

  safeHandler('unsubscribes:getAll', () => db.getAllUnsubscribes());
  safeHandler('unsubscribes:add', (e, data) => {
    const validated = validateUnsubscribeInput(data);
    if (validated.error) return { error: validated.error };
    db.addUnsubscribe(validated.value.email, validated.value.campaignId, validated.value.reason);
    return { success: true };
  });
  safeHandler('unsubscribes:remove', (e, email) => {
    const validated = validateVerifyEmailInput(email);
    if (validated.error) return { error: validated.error };
    db.removeUnsubscribe(validated.value);
    return { success: true };
  });
  safeHandler('unsubscribes:check', (e, email) => {
    const validated = validateVerifyEmailInput(email);
    if (validated.error) return { error: validated.error };
    return db.isUnsubscribed(validated.value);
  });
}

module.exports = registerDataHandlers;
