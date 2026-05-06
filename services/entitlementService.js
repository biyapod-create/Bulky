const PLAN_DEFINITIONS = Object.freeze({
  legacy: Object.freeze({
    id: 'legacy',
    name: 'Local Build',
    mode: 'local',
    description: 'Current local Bulky build with the existing desktop feature set before account-based unlocks are connected.',
    capabilities: Object.freeze({
      analytics: true,
      aiAssistant: true,
      desktopLogin: true,
      hostedTracking: false,
      hostedForms: false,
      realtimeSync: false,
      automaticUpdates: false,
      cloudAiUsage: false
    }),
    limits: Object.freeze({
      maxSmtpAccounts: null,
      maxEmailsPerCycle: null
    })
  }),
  freemium: Object.freeze({
    id: 'freemium',
    name: 'Freemium',
    mode: 'local',
    description: 'Starter local plan with capped sending, capped SMTP rotation, no AI, and no advanced analytics.',
    capabilities: Object.freeze({
      analytics: false,
      aiAssistant: false,
      desktopLogin: true,
      hostedTracking: false,
      hostedForms: false,
      realtimeSync: false,
      automaticUpdates: false,
      cloudAiUsage: false
    }),
    limits: Object.freeze({
      maxSmtpAccounts: 2,
      maxEmailsPerCycle: 2000
    })
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    mode: 'hybrid',
    description: 'Full Bulky desktop capability with hosted tracking, updates, sync, and cloud-backed account services.',
    capabilities: Object.freeze({
      analytics: true,
      aiAssistant: true,
      desktopLogin: true,
      hostedTracking: true,
      hostedForms: true,
      realtimeSync: true,
      automaticUpdates: true,
      cloudAiUsage: true
    }),
    limits: Object.freeze({
      maxSmtpAccounts: null,
      maxEmailsPerCycle: null
    })
  }),
  one_off: Object.freeze({
    id: 'one_off',
    name: 'One-off',
    mode: 'hybrid',
    description: 'Full Bulky capability with a bundled year of hosted services and cloud-backed premium features.',
    capabilities: Object.freeze({
      analytics: true,
      aiAssistant: true,
      desktopLogin: true,
      hostedTracking: true,
      hostedForms: true,
      realtimeSync: true,
      automaticUpdates: true,
      cloudAiUsage: true
    }),
    limits: Object.freeze({
      maxSmtpAccounts: null,
      maxEmailsPerCycle: null
    }),
    serviceWindowMonths: 12
  })
});

const CAPABILITY_LOCKS = Object.freeze({
  analytics: Object.freeze({
    message: 'Advanced statistics are available on Pro and One-off plans.',
    requiredPlans: Object.freeze(['pro', 'one_off'])
  }),
  aiAssistant: Object.freeze({
    message: 'Bulky AI is available on Pro and One-off plans.',
    requiredPlans: Object.freeze(['pro', 'one_off'])
  })
});

function normalizePlanId(planId) {
  const normalized = String(planId || '').trim().toLowerCase();
  if (!normalized) {
    return 'legacy';
  }
  if (normalized === 'oneoff') {
    return 'one_off';
  }
  return PLAN_DEFINITIONS[normalized] ? normalized : 'legacy';
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['active', 'inactive', 'grace', 'expired', 'pending'].includes(normalized)
    ? normalized
    : 'active';
}

