function createWindow({
  BrowserWindow,
  screen,
  app,
  fs,
  path,
  baseDir,
  getTray,
  onClosed
}) {
  const workAreaSize = screen?.getPrimaryDisplay?.()?.workAreaSize || { width: 1440, height: 900 };
  const initialWidth = Math.max(1100, Math.min(1560, workAreaSize.width - 64));
  const initialHeight = Math.max(760, Math.min(960, workAreaSize.height - 64));

  const mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 960,
    minHeight: 600,
    center: true,
    frame: false,
    webPreferences: {
      preload: path.join(baseDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(baseDir, 'assets', 'icon.ico'),
    show: false
  });

  const rendererPath = path.join(baseDir, 'renderer', 'build', 'index.html');
  if (fs.existsSync(rendererPath)) {
    mainWindow.loadFile(rendererPath);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      const tray = getTray?.();
      if (tray && !app._trayHintShown) {
        app._trayHintShown = true;
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: 'Bulky is still running',
            content: 'Bulky is running in the background. Click the tray icon to reopen it.'
          });
        } catch {}
      }
    }
  });

  mainWindow.on('closed', () => {
    onClosed?.();
  });

  return mainWindow;
}

function getTrayIconPath({ fs, path, baseDir, resourcesPath, execPath }) {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'icon.ico'),
    path.join(baseDir, 'assets', 'icon.ico'),
    path.join(path.dirname(execPath), 'resources', 'icon.ico'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }

  return null;
}

function createTray({
  Tray,
  Menu,
  nativeImage,
  app,
  fs,
  path,
  baseDir,
  resourcesPath,
  execPath,
  logger,
  appVersion,
  getMainWindow,
  openWindow,
  cleanup
}) {
  const iconFilePath = getTrayIconPath({
    fs,
    path,
    baseDir,
    resourcesPath,
    execPath
  });

  let trayImage = null;

  if (iconFilePath) {
    try {
      trayImage = nativeImage.createFromPath(iconFilePath);
      if (!trayImage.isEmpty()) {
        trayImage = trayImage.resize({ width: 16, height: 16 });
      }
    } catch (error) {
      logger?.warn('Tray icon load failed', { error: error.message, path: iconFilePath });
    }
  }

  if (!trayImage || trayImage.isEmpty()) {
    const fallbackPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HgAHggJ/PchI6QAAAABJRU5ErkJggg==';
    try {
      trayImage = nativeImage.createFromDataURL(fallbackPng);
      trayImage = trayImage.resize({ width: 16, height: 16 });
    } catch {
      trayImage = nativeImage.createEmpty();
    }
  }

  const tray = new Tray(trayImage);

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Open Bulky',
      click: () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          openWindow();
        }
      }
    },
    {
      label: 'Settings',
      click: () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('navigate:page', '/settings');
          }
        } else {
          openWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Bulky v${appVersion}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit Bulky',
      click: () => {
        app.isQuitting = true;
        cleanup();
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`Bulky Email Sender v${appVersion}`);
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      openWindow();
      return;
    }
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      openWindow();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

module.exports = {
  createWindow,
  createTray,
  getTrayIconPath
};
