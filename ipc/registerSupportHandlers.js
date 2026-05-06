const {
  validateAiGeneratePayload,
  validateAiImproveSubjectPayload,
  validateAiSettings,
  validateId,
  validateSpamAnalysisPayload,
  validateSpamAutoFixPayload,
  validateSpamReplacementItem,
  validateSubjectContentPayload,
  validateSuggestionWord,
  validateTrackingEvent
} = require('./validators');

// ─── Input sanitisation helpers ───────────────────────────────────────────────
function sanitiseString(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitiseEmail(val) {
  const s = sanitiseString(val, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

function requireString(val, label, maxLen = 500) {
  const s = sanitiseString(val, maxLen);
  if (!s) return { error: `${label} is required and must be a non-empty string` };
  return { value: s };
}

function readStoredAiSettings(db) {
  try {
    const raw = db.getSetting('ai');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ─── Context builder (shared by chat & getAppContext) ─────────────────────────
function buildAppContext(db) {
  try {
    const contacts  = db.getAllContacts?.()?.length  ?? db.getContactCount?.()  ?? 0;
    const lists     = db.getAllLists?.()?.length     ?? 0;
    const campaigns = db.getAllCampaigns?.()?.length ?? db.getCampaignCount?.() ?? 0;
    const templates = db.getAllTemplates?.()?.length ?? 0;
    const smtp      = db.getAllSmtpAccounts?.()      ?? [];
    const contactStats   = db.getContactStats?.()   ?? {};
    const unverified     = db.getContactsNeedingVerificationCount?.() ?? 0;
    const memories       = db.getAllAIMemories?.()   ?? [];
    const deliverability = db.getDeliverabilitySnapshot?.() ?? {};

    // Recent campaigns (last 5)
    const allCampaigns   = db.getAllCampaigns?.() ?? [];
    const recentCampaigns = allCampaigns.slice(-5).reverse().map(c => ({
      id: c.id, name: c.name, status: c.status,
      sent: c.sentCount || 0, openRate: c.openRate || 0
    }));

    // Recent contacts (last 5)
    const allContacts     = db.getAllContacts?.() ?? [];
    const recentContacts  = allContacts.slice(-5).reverse().map(c => ({
      email: c.email, verificationStatus: c.verificationStatus || 'unverified'
    }));

    return {
      contacts, lists, campaigns, templates,
      verified: contactStats.verified || 0,
      unverifiedContacts: unverified,
      smtpAccounts: Array.isArray(smtp) ? smtp.length : 0,
      smtpActive:   Array.isArray(smtp) ? smtp.filter(a => a.isActive).length : 0,
      recentCampaigns,
      recentContacts,
      deliverability,
      bounceRate: deliverability.bounceRate || 0,
      memories: memories.slice(0, 15).map(m => `${m.key}: ${m.value}`).join('\n'),
      appName: 'Bulky Email Sender',
      version: (() => { try { return require('../package.json').version; } catch { return '6.x'; } })()
    };
  } catch { return {}; }
}

function getAssistantCapabilities() {
  return {
    actions: [
      'navigate',
      'openSettings',
      'createCampaign',
      'createTemplate',
      'verifyContact',
      'verifyAllUnverified',
      'searchContacts',
      'getContactDetails',
      'getUnverifiedContacts',
      'deleteContact',
      'createList',
      'addContactToList',
      'tagContact',
      'getDeliverabilitySnapshot',
      'runDeliverabilityTest',
      'checkDomainHealth',
      'getRecentCampaigns',
      'getCampaignStats',
      'generateTemplate',
      'remember',
      'recall'
    ],
    templateFormats: ['html', 'blocks'],
    templateTones: ['professional', 'friendly', 'casual', 'urgent', 'warm', 'bold'],
    verificationModes: ['single', 'bulk'],
    providers: ['openrouter', 'lmstudio']
  };
}

function registerSupportHandlers({
  safeHandler,
  db,
  spamService,
  aiService,
  verificationService,
  domainHealthService,
  decryptPassword,
  encryptPassword,
  entitlementService
}) {
  const requireAiCapability = () => entitlementService?.requireCapability?.('aiAssistant') || null;

  // ── Spam handlers ──────────────────────────────────────────────────────────
  safeHandler('spam:check', (e, data) => {
    const v = validateSpamAnalysisPayload(data);
    if (v.error) return { error: v.error };
    return spamService.analyzeContent(v.value.subject, v.value.content);
  });
  safeHandler('spam:autoFix', (e, data) => {
    const v = validateSpamAutoFixPayload(data);
    if (v.error) return { error: v.error };
    return spamService.autoFix(v.value.subject, v.value.content, v.value.issues);
  });
  safeHandler('spam:getSuggestions',   (e, word) => { const v = validateSuggestionWord(word); if (v.error) return { error: v.error }; return spamService.getSuggestions(v.value); });
  safeHandler('spam:getReplacements',  ()        => db.getAllSpamReplacements());
  safeHandler('spam:addReplacement',   (e, item) => { const v = validateSpamReplacementItem(item); if (v.error) return { error: v.error }; return db.addSpamReplacement(v.value); });
  safeHandler('spam:updateReplacement',(e, item) => { const v = validateSpamReplacementItem(item, { requireId: true }); if (v.error) return { error: v.error }; db.updateSpamReplacement(v.value); return { success: true }; });
  safeHandler('spam:deleteReplacement',(e, id)   => { const v = validateId(id, 'id'); if (v.error) return { error: v.error }; db.deleteSpamReplacement(v.value); return { success: true }; });

  // ── Tracking handlers ──────────────────────────────────────────────────────
  safeHandler('tracking:addEvent', (e, event) => {
    const v = validateTrackingEvent(event);
    if (v.error) return { error: v.error };
    db.addTrackingEvent(v.value);
    return { success: true };
  });
  safeHandler('tracking:getEvents', (e, campaignId) => {
    const v = validateId(campaignId, 'campaignId');
    if (v.error) return { error: v.error };
    return db.getTrackingEvents(v.value);
  });

  // ── AI settings ────────────────────────────────────────────────────────────
  safeHandler('ai:getSettings', () => {
    const parsed = readStoredAiSettings(db);
    return {
      enabled: parsed.enabled !== false,
      apiKey: '',
      hasApiKey: !!parsed.apiKey,
      model: parsed.model || '',
      provider: parsed.provider || 'openrouter',
      lmstudioBaseUrl: parsed.lmstudioBaseUrl || 'http://localhost:1234/v1'
    };
  });

  safeHandler('ai:getDiagnostics', async () => {
    const capabilityError = requireAiCapability();
    if (capabilityError) {
      return {
        enabled: false,
        provider: 'openrouter',
        model: '',
        hasApiKey: false,
        lmstudioBaseUrl: 'http://localhost:1234/v1',
        connection: { ok: false, message: capabilityError.error },
        locked: true,
        capability: capabilityError.capability
      };
    }

    const settings = (() => {
      try {
        const raw = db.getSetting('ai');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })();

    const enabled = settings.enabled !== false && settings.enabled !== 'false';
    const diagnostics = {
      enabled,
      provider: settings.provider || 'openrouter',
      model: settings.model || '',
      hasApiKey: !!settings.apiKey,
      lmstudioBaseUrl: settings.lmstudioBaseUrl || 'http://localhost:1234/v1',
      connection: { ok: false, message: enabled ? 'Not tested yet' : 'AI disabled' }
    };

    if (!enabled || !aiService) {
      return diagnostics;
    }

    if (diagnostics.provider === 'openrouter') {
      diagnostics.connection = diagnostics.hasApiKey
        ? { ok: true, message: 'API key configured. Run Test Connection for a live check.' }
        : { ok: false, message: 'OpenRouter is selected but no API key is saved.' };
      return diagnostics;
    }

    const probe = await aiService.getLMStudioModels();
    if (probe?.error) {
      diagnostics.connection = { ok: false, message: probe.error };
      diagnostics.availableModels = [];
      return diagnostics;
    }

    diagnostics.connection = {
      ok: true,
      message: `LM Studio responded with ${probe.models?.length || 0} available model(s).`
    };
    diagnostics.availableModels = probe.models || [];
    return diagnostics;
  });

  safeHandler('ai:saveSettings', (e, settings) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;

    const v = validateAiSettings(settings);
    if (v.error) return { error: v.error };
    const storedSettings = readStoredAiSettings(db);
    const enc = { ...storedSettings, ...v.value };
    const existingEncryptedApiKey = typeof storedSettings.apiKey === 'string' ? storedSettings.apiKey : '';

    if (v.value.clearApiKey) {
      delete enc.apiKey;
    } else if (v.value.apiKey) {
      enc.apiKey = encryptPassword(v.value.apiKey);
    } else if (existingEncryptedApiKey) {
      enc.apiKey = existingEncryptedApiKey;
    } else {
      delete enc.apiKey;
    }

    delete enc.hasApiKey;
    delete enc.clearApiKey;

    db.setSetting('ai', JSON.stringify(enc));
    if (aiService) {
      if (v.value.apiKey !== undefined || v.value.clearApiKey) {
        const effectiveApiKey = v.value.clearApiKey
          ? ''
          : (v.value.apiKey || (existingEncryptedApiKey ? decryptPassword(existingEncryptedApiKey) : ''));
        aiService.setApiKey(effectiveApiKey);
      }
      if (v.value.model)                           aiService.setModel(v.value.model);
      if (v.value.provider)                        aiService.setProvider(v.value.provider);
      if (v.value.lmstudioBaseUrl   !== undefined) aiService.setLmstudioBaseUrl(v.value.lmstudioBaseUrl);
    }
    return { success: true, hasApiKey: !!enc.apiKey };
  });

  safeHandler('ai:improveSubject',      async (e, payload) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const v = validateAiImproveSubjectPayload(payload); if (v.error) return { error: v.error }; if (!aiService) return { error: 'AI not initialized' }; return aiService.improveSubject(v.value.subject, v.value.context); });
  safeHandler('ai:analyzeContent',      async (e, payload) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const v = validateSubjectContentPayload(payload, { requireOne: true }); if (v.error) return { error: v.error }; if (!aiService) return { error: 'AI not initialized' }; return aiService.analyzeContent(v.value.subject, v.value.content); });
  safeHandler('ai:generateContent',     async (e, payload) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const v = validateAiGeneratePayload(payload); if (v.error) return { error: v.error }; if (!aiService) return { error: 'AI not initialized' }; return aiService.generateContent(v.value); });
  safeHandler('ai:generateTemplateBlocks', async (e, payload) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const v = validateAiGeneratePayload(payload); if (v.error) return { error: v.error }; if (!aiService) return { error: 'AI not initialized' }; return aiService.generateTemplateBlocks(v.value); });
  safeHandler('ai:getModels',           () => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const AIService = require('../services/aiService'); return AIService.getAvailableModels(); });
  safeHandler('ai:localAnalysis',       (e, payload) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; const v = validateSubjectContentPayload(payload); if (v.error) return { error: v.error }; if (!aiService) return { error: 'AI not initialized' }; return { subject: aiService.analyzeSubjectLocal(v.value.subject), content: aiService.analyzeContentLocal(v.value.content), sendTime: aiService.getSendTimeAdvice() }; });

  safeHandler('ai:getLmstudioModels', async (e, baseUrl) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!aiService) return { error: 'AI not initialized' };
    if (baseUrl && typeof baseUrl === 'string') {
      const AIService = require('../services/aiService');
      const probe = new AIService();
      probe.setProvider('lmstudio');
      probe.setLmstudioBaseUrl(baseUrl);
      return probe.getLMStudioModels();
    }
    return aiService.getLMStudioModels();
  });

  safeHandler('ai:probeUrl', async (e, url) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!aiService) return { error: 'AI not initialized' };
    const s = sanitiseString(url, 200);
    if (!s) return { error: 'Invalid URL' };
    const AIService = require('../services/aiService');
    const probe = new AIService();
    probe.setProvider('lmstudio');
    probe.setLmstudioBaseUrl(s);
    const result = await probe.getLMStudioModels();
    if (result?.error) return result;
    return { ok: true, models: result.models || [] };
  });

  safeHandler('ai:testConnection', async (e, settings) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!aiService) return { error: 'AI not initialized' };
    const storedSettings = readStoredAiSettings(db);
    const { provider, apiKey, model, lmstudioBaseUrl, clearApiKey } = settings || {};
    const resolvedApiKey = clearApiKey
      ? ''
      : (apiKey || (storedSettings.apiKey ? decryptPassword(storedSettings.apiKey) : ''));
    const AIService = require('../services/aiService');
    const probe = new AIService();
    if (provider === 'openrouter') {
      if (!resolvedApiKey) return { error: 'OpenRouter API key is required' };
      probe.setProvider('openrouter');
      probe.setApiKey(resolvedApiKey);
      if (model) probe.setModel(model);
      const result = await probe._callApi([{ role: 'user', content: 'Reply with the single word OK.' }], 20);
      if (result.error) return { error: result.error };
      return { success: true, message: 'OpenRouter connection successful!' };
    } else if (provider === 'lmstudio') {
      if (!lmstudioBaseUrl) return { error: 'LM Studio server URL is required' };
      probe.setProvider('lmstudio');
      probe.setLmstudioBaseUrl(lmstudioBaseUrl);
      const modelsResult = await probe.getLMStudioModels();
      if (modelsResult.error) return { error: modelsResult.error };
      if (!modelsResult.models?.length) return { error: 'LM Studio is running but no models are loaded.' };
      const testModel = model || modelsResult.models[0]?.id;
      if (!testModel) return { error: 'No model available to test' };
      probe.setModel(testModel);
      const completionResult = await probe._callApi([{ role: 'user', content: 'Say OK' }], 5, 30000);
      if (completionResult.error) return { error: `Model "${testModel}" not responding: ${completionResult.error}` };
      return { success: true, message: `LM Studio connected! Model "${testModel}" is responding.`, models: modelsResult.models };
    }
    return { error: 'Invalid provider' };
  });

  // ── App context ────────────────────────────────────────────────────────────
  safeHandler('ai:getAppContext', () => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    return buildAppContext(db);
  });
  safeHandler('ai:getCapabilities', () => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    return getAssistantCapabilities();
  });

  // ── Memory ─────────────────────────────────────────────────────────────────
  safeHandler('ai:getMemories',  ()              => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; try { return db.getAllAIMemories?.() ?? []; } catch { return []; } });
  safeHandler('ai:setMemory',    (e, { key, value }) => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; try { db.setAIMemory?.(sanitiseString(key, 100), sanitiseString(value, 2000)); return { success: true }; } catch (err) { return { error: err.message }; } });
  safeHandler('ai:deleteMemory', (e, key)        => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; try { db.deleteAIMemory?.(sanitiseString(key, 100)); return { success: true }; } catch (err) { return { error: err.message }; } });

  // ── Contact actions ────────────────────────────────────────────────────────
  safeHandler('ai:getUnverifiedContacts',  ()          => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; try { return db.getUnverifiedContacts?.(100) ?? []; } catch { return []; } });
  safeHandler('ai:getDeliverabilitySnapshot', ()       => { const capabilityError = requireAiCapability(); if (capabilityError) return capabilityError; try { return db.getDeliverabilitySnapshot?.() ?? {}; } catch { return {}; } });

  safeHandler('ai:searchContacts', (e, query) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const q = sanitiseString(query, 200);
    if (!q) return { error: 'Query is required' };
    try {
      const all = db.getAllContacts?.() ?? [];
      const ql  = q.toLowerCase();
      const results = all.filter(c =>
        (c.email || '').toLowerCase().includes(ql) ||
        (c.firstName || '').toLowerCase().includes(ql) ||
        (c.lastName  || '').toLowerCase().includes(ql) ||
        (c.company   || '').toLowerCase().includes(ql)
      ).slice(0, 20);
      return { results, count: results.length };
    } catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:getContactDetails', (e, emailOrId) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const s = sanitiseString(emailOrId, 254);
    if (!s) return { error: 'Email or ID is required' };
    try {
      const all = db.getAllContacts?.() ?? [];
      const contact = all.find(c => c.id === s || (c.email || '').toLowerCase() === s.toLowerCase());
      if (!contact) return { error: `Contact "${s}" not found` };
      return { contact };
    } catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:deleteContact', (e, id) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const s = sanitiseString(id, 100);
    if (!s) return { error: 'Contact ID is required' };
    try { db.deleteContact?.(s); return { success: true }; }
    catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:createList', (e, name) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const v = requireString(name, 'List name', 200);
    if (v.error) return { error: v.error };
    try {
      db.addList?.({ name: v.value, description: 'Created by Bulky AI' });
      return { success: true, name: v.value };
    } catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:addContactToList', async (e, { email, listName }) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const cleanEmail    = sanitiseEmail(email);
    const cleanListName = sanitiseString(listName, 200);
    if (!cleanEmail)    return { error: 'Valid email is required' };
    if (!cleanListName) return { error: 'List name is required' };
    try {
      const all      = db.getAllContacts?.() ?? [];
      const contact  = all.find(c => (c.email || '').toLowerCase() === cleanEmail);
      if (!contact)  return { error: `Contact ${cleanEmail} not found` };
      const lists    = db.getAllLists?.() ?? [];
      const list     = lists.find(l => (l.name || '').toLowerCase() === cleanListName.toLowerCase());
      if (!list)     return { error: `List "${cleanListName}" not found. Create it first.` };
      db.addContactToList?.(contact.id, list.id);
      return { success: true, email: cleanEmail, list: list.name };
    } catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:tagContact', async (e, { email, tag }) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const cleanEmail = sanitiseEmail(email);
    const cleanTag   = sanitiseString(tag, 100);
    if (!cleanEmail) return { error: 'Valid email is required' };
    if (!cleanTag)   return { error: 'Tag is required' };
    try {
      const all     = db.getAllContacts?.() ?? [];
      const contact = all.find(c => (c.email || '').toLowerCase() === cleanEmail);
      if (!contact) return { error: `Contact ${cleanEmail} not found` };
      db.addTagToContact?.(contact.id, cleanTag);
      return { success: true, email: cleanEmail, tag: cleanTag };
    } catch (err) { return { error: err.message }; }
  });

  // ── Verification actions ───────────────────────────────────────────────────
  safeHandler('ai:verifyContact', async (e, email) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const cleanEmail = sanitiseEmail(email);
    if (!cleanEmail) return { error: `"${email}" is not a valid email address` };
    if (!verificationService) return { error: 'Verification service not available' };
    try {
      const result = await verificationService.verifyEmail(cleanEmail, {
        skipSmtpCheck: false, checkCatchAll: true, timeout: 15000
      });
      // Update the contact in DB if it exists
      const all     = db.getAllContacts?.() ?? [];
      const contact = all.find(c => (c.email || '').toLowerCase() === cleanEmail);
      if (contact) {
        db.updateContact?.({
          ...contact,
          verificationStatus: result.status,
          verificationScore:  result.score,
          verificationDetails: result.details
        });
      }
      return {
        email:  cleanEmail,
        status: result.status,
        score:  result.score,
        reason: result.reason,
        details: {
          syntax:    result.checks?.syntax,
          mxRecords: result.checks?.mxRecords,
          smtp:      result.checks?.smtp,
          disposable: result.details?.isDisposable,
          roleBased:  result.details?.isRoleBased,
          catchAll:   result.details?.isCatchAll,
          provider:   result.details?.inboxProvider
        }
      };
    } catch (err) { return { error: `Verification failed: ${err.message}` }; }
  });

  safeHandler('ai:verifyAllUnverified', async (e, options = {}) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!verificationService) return { error: 'Verification service not available' };
    try {
      const unverified = db.getUnverifiedContacts?.(500) ?? [];
      if (unverified.length === 0) return { success: true, message: 'No unverified contacts found.', count: 0 };
      const emails  = unverified.map(c => c.email);
      const results = await verificationService.verifyBulk(emails, null, {
        skipSmtpCheck: options.skipSmtp || false,
        checkCatchAll: true,
        concurrency:   2,
        timeout:       12000
      });
      // Write results back to DB
      for (const r of (results.results || [])) {
        const contact = unverified.find(c => c.email === r.email);
        if (contact) {
          db.updateContact?.({
            ...contact,
            verificationStatus: r.status,
            verificationScore:  r.score,
            verificationDetails: r.details
          });
        }
      }
      return {
        success: true,
        processed: results.summary?.completed || 0,
        valid:     results.summary?.valid     || 0,
        invalid:   results.summary?.invalid   || 0,
        risky:     results.summary?.risky     || 0
      };
    } catch (err) { return { error: `Bulk verification failed: ${err.message}` }; }
  });

  // ── Domain health ──────────────────────────────────────────────────────────
  safeHandler('ai:checkDomainHealth', async (e, domain) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const d = sanitiseString(domain, 253);
    if (!d) return { error: 'Domain is required' };
    if (!domainHealthService) return { error: 'Domain health service not available' };
    try {
      const result = await domainHealthService.checkDomain(d);
      return {
        domain: d,
        spf:   result.spf?.found  ? 'configured'     : 'missing',
        dkim:  result.dkim?.found  ? `found (${result.dkim.selector})` : 'not found',
        dmarc: result.dmarc?.found ? 'configured'     : 'missing',
        mx:    result.mx?.found    ? result.mx.records?.join(', ') : 'missing',
        recommendations: [
          !result.spf?.found   ? result.spf?.recommendation   : null,
          !result.dkim?.found  ? result.dkim?.recommendation  : null,
          !result.dmarc?.found ? result.dmarc?.recommendation : null,
          !result.mx?.found    ? result.mx?.recommendation    : null,
        ].filter(Boolean),
        raw: result
      };
    } catch (err) { return { error: `Domain check failed: ${err.message}` }; }
  });

  // ── Campaign helpers ───────────────────────────────────────────────────────
  safeHandler('ai:getRecentCampaigns', () => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    try {
      const all = db.getAllCampaigns?.() ?? [];
      return all.slice(-10).reverse().map(c => ({
        id: c.id, name: c.name, status: c.status,
        sent: c.sentCount || 0, openRate: c.openRate || 0,
        bounceRate: c.bounceRate || 0, createdAt: c.createdAt
      }));
    } catch (err) { return { error: err.message }; }
  });

  safeHandler('ai:getCampaignStats', (e, campaignId) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    const s = sanitiseString(campaignId, 100);
    if (!s) return { error: 'Campaign ID is required' };
    try {
      const all      = db.getAllCampaigns?.() ?? [];
      const campaign = all.find(c => c.id === s);
      if (!campaign) return { error: `Campaign "${s}" not found` };
      const events   = db.getTrackingEvents?.(s) ?? [];
      const opens    = events.filter(e => e.type === 'open').length;
      const clicks   = events.filter(e => e.type === 'click').length;
      const sent     = campaign.sentCount || 0;
      return {
        id: campaign.id, name: campaign.name, status: campaign.status,
        sent, opens, clicks,
        openRate:  sent > 0 ? ((opens  / sent) * 100).toFixed(1) : '0',
        clickRate: sent > 0 ? ((clicks / sent) * 100).toFixed(1) : '0',
        bounceRate: campaign.bounceRate || 0
      };
    } catch (err) { return { error: err.message }; }
  });

  // ── Template generation via AI ─────────────────────────────────────────────
  safeHandler('ai:generateAndSaveTemplate', async (e, { prompt, tone, audience, cta, format, name }) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!aiService) return { error: 'AI not initialized' };
    try {
      let result;
      if (format === 'blocks') {
        result = await aiService.generateTemplateBlocks({ prompt, tone, audience, cta });
        if (result.error) return result;
        const templateName = sanitiseString(name || `AI Template ${new Date().toLocaleDateString()}`, 200);
        const id = db.addTemplate?.({
          name: templateName,
          subject: prompt.slice(0, 80),
          content: JSON.stringify(result.blocks),
          type: 'blocks'
        });
        return { success: true, id, name: templateName, type: 'blocks', blocks: result.blocks };
      } else {
        result = await aiService.generateContent({ prompt, tone, audience, cta });
        if (result.error) return result;
        const templateName = sanitiseString(name || result.subject?.slice(0, 60) || `AI Template ${new Date().toLocaleDateString()}`, 200);
        const id = db.addTemplate?.({
          name: templateName,
          subject: result.subject || '',
          content: result.html || '',
          type: 'html'
        });
        return { success: true, id, name: templateName, type: 'html', subject: result.subject, html: result.html };
      }
    } catch (err) { return { error: `Template generation failed: ${err.message}` }; }
  });

  // ── Main AI chat ───────────────────────────────────────────────────────────
  safeHandler('ai:chat', async (e, payload) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!aiService) return { error: 'AI service not initialized' };
    if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
      return { error: 'Message is required' };
    }

    const history    = Array.isArray(payload.history) ? payload.history : [];
    let   appContext = payload.context || null;

    if (!appContext) {
      try {
        appContext = buildAppContext(db);
        appContext.currentPage     = payload.currentPage  || null;
        appContext.activeCampaign  = payload.activeCampaign || null;
      } catch { appContext = {}; }
    }

    return aiService.chat(payload.message.trim(), history, appContext);
  });

  // ── AI action execution (called from renderer after parsing action block) ──
  safeHandler('ai:executeAction', async (e, action) => {
    const capabilityError = requireAiCapability();
    if (capabilityError) return capabilityError;
    if (!action?.type) return { error: 'No action type provided' };
    const type = String(action.type || '');

    if (type === 'verifyContact') {
      const cleanEmail = sanitiseEmail(action.email);
      if (!cleanEmail) return { error: 'A valid email is required' };
      if (!verificationService) return { error: 'Verification service not available' };
      const result = await verificationService.verifyEmail(cleanEmail, {
        skipSmtpCheck: false,
        checkCatchAll: action.checkCatchAll !== false,
        timeout: Number.isInteger(action.timeout) ? action.timeout : 15000
      });
      const existing = (db.getAllContacts?.() ?? []).find((contact) => (contact.email || '').toLowerCase() === cleanEmail);
      if (existing) {
        db.updateContact?.({
          ...existing,
          verificationStatus: result.status,
          verificationScore: result.score,
          verificationDetails: result.details
        });
      }
      return { success: true, email: cleanEmail, result };
    }

    if (type === 'verifyAllUnverified') {
      if (!verificationService) return { error: 'Verification service not available' };
      const unverified = db.getUnverifiedContacts?.(500) ?? [];
      if (unverified.length === 0) return { success: true, count: 0, message: 'All contacts are already verified.' };
      const results = await verificationService.verifyBulk(
        unverified.map((contact) => contact.email),
        null,
        {
          skipSmtpCheck: action.skipSmtp === true,
          checkCatchAll: action.checkCatchAll !== false,
          concurrency: Number.isInteger(action.concurrency) ? action.concurrency : 2,
          timeout: Number.isInteger(action.timeout) ? action.timeout : 12000
        }
      );
      for (const result of results.results || []) {
        const existing = unverified.find((contact) => contact.email === result.email);
        if (existing) {
          db.updateContact?.({
            ...existing,
            verificationStatus: result.status,
            verificationScore: result.score,
            verificationDetails: result.details
          });
        }
      }
      return { success: true, summary: results.summary, results: (results.results || []).slice(0, 20) };
    }

    if (type === 'searchContacts') {
      const q = sanitiseString(action.query, 200).toLowerCase();
      if (!q) return { error: 'A search query is required' };
      const results = (db.getAllContacts?.() ?? []).filter((contact) =>
        (contact.email || '').toLowerCase().includes(q) ||
        (contact.firstName || '').toLowerCase().includes(q) ||
        (contact.lastName || '').toLowerCase().includes(q) ||
        (contact.company || '').toLowerCase().includes(q)
      ).slice(0, 20);
      return { success: true, count: results.length, contacts: results };
    }

    if (type === 'getContactDetails') {
      const lookup = sanitiseString(action.email || action.id, 254);
      if (!lookup) return { error: 'A contact email or id is required' };
      const contact = (db.getAllContacts?.() ?? []).find((item) =>
        item.id === lookup || (item.email || '').toLowerCase() === lookup.toLowerCase()
      );
      if (!contact) return { error: `Contact "${lookup}" not found` };
      return { success: true, contact: db.getContactDetail?.(contact.id) || { contact } };
    }

    if (type === 'getUnverifiedContacts') {
      const contacts = db.getUnverifiedContacts?.(50) ?? [];
      return { success: true, count: contacts.length, contacts };
    }

    if (type === 'getDeliverabilitySnapshot' || type === 'runDeliverabilityTest') {
      return { success: true, snapshot: db.getDeliverabilitySnapshot?.() ?? {} };
    }

    if (type === 'getRecentCampaigns') {
      const campaigns = (db.getAllCampaigns?.() ?? []).slice(-5).reverse().map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sent: campaign.sentCount || 0,
        openRate: campaign.openRate || 0,
        bounceRate: campaign.bounceRate || 0
      }));
      return { success: true, campaigns };
    }

    if (type === 'getCampaignStats') {
      const lookup = sanitiseString(action.campaignId, 100);
      if (!lookup) return { error: 'A campaign id is required' };
      const campaign = (db.getAllCampaigns?.() ?? []).find((item) => item.id === lookup || (item.name || '').toLowerCase() === lookup.toLowerCase());
      if (!campaign) return { error: 'Campaign not found' };
      const events = db.getTrackingEvents?.(campaign.id) ?? [];
      const opens = events.filter((event) => event.type === 'open').length;
      const clicks = events.filter((event) => event.type === 'click').length;
      const sent = campaign.sentCount || 0;
      return {
        success: true,
        stats: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          sent,
          opens,
          clicks,
          openRate: sent > 0 ? ((opens / sent) * 100).toFixed(1) : '0',
          clickRate: sent > 0 ? ((clicks / sent) * 100).toFixed(1) : '0',
          bounceRate: campaign.bounceRate || 0
        }
      };
    }

    if (type === 'createList') {
      const name = sanitiseString(action.name, 200);
      if (!name) return { error: 'A list name is required' };
      db.addList?.({ name, description: sanitiseString(action.description, 300) || 'Created by Bulky AI' });
      return { success: true, name };
    }

    if (type === 'deleteContact') {
      const id = sanitiseString(action.id, 100);
      if (!id) return { error: 'A contact id is required' };
      db.deleteContact?.(id);
      return { success: true, id };
    }

    if (type === 'tagContact') {
      const email = sanitiseEmail(action.email);
      const tag = sanitiseString(action.tag, 100);
      if (!email) return { error: 'A valid email is required' };
      if (!tag) return { error: 'A tag is required' };
      const contact = (db.getAllContacts?.() ?? []).find((item) => (item.email || '').toLowerCase() === email);
      if (!contact) return { error: `Contact ${email} not found` };
      db.addTagToContact?.(contact.id, tag);
      return { success: true, email, tag };
    }

    if (type === 'addContactToList') {
      const email = sanitiseEmail(action.email);
      const listName = sanitiseString(action.listName, 200);
      if (!email) return { error: 'A valid email is required' };
      if (!listName) return { error: 'A list name is required' };
      const contact = (db.getAllContacts?.() ?? []).find((item) => (item.email || '').toLowerCase() === email);
      if (!contact) return { error: `Contact ${email} not found` };
      const list = (db.getAllLists?.() ?? []).find((item) => (item.name || '').toLowerCase() === listName.toLowerCase());
      if (!list) return { error: `List "${listName}" not found` };
      db.addContactToList?.(contact.id, list.id);
      return { success: true, email, list: list.name };
    }

    if (type === 'checkDomainHealth') {
      const domain = sanitiseString(action.domain, 253);
      if (!domain) return { error: 'A domain is required' };
      if (!domainHealthService) return { error: 'Domain health service not available' };
      const result = await domainHealthService.checkDomain(domain);
      return { success: true, domain, health: result };
    }

    if (type === 'generateTemplate') {
      if (!aiService) return { error: 'AI not initialized' };
      const prompt = sanitiseString(action.prompt, 20000);
      if (!prompt) return { error: 'A template prompt is required' };
      const tone = sanitiseString(action.tone, 50) || 'professional';
      const audience = sanitiseString(action.audience, 400);
      const cta = sanitiseString(action.cta, 300);
      const format = sanitiseString(action.format, 32) || 'html';
      const name = sanitiseString(action.name, 200);

      if (format === 'blocks') {
        const result = await aiService.generateTemplateBlocks({ prompt, tone, audience, cta });
        if (result.error) return result;
        const templateName = name || `AI Template ${new Date().toLocaleDateString()}`;
        const id = db.addTemplate?.({
          name: templateName,
          subject: prompt.slice(0, 80),
          content: JSON.stringify(result.blocks),
          type: 'blocks'
        });
        return { success: true, id, name: templateName, type: 'blocks', blocks: result.blocks };
      }

      const result = await aiService.generateContent({ prompt, tone, audience, cta, format: 'campaign' });
      if (result.error) return result;
      const templateName = name || result.subject?.slice(0, 60) || `AI Template ${new Date().toLocaleDateString()}`;
      const id = db.addTemplate?.({
        name: templateName,
        subject: result.subject || '',
        content: result.html || '',
        type: 'html'
      });
      return { success: true, id, name: templateName, type: 'html', subject: result.subject, html: result.html };
    }

    if (type === 'remember') {
      const key = sanitiseString(action.key, 100);
      const value = sanitiseString(action.value, 2000);
      if (!key) return { error: 'A memory key is required' };
      if (!value) return { error: 'A memory value is required' };
      db.setAIMemory?.(key, value);
      return { success: true, key, value };
    }

    if (type === 'recall') {
      const key = sanitiseString(action.key, 100);
      if (!key) return { error: 'A memory key is required' };
      const match = (db.getAllAIMemories?.() ?? []).find((memory) => String(memory.key || '').toLowerCase() === key.toLowerCase());
      return match ? { success: true, key: match.key, value: match.value } : { error: `No memory found for "${key}"` };
    }

    return { error: `Unknown action type: ${type}` };
  });
}

module.exports = registerSupportHandlers;