function safeParseJson(rawValue) {
  if (!rawValue) {
    return null;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function safeCount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildCapabilityMap(definition, overrides = {}) {
  return {
    ...definition.capabilities,
    ...((overrides && typeof overrides === 'object') ? overrides : {})
  };
}

function buildLimitMap(definition, overrides = {}) {
  const merged = {
    ...definition.limits,
    ...((overrides && typeof overrides === 'object') ? overrides : {})
  };

  const normalizeLimit = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    maxSmtpAccounts: normalizeLimit(merged.maxSmtpAccounts),
    maxEmailsPerCycle: normalizeLimit(merged.maxEmailsPerCycle)
  };
}

function buildCycleWindow(rawState = {}) {
  const startsAt = rawState?.cycle?.startsAt ? String(rawState.cycle.startsAt) : '';
  const endsAt = rawState?.cycle?.endsAt ? String(rawState.cycle.endsAt) : '';
  return {
    startsAt: startsAt || null,
    endsAt: endsAt || null
  };
}

class EntitlementService {
  constructor(db, options = {}) {
    this.db = db;
    this.appVersion = options.appVersion || '';
    this.settingKey = options.settingKey || 'entitlementState';
  }

  _readRawState() {
    const parsed = safeParseJson(this.db?.getSetting?.(this.settingKey));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  }

  _writeRawState(nextState) {
    this.db?.setSetting?.(this.settingKey, JSON.stringify(nextState));
    return this.getState();
  }

  _countSentEmails(startsAt = null, endsAt = null) {
    const clauses = [`status = 'sent'`];
    const params = [];

    if (startsAt) {
      clauses.push('createdAt >= ?');
      params.push(startsAt);
    }
    if (endsAt) {
      clauses.push('createdAt <= ?');
      params.push(endsAt);
    }

    const query = `SELECT COUNT(*) AS count FROM campaign_logs WHERE ${clauses.join(' AND ')}`;
    return safeCount(this.db?._get?.(query, params)?.count);
  }

  _buildUsageSnapshot(cycle = {}) {
    const smtpAccounts = this.db?.getAllSmtpAccounts?.() || [];
    const activeAccounts = smtpAccounts.filter((account) => !!account?.isActive);
    const totalSent = this._countSentEmails();
    const cycleSent = cycle.startsAt || cycle.endsAt
      ? this._countSentEmails(cycle.startsAt, cycle.endsAt)
      : null;
    const contacts = safeCount(this.db?.getContactStats?.()?.total);

    return {
      emailsSentLifetime: totalSent,
      emailsSentInCycle: cycleSent,
      smtpAccountsConfigured: smtpAccounts.length,
      activeSmtpAccounts: activeAccounts.length,
      contacts
    };
  }

  getState() {
    const rawState = this._readRawState();
    const planId = normalizePlanId(rawState.planId);
    const definition = PLAN_DEFINITIONS[planId];
    const cycle = buildCycleWindow(rawState);
    const usage = this._buildUsageSnapshot(cycle);
    const limits = buildLimitMap(definition, rawState.limits);
    const capabilities = buildCapabilityMap(definition, rawState.capabilities);
    const emailsRemaining = Number.isFinite(limits.maxEmailsPerCycle) && limits.maxEmailsPerCycle >= 0
      ? Math.max(limits.maxEmailsPerCycle - safeCount(usage.emailsSentInCycle ?? usage.emailsSentLifetime), 0)
      : null;

    return {
      appVersion: this.appVersion,
      plan: {
        id: definition.id,
        name: definition.name,
        description: definition.description
      },
      mode: rawState.mode || definition.mode,
      source: rawState.source || (definition.id === 'legacy' ? 'local-legacy' : 'local-cached'),
      status: normalizeStatus(rawState.status),
      account: {
        email: rawState?.account?.email ? String(rawState.account.email) : '',
        workspaceName: rawState?.account?.workspaceName ? String(rawState.account.workspaceName) : ''
      },
      cycle,
      limits,
      capabilities,
      usage: {
        ...usage,
        emailsRemainingInCycle: emailsRemaining
      },
      updatedAt: rawState.updatedAt || null,
      lastValidatedAt: rawState.lastValidatedAt || null,
      graceEndsAt: rawState.graceEndsAt || null,
      serviceWindowEndsAt: rawState.serviceWindowEndsAt || null
    };
  }

  hasCapability(capability) {
    return !!this.getState().capabilities?.[capability];
  }

  getLimit(limitKey) {
    const limitValue = this.getState().limits?.[limitKey];
    return Number.isFinite(limitValue) ? limitValue : null;
  }

  getCapabilityLock(capability) {
    const state = this.getState();
    const lock = CAPABILITY_LOCKS[capability];
    return {
      capability,
      currentPlan: state.plan.id,
      requiredPlans: lock?.requiredPlans || [],
      message: lock?.message || 'This feature is not available on the current plan.'
    };
  }

  requireCapability(capability) {
    if (this.hasCapability(capability)) {
      return null;
    }

    const lock = this.getCapabilityLock(capability);
    return {
      error: lock.message,
      code: 'capability_locked',
      capability: lock.capability,
      currentPlan: lock.currentPlan,
      requiredPlans: lock.requiredPlans
    };
  }

  canAddSmtpAccount(currentCount) {
    const maxSmtpAccounts = this.getLimit('maxSmtpAccounts');
    if (!Number.isFinite(maxSmtpAccounts)) {
      return { allowed: true };
    }

    if (Number(currentCount || 0) < maxSmtpAccounts) {
      return { allowed: true };
    }

    return {
      allowed: false,
      error: `Your current plan allows up to ${maxSmtpAccounts} SMTP account${maxSmtpAccounts === 1 ? '' : 's'}. Upgrade to Pro or One-off to add more.`,
      code: 'smtp_account_limit_reached',
      maxSmtpAccounts
    };
  }

  applyCloudState(payload = {}) {
    const current = this._readRawState();
    const planId = normalizePlanId(payload.planId || current.planId || 'freemium');
    const definition = PLAN_DEFINITIONS[planId];
    const updatedAt = payload.updatedAt || new Date().toISOString();

    return this._writeRawState({
      ...current,
      planId,
      mode: payload.mode || definition.mode,
      source: payload.source || 'cloud-supabase',
      status: normalizeStatus(payload.status || current.status || 'active'),
      account: {
        email: payload?.account?.email ? String(payload.account.email) : '',
        workspaceName: payload?.account?.workspaceName ? String(payload.account.workspaceName) : ''
      },
      cycle: payload?.cycle && typeof payload.cycle === 'object'
        ? buildCycleWindow(payload)
        : buildCycleWindow(current),
      limits: payload?.limits && typeof payload.limits === 'object'
        ? payload.limits
        : current.limits,
      capabilities: payload?.capabilities && typeof payload.capabilities === 'object'
        ? payload.capabilities
        : current.capabilities,
      updatedAt,
      lastValidatedAt: payload.lastValidatedAt || updatedAt,
      graceEndsAt: payload.graceEndsAt || null,
      serviceWindowEndsAt: payload.serviceWindowEndsAt || current.serviceWindowEndsAt || null
    });
  }

  resetToLocalLegacy() {
    return this._writeRawState({
      planId: 'legacy',
      mode: 'local',
      source: 'local-legacy',
      status: 'active',
      account: {
        email: '',
        workspaceName: ''
      },
      cycle: {
        startsAt: null,
        endsAt: null
      },
      updatedAt: new Date().toISOString(),
      lastValidatedAt: null,
      graceEndsAt: null,
      serviceWindowEndsAt: null
    });
  }
}

module.exports = {
  EntitlementService,
  PLAN_DEFINITIONS,
  normalizePlanId
};
