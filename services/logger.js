const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.ensureLogDir();
    this.currentDate = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `bulky-${this.currentDate}.log`);
    this.errorFile = path.join(this.logDir, `bulky-errors-${this.currentDate}.log`);
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatLog(level, message, data) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (data) {
      logLine += ` | ${JSON.stringify(data)}`;
    }
    return logLine;
  }

  write(level, message, data) {
    // Roll over log file if date has changed
    const _today = new Date().toISOString().split('T')[0];
    if (_today !== this.currentDate) {
      this.currentDate = _today;
      this.logFile = require('path').join(this.logDir, `bulky-${_today}.log`);
      this.errorFile = require('path').join(this.logDir, `bulky-errors-${_today}.log`);
    }
    const logLine = this.formatLog(level, message, data);
    
    try {
      if (level === 'error') {
        fs.appendFileSync(this.errorFile, logLine + '\n');
      }
      fs.appendFileSync(this.logFile, logLine + '\n');
    } catch (e) {
    }
  }

  info(message, data) {
    this.write('INFO', message, data);
  }

  warn(message, data) {
    this.write('WARN', message, data);
  }

  error(message, data) {
    this.write('ERROR', message, data);
  }

  debug(message, data) {
    if (process.env.DEBUG) {
      this.write('DEBUG', message, data);
    }
  }

  // Log service crash with recovery attempt
  logCrash(serviceName, error, attempt = 1) {
    this.error(`${serviceName} crashed`, {
      serviceName,
      message: error?.message,
      stack: error?.stack,
      recoveryAttempt: attempt,
      timestamp: new Date().toISOString()
    });
  }

  // Log IPC error with handler details
  logIpcError(channel, error, args) {
    this.error(`IPC handler error: ${channel}`, {
      channel,
      message: error?.message,
      stack: error?.stack,
      argsLength: args?.length,
      timestamp: new Date().toISOString()
    });
  }

  // Log SMTP connection event
  logSmtp(action, details) {
    this.info(`SMTP ${action}`, {
      action,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // Log campaign milestone
  logCampaign(action, campaignId, details) {
    this.info(`Campaign ${action}`, {
      campaignId,
      action,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // Create metadata summary
  getStats() {
    try {
      const logStats = fs.statSync(this.logFile);
      const errorStats = fs.existsSync(this.errorFile) ? fs.statSync(this.errorFile) : null;
      
      return {
        logFile: this.logFile,
        logSize: logStats.size,
        errorFile: this.errorFile,
        errorSize: errorStats?.size || 0,
        created: this.currentDate
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Cleanup old logs (keep last 7 days)
  cleanupOldLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (e) {
      this.error('Cleanup old logs failed', { error: e.message });
    }
  }
}

module.exports = Logger;
