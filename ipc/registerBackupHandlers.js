const { validateAutoBackupConfig } = require('./validators');

function registerBackupHandlers({
  safeHandler,
  db,
  dialog,
  fs,
  app,
  logger,
  emailService,
  cleanup,
  dbPath,
  logDir,
  getMainWindow
}) {
  safeHandler('backup:create', async () => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Create Backup',
      defaultPath: `bulky-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'Database Files', extensions: ['db'] }]
    });
    if (result.canceled) return { canceled: true };
    db.flushSave();
    return db.createBackup(result.filePath);
  });

  safeHandler('backup:restore', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Restore Backup',
      filters: [{ name: 'Database Files', extensions: ['db'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const confirmResult = await dialog.showMessageBox(getMainWindow(), {
      type: 'warning',
      title: 'Confirm Restore',
      message: 'Restoring a backup will replace all current data. Are you sure?',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
      cancelId: 0
    });

    if (confirmResult.response === 0) return { canceled: true };
    return db.restoreFromBackup(result.filePaths[0]);
  });

  safeHandler('backup:getInfo', () => db.getBackupInfo());
  safeHandler('backup:getHistory', () => db.getBackupHistory());
  safeHandler('backup:autoConfig', (e, config) => {
    const validated = validateAutoBackupConfig(config);
    if (validated.error) return { error: validated.error };

    db.setSetting('autoBackup', validated.value);
    return { success: true };
  });
  safeHandler('backup:getAutoConfig', () => {
    const setting = db.getSetting('autoBackup');
    if (!setting) return { enabled: false, intervalHours: 24 };
    return typeof setting === 'string' ? JSON.parse(setting) : setting;
  });

  safeHandler('system:resetAll', async () => {
    try {
      logger?.info('System reset requested by user');

      try {
        emailService?.stop?.();
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));

      cleanup();

      try {
        db?.close?.();
      } catch {}

      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      } catch (error) {
        logger?.error('Failed deleting DB during reset', { error: error.message });
      }

      try {
        if (fs.existsSync(logDir)) fs.rmSync(logDir, { recursive: true, force: true });
      } catch (error) {
        logger?.error('Failed deleting logs during reset', { error: error.message });
      }

      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (error) {
      logger?.error('System reset failed', { error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerBackupHandlers;
