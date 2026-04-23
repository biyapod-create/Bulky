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

function registerSupportHandlers({
  safeHandler,
  db,
  spamService,
  aiService,
  decryptPassword,
  encryptPassword
}) {
  safeHandler('spam:check', (e, data) => {
    const validated = validateSpamAnalysisPayload(data);
    if (validated.error) return { error: validated.error };
    return spamService.analyzeContent(validated.value.subject, validated.value.content);
  });
  safeHandler('spam:autoFix', (e, data) => {
    const validated = validateSpamAutoFixPayload(data);
    if (validated.error) return { error: validated.error };
    return spamService.autoFix(validated.value.subject, validated.value.content, validated.value.issues);
  });
  safeHandler('spam:getSuggestions', (e, word) => {
    const validated = validateSuggestionWord(word);
    if (validated.error) return { error: validated.error };
    return spamService.getSuggestions(validated.value);
  });
  safeHandler('spam:getReplacements', () => db.getAllSpamReplacements());
  safeHandler('spam:addReplacement', (e, item) => {
    const validated = validateSpamReplacementItem(item);
    if (validated.error) return { error: validated.error };
    return db.addSpamReplacement(validated.value);
  });
  safeHandler('spam:updateReplacement', (e, item) => {
    const validated = validateSpamReplacementItem(item, { requireId: true });
    if (validated.error) return { error: validated.error };
    db.updateSpamReplacement(validated.value);
    return { success: true };
  });
  safeHandler('spam:deleteReplacement', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteSpamReplacement(validated.value);
    return { success: true };
  });

  safeHandler('tracking:addEvent', (e, event) => {
    const validated = validateTrackingEvent(event);
    if (validated.error) return { error: validated.error };
    db.addTrackingEvent(validated.value);
    return { success: true };
  });
  safeHandler('tracking:getEvents', (e, campaignId) => {
    const validated = validateId(campaignId, 'campaignId');
    if (validated.error) return { error: validated.error };
    return db.getTrackingEvents(validated.value);
  });

  safeHandler('ai:getSettings', () => {
    const raw = db.getSetting('ai');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.apiKey) {
          parsed.apiKey = decryptPassword(parsed.apiKey);
        }
        return parsed;
      } catch {}
    }
    return { apiKey: '', model: 'meta-llama/llama-3.1-8b-instruct:free' };
  });

  safeHandler('ai:saveSettings', (e, settings) => {
    const validated = validateAiSettings(settings);
    if (validated.error) return { error: validated.error };

    const encryptedSettings = { ...validated.value };
    if (validated.value.apiKey) {
      encryptedSettings.apiKey = encryptPassword(validated.value.apiKey);
    }
    db.setSetting('ai', JSON.stringify(encryptedSettings));
    if (aiService) {
      if (validated.value.apiKey !== undefined) aiService.setApiKey(validated.value.apiKey);
      if (validated.value.model) aiService.setModel(validated.value.model);
    }
    return { success: true };
  });

  safeHandler('ai:improveSubject', async (e, payload) => {
    const validated = validateAiImproveSubjectPayload(payload);
    if (validated.error) return { error: validated.error };
    if (!aiService) return { error: 'AI service not initialized' };
    return aiService.improveSubject(validated.value.subject, validated.value.context);
  });

  safeHandler('ai:analyzeContent', async (e, payload) => {
    const validated = validateSubjectContentPayload(payload, { requireOne: true });
    if (validated.error) return { error: validated.error };
    if (!aiService) return { error: 'AI service not initialized' };
    return aiService.analyzeContent(validated.value.subject, validated.value.content);
  });

  safeHandler('ai:generateContent', async (e, payload) => {
    const validated = validateAiGeneratePayload(payload);
    if (validated.error) return { error: validated.error };
    if (!aiService) return { error: 'AI service not initialized' };
    return aiService.generateContent(validated.value);
  });

  safeHandler('ai:generateTemplateBlocks', async (e, payload) => {
    const validated = validateAiGeneratePayload(payload);
    if (validated.error) return { error: validated.error };
    if (!aiService) return { error: 'AI service not initialized' };
    return aiService.generateTemplateBlocks(validated.value);
  });

  safeHandler('ai:getModels', () => {
    const AIService = require('../services/aiService');
    return AIService.getAvailableModels();
  });

  safeHandler('ai:localAnalysis', (e, payload) => {
    const validated = validateSubjectContentPayload(payload);
    if (validated.error) return { error: validated.error };
    if (!aiService) return { error: 'AI service not initialized' };
    return {
      subject: aiService.analyzeSubjectLocal(validated.value.subject),
      content: aiService.analyzeContentLocal(validated.value.content),
      sendTime: aiService.getSendTimeAdvice()
    };
  });
}

module.exports = registerSupportHandlers;
