const {
  validateDomainInput,
  validateId,
  validateRetryClearInput,
  validateSearchQuery,
  validateSegment,
  validateSegmentFilters,
  validateSmtpSettings,
  validateWarmupAutoGenerate,
  validateWarmupSchedule
} = require('./validators');

function registerOperationsHandlers({
  safeHandler,
  db,
  decryptPassword,
  domainHealthService,
  getConfiguredDkimSelectors
}) {
  safeHandler('stats:getDashboard', () => {
    const stats = db.getDashboardStats();

    try {
      stats.retryQueue = db.getRetryQueueStats();
    } catch {
      stats.retryQueue = { pending: 0, completed: 0, failed: 0 };
    }

    try {
      const accounts = db.getAllSmtpAccounts();
      stats.smtpHealth = accounts.map((account) => ({
        id: account.id,
        name: account.name || account.fromEmail || account.host,
        host: account.host,
        isActive: !!account.isActive,
        sentToday: account.sentToday || 0,
        dailyLimit: account.dailyLimit,
        health: db.getDeliverabilityScore(account.id),
        warmUpEnabled: !!account.warmUpEnabled
      }));
    } catch {}

    return stats;
  });

  safeHandler('warmup:getSchedules', () => db.getWarmupSchedules());
  safeHandler('warmup:create', (e, schedule) => {
    const validated = validateWarmupSchedule(schedule, { requireSmtpAccountId: true });
    if (validated.error) return { error: validated.error };
    return db.createWarmupSchedule(validated.value);
  });
  safeHandler('warmup:update', (e, schedule) => {
    const validated = validateWarmupSchedule(schedule, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateWarmupSchedule(validated.value);
    return { success: true };
  });
  safeHandler('warmup:delete', (e, scheduleId) => {
    const validated = validateId(scheduleId, 'scheduleId');
    if (validated.error) return { error: validated.error };
    db.deleteWarmupSchedule(validated.value);
    return { success: true };
  });

  safeHandler('segments:getAll', () => db.getAllSegments());
  safeHandler('segments:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getSegment(validated.value);
  });
  safeHandler('segments:add', (e, segment) => {
    const validated = validateSegment(segment);
    if (validated.error) return { error: validated.error };
    const id = db.addSegment(validated.value);
    return { success: true, id };
  });
  safeHandler('segments:update', (e, segment) => {
    const validated = validateSegment(segment, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateSegment(validated.value);
    return { success: true };
  });
  safeHandler('segments:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteSegment(validated.value);
    return { success: true };
  });
  safeHandler('segments:getContacts', (e, filters) => {
    const validated = validateSegmentFilters(filters);
    if (validated.error) return { error: validated.error };
    return db.getSegmentContacts(validated.value);
  });
  safeHandler('segments:count', (e, filters) => {
    const validated = validateSegmentFilters(filters);
    if (validated.error) return { error: validated.error };
    const contacts = db.getSegmentContacts(validated.value);
    return { count: contacts.length };
  });

  safeHandler('retry:getStats', () => db.getRetryQueueStats());
  safeHandler('retry:clear', (e, campaignId) => {
    const validated = validateRetryClearInput(campaignId);
    if (validated.error) return { error: validated.error };
    db.clearRetryQueue(validated.value || undefined);
    return { success: true };
  });

  safeHandler('deliverability:getHistory', (e, smtpAccountId) => {
    const validated = validateId(smtpAccountId, 'smtpAccountId');
    if (validated.error) return { error: validated.error };
    return db.getDeliverabilityHistory(validated.value, 30);
  });
  safeHandler('deliverability:getScore', (e, smtpAccountId) => {
    const validated = validateId(smtpAccountId, 'smtpAccountId');
    if (validated.error) return { error: validated.error };
    return { score: db.getDeliverabilityScore(validated.value) };
  });

  safeHandler('search:global', (e, query) => {
    const validated = validateSearchQuery(query);
    if (validated.error) return { error: validated.error };
    if (!validated.value || validated.value.length < 2) return { contacts: [], campaigns: [], templates: [] };
    return db.globalSearch(validated.value);
  });

  safeHandler('smtp:testDetailed', async (e, account) => {
    const validated = validateSmtpSettings(account, { requireCredentials: true });
    if (validated.error) return { success: false, error: validated.error, steps: [] };

    const nodemailer = require('nodemailer');
    const steps = [];
    let transporter;

    try {
      steps.push({ step: 'connect', status: 'running', message: 'Connecting to server...' });
      const decrypted = validated.value.password
        ? { ...validated.value, password: decryptPassword(validated.value.password) }
        : validated.value;

      transporter = nodemailer.createTransport({
        host: decrypted.host,
        port: decrypted.port || 587,
        secure: decrypted.secure === true || decrypted.secure === 1 || decrypted.port === 465,
        auth: { user: decrypted.username, pass: decrypted.password },
        tls: { rejectUnauthorized: decrypted.rejectUnauthorized !== 0 },
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });

      steps[0] = { step: 'connect', status: 'pass', message: `Connected to ${decrypted.host}:${decrypted.port || 587}` };

      steps.push({ step: 'auth', status: 'running', message: 'Authenticating...' });
      await transporter.verify();
      steps[1] = { step: 'auth', status: 'pass', message: 'Authentication successful' };

      steps.push({ step: 'from', status: 'pass', message: `From: ${decrypted.fromEmail || decrypted.username}` });
      steps.push({ step: 'tls', status: 'pass', message: decrypted.port === 465 ? 'SSL/TLS (port 465)' : 'STARTTLS (port 587)' });

      return { success: true, steps, message: 'All tests passed' };
    } catch (error) {
      const failedStep = steps.findIndex((step) => step.status === 'running');
      if (failedStep >= 0) {
        steps[failedStep] = { ...steps[failedStep], status: 'fail', message: error.message };
      }
      return { success: false, steps, error: error.message };
    } finally {
      if (transporter) {
        try {
          transporter.close();
        } catch {}
      }
    }
  });

  safeHandler('dns:check', async (e, domain) => {
    const validated = validateDomainInput(domain);
    if (validated.error) return { error: validated.error };

    return domainHealthService.checkDomain(validated.value, {
      selectors: getConfiguredDkimSelectors(validated.value)
    });
  });

  safeHandler('warmup:autoGenerate', (e, payload) => {
    const validated = validateWarmupAutoGenerate(payload);
    if (validated.error) return { error: validated.error };

    const { smtpAccountId, startVolume, targetVolume, daysToTarget } = validated.value;
    const days = daysToTarget;
    const start = startVolume;
    const target = targetVolume;
    const schedule = [];

    for (let i = 0; i < days; i++) {
      const progress = i / (days - 1);
      const volume = Math.round(start + (target - start) * Math.pow(progress, 1.5));
      schedule.push({
        day: i + 1,
        volume: Math.min(volume, target),
        date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0]
      });
    }

    const id = db.createWarmupSchedule({ smtpAccountId, schedule, isActive: true });
    return { success: true, id, schedule };
  });
}

module.exports = registerOperationsHandlers;
