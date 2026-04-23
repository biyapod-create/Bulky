const fs = require('fs');
const path = require('path');
const os = require('os');

class CrashReporter {
  constructor(logDir, appVersion) {
    this.logDir = logDir;
    this.appVersion = appVersion || 'unknown';
    this.crashDir = path.join(logDir, 'crashes');
    this._ensureDir();
    this._cleanOldReports();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.crashDir)) fs.mkdirSync(this.crashDir, { recursive: true });
    } catch (e) {}
  }

  _cleanOldReports() {
    try {
      const files = fs.readdirSync(this.crashDir);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      for (const file of files) {
        const fp = path.join(this.crashDir, file);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > maxAge) fs.unlinkSync(fp);
      }
    } catch (e) {}
  }

  report(type, error, extra = {}) {
    const timestamp = new Date().toISOString();
    const report = {
      timestamp,
      type,
      version: this.appVersion,
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'N/A',
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
        free: Math.round(os.freemem() / 1024 / 1024) + 'MB',
        processUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      },
      error: {
        message: error?.message || String(error),
        stack: error?.stack || 'No stack trace',
        code: error?.code || null
      },
      extra
    };

    const filename = `crash-${timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.crashDir, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    } catch (e) {
      console.error('CrashReporter: failed to write report:', e.message);
    }

    return { filepath, report };
  }

  getRecentReports(limit = 10) {
    try {
      const files = fs.readdirSync(this.crashDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.crashDir, f), 'utf8'));
        } catch (e) { return null; }
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  getReportCount() {
    try {
      return fs.readdirSync(this.crashDir).filter(f => f.endsWith('.json')).length;
    } catch (e) { return 0; }
  }
}

module.exports = CrashReporter;
