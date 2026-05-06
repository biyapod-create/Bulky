const path = require('path');

const { getTrayIconPath } = require('../windowShell');

describe('main-process window shell', () => {
  it('prefers a packaged icon when one exists in resources', () => {
    const existingPaths = new Set([
      path.join('C:\\BulkyResources', 'icon.ico')
    ]);

    const iconPath = getTrayIconPath({
      fs: {
        existsSync: (targetPath) => existingPaths.has(targetPath)
      },
      path,
      baseDir: 'C:\\Users\\Allen\\Desktop\\Bulky',
      resourcesPath: 'C:\\BulkyResources',
      execPath: 'C:\\Program Files\\Bulky\\Bulky.exe'
    });

    expect(iconPath).toBe(path.join('C:\\BulkyResources', 'icon.ico'));
  });

  it('falls back to the local assets icon when packaged resources are missing', () => {
    const assetsPath = path.join('C:\\Users\\Allen\\Desktop\\Bulky', 'assets', 'icon.ico');

    const iconPath = getTrayIconPath({
      fs: {
        existsSync: (targetPath) => targetPath === assetsPath
      },
      path,
      baseDir: 'C:\\Users\\Allen\\Desktop\\Bulky',
      resourcesPath: 'C:\\MissingResources',
      execPath: 'C:\\Program Files\\Bulky\\Bulky.exe'
    });

    expect(iconPath).toBe(assetsPath);
  });
});
