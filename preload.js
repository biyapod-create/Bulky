const { contextBridge, ipcRenderer } = require('electron');

// ─── Tray-navigate event buffer ───────────────────────────────────────────────
// If the user clicks "Settings" in the tray before React mounts and registers
// its onNavigatePage subscriber, the IPC event would be dropped silently.
// We buffer the most-recent pending navigation here at the Node/preload layer
// (alive before any renderer JS runs) and drain it when a subscriber registers.
let _pendingNavigatePage = null;
ipcRenderer.on('navigate:page', (_event, page) => {
  _pendingNavigatePage = page;
});

function normalizeVerificationPayload(kind, value, options = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = { ...value };
    if (kind === 'single' && payload.email !== undefined) {
      return payload;
    }
    if (kind === 'bulk' && payload.emails !== undefined) {
      return payload;
    }
  }

  return kind === 'single'
    ? { email: value, ...options }
    : { emails: value, ...options };
}
// ─────────────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electron', {
  // App metadata — version always reflects the real package.json, never a hardcoded string
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close:    () => ipcRenderer.invoke('window:close'),
  hide:     () => ipcRenderer.invoke('window:hide'),
  show:     () => ipcRenderer.invoke('window:show'),
  quit:     () => ipcRenderer.invoke('window:quit'),

  // Contacts
  contacts: {
    getAll:                () => ipcRenderer.invoke('contacts:getAll'),
    getFiltered:    (filter) => ipcRenderer.invoke('contacts:getFiltered', filter),
    getPage:        (params) => ipcRenderer.invoke('contacts:getPage', params),
    getStats:              () => ipcRenderer.invoke('contacts:getStats'),
    getDetail:         (id) => ipcRenderer.invoke('contacts:getDetail', id),
    add:          (contact) => ipcRenderer.invoke('contacts:add', contact),
    addBulk:     (contacts) => ipcRenderer.invoke('contacts:addBulk', contacts),
    update:       (contact) => ipcRenderer.invoke('contacts:update', contact),
    delete:           (ids) => ipcRenderer.invoke('contacts:delete', ids),
    deleteByVerification: (status) => ipcRenderer.invoke('contacts:deleteByVerification', status),
    getRecipientCount: (filter) => ipcRenderer.invoke('contacts:getRecipientCount', filter),
    getForCampaign:    (filter) => ipcRenderer.invoke('contacts:getForCampaign', filter),
    import:                () => ipcRenderer.invoke('contacts:import'),
    importRaw:             () => ipcRenderer.invoke('contacts:importRaw'),
    importFromPath: (filePath) => ipcRenderer.invoke('contacts:importFromPath', filePath),
    prepareImport: (payload) => ipcRenderer.invoke('contacts:prepareImport', payload),
    addTagBulk:  (ids, tagId) => ipcRenderer.invoke('contacts:addTagBulk', ids, tagId),
    addToListBulk: (ids, listId) => ipcRenderer.invoke('contacts:addToListBulk', ids, listId),
    getRecipientBreakdown: (filter) => ipcRenderer.invoke('contacts:getRecipientBreakdown', filter),
    updateEngagement: (contactId) => ipcRenderer.invoke('contacts:updateEngagement', contactId),
    getByEngagement: (range) => ipcRenderer.invoke('contacts:getByEngagement', range),
    getTopEngaged: (limit) => ipcRenderer.invoke('contacts:getTopEngaged', limit),
    getCold: (daysInactive) => ipcRenderer.invoke('contacts:getCold', daysInactive),
    createReengagement: (payload) => ipcRenderer.invoke('contacts:createReengagement', payload),
    archiveInactive: (daysInactive) => ipcRenderer.invoke('contacts:archiveInactive', daysInactive),
    addToList:   (contactId, listId) => ipcRenderer.invoke('contacts:addToList', contactId, listId),
    removeFromList: (contactId, listId) => ipcRenderer.invoke('contacts:removeFromList', contactId, listId),
    getLists:       (contactId) => ipcRenderer.invoke('contacts:getLists', contactId),
    addTag:    (contactId, tagName) => ipcRenderer.invoke('contacts:addTag', contactId, tagName),
    removeTag: (contactId, tagName) => ipcRenderer.invoke('contacts:removeTag', contactId, tagName),
    getTags:        (contactId) => ipcRenderer.invoke('contacts:getTags', contactId)
  },

  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    add:   (tag) => ipcRenderer.invoke('tags:add', tag),
    delete: (id) => ipcRenderer.invoke('tags:delete', id)
  },

  // Lists
  lists: {
    getAll:               () => ipcRenderer.invoke('lists:getAll'),
    add:             (list) => ipcRenderer.invoke('lists:add', list),
    update:          (list) => ipcRenderer.invoke('lists:update', list),
    delete:           (id) => ipcRenderer.invoke('lists:delete', id),
    getContacts: (listId) => ipcRenderer.invoke('lists:getContacts', listId)
  },

  // Blacklist
  blacklist: {
    getAll:              () => ipcRenderer.invoke('blacklist:getAll'),
    add:          (entry) => ipcRenderer.invoke('blacklist:add', entry),
    addBulk:    (entries) => ipcRenderer.invoke('blacklist:addBulk', entries),
    remove:          (id) => ipcRenderer.invoke('blacklist:remove', id),
    check:        (email) => ipcRenderer.invoke('blacklist:check', email),
    import:              () => ipcRenderer.invoke('blacklist:import'),
    autoBlacklist:       () => ipcRenderer.invoke('bounces:autoBlacklist')
  },

  // Unsubscribes
  unsubscribes: {
    getAll:            () => ipcRenderer.invoke('unsubscribes:getAll'),
    add:         (data) => ipcRenderer.invoke('unsubscribes:add', data),
    remove:     (email) => ipcRenderer.invoke('unsubscribes:remove', email),
    check:      (email) => ipcRenderer.invoke('unsubscribes:check', email)
  },

  // Templates
  templates: {
    getAll:                       () => ipcRenderer.invoke('templates:getAll'),
    getByCategory:      (category) => ipcRenderer.invoke('templates:getByCategory', category),
    getWithBlocks:    (templateId) => ipcRenderer.invoke('templates:getWithBlocks', templateId),
    saveBlocks:            (data) => ipcRenderer.invoke('templates:saveBlocks', data),
    getCategories:             () => ipcRenderer.invoke('templates:getCategories'),
    add:              (template) => ipcRenderer.invoke('templates:add', template),
    update:           (template) => ipcRenderer.invoke('templates:update', template),
    delete:                 (id) => ipcRenderer.invoke('templates:delete', id),
    importFile:                () => ipcRenderer.invoke('templates:importFile'),
    exportTemplate: (template, filename) => ipcRenderer.invoke('templates:exportTemplate', { template, filename })
  },

  // SMTP Accounts (multi-account)
  smtpAccounts: {
    getAll:              () => ipcRenderer.invoke('smtpAccounts:getAll'),
    getActive:           () => ipcRenderer.invoke('smtpAccounts:getActive'),
    add:        (account) => ipcRenderer.invoke('smtpAccounts:add', account),
    update:     (account) => ipcRenderer.invoke('smtpAccounts:update', account),
    delete:          (id) => ipcRenderer.invoke('smtpAccounts:delete', id),
    test:       (account) => ipcRenderer.invoke('smtpAccounts:test', account)
  },

  // Legacy single SMTP (backward compat)
  smtp: {
    get:                   () => ipcRenderer.invoke('smtp:get'),
    save:      (settings) => ipcRenderer.invoke('smtp:save', settings),
    test:      (settings) => ipcRenderer.invoke('smtp:test', settings)
  },

  // Campaigns
  campaigns: {
    getAll:                    () => ipcRenderer.invoke('campaigns:getAll'),
    getScheduled:              () => ipcRenderer.invoke('campaigns:getScheduled'),
    add:            (campaign) => ipcRenderer.invoke('campaigns:add', campaign),
    update:         (campaign) => ipcRenderer.invoke('campaigns:update', campaign),
    delete:               (id) => ipcRenderer.invoke('campaigns:delete', id),
    getLogs:        (campaignId) => ipcRenderer.invoke('campaigns:getLogs', campaignId),
    getAnalytics:   (campaignId) => ipcRenderer.invoke('campaigns:getAnalytics', campaignId),
    schedule:           (data) => ipcRenderer.invoke('campaigns:schedule', data),
    cancelSchedule: (campaignId) => ipcRenderer.invoke('campaigns:cancelSchedule', campaignId)
  },

  // Email
  email: {
    send:    (data) => ipcRenderer.invoke('email:send', data),
    testSend: (data) => ipcRenderer.invoke('email:testSend', data),
    pause:       () => ipcRenderer.invoke('email:pause'),
    resume:      () => ipcRenderer.invoke('email:resume'),
    stop:        () => ipcRenderer.invoke('email:stop'),
    circuitState:() => ipcRenderer.invoke('email:circuitState'),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('email:progress', handler);
      return () => ipcRenderer.removeListener('email:progress', handler);
    },
    removeProgressListener: () => ipcRenderer.removeAllListeners('email:progress')
  },

  // Verification
  verify: {
    email: (email, options = {}) => ipcRenderer.invoke('verify:email', normalizeVerificationPayload('single', email, options)),
    bulk:  (emails, options = {}) => ipcRenderer.invoke('verify:bulk', normalizeVerificationPayload('bulk', emails, options)),
    pause:  () => ipcRenderer.invoke('verify:pause'),
    resume: () => ipcRenderer.invoke('verify:resume'),
    stop:   () => ipcRenderer.invoke('verify:stop'),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('verify:progress', handler);
      return () => ipcRenderer.removeListener('verify:progress', handler);
    },
    removeProgressListener: () => ipcRenderer.removeAllListeners('verify:progress')
  },

  // Spam Check & Auto-Fix
  spam: {
    check:              (data) => ipcRenderer.invoke('spam:check', data),
    autoFix:            (data) => ipcRenderer.invoke('spam:autoFix', data),
    getSuggestions:     (word) => ipcRenderer.invoke('spam:getSuggestions', word),
    getReplacements:        () => ipcRenderer.invoke('spam:getReplacements'),
    addReplacement:     (item) => ipcRenderer.invoke('spam:addReplacement', item),
    updateReplacement:  (item) => ipcRenderer.invoke('spam:updateReplacement', item),
    deleteReplacement:    (id) => ipcRenderer.invoke('spam:deleteReplacement', id)
  },

  // Tracking
  tracking: {
    addEvent: (event) => ipcRenderer.invoke('tracking:addEvent', event),
    getEvents: (campaignId) => ipcRenderer.invoke('tracking:getEvents', campaignId)
  },

  // Settings
  settings: {
    get:                       () => ipcRenderer.invoke('settings:get'),
    save:           (settings) => ipcRenderer.invoke('settings:save', settings),
    getWarmup:                 () => ipcRenderer.invoke('settings:getWarmup'),
    saveWarmup:     (settings) => ipcRenderer.invoke('settings:saveWarmup', settings),
    getDeliverability:         () => ipcRenderer.invoke('settings:getDeliverability'),
    getDiagnostics:            () => ipcRenderer.invoke('settings:getDiagnostics'),
    saveDeliverability: (settings) => ipcRenderer.invoke('settings:saveDeliverability', settings),
    checkDomain:      (domain) => ipcRenderer.invoke('settings:checkDomain', domain),
    exportAll:                 () => ipcRenderer.invoke('settings:exportAll'),
    importAll:                 () => ipcRenderer.invoke('settings:importAll')
  },

  entitlement: {
    getState:                  () => ipcRenderer.invoke('entitlement:getState')
  },

  cloud: {
    getConfig:                 () => ipcRenderer.invoke('cloud:getConfig'),
    getStatus:                 () => ipcRenderer.invoke('cloud:getStatus'),
    saveConfig:         (config) => ipcRenderer.invoke('cloud:saveConfig', config),
    testConnections:           () => ipcRenderer.invoke('cloud:testConnections'),
    getSyncStatus:             () => ipcRenderer.invoke('cloud:getSyncStatus'),
    syncNow:                   () => ipcRenderer.invoke('cloud:syncNow'),
    getCheckoutUrl:      (data) => ipcRenderer.invoke('cloud:getCheckoutUrl', data),
    openCheckout:        (data) => ipcRenderer.invoke('cloud:openCheckout', data)
  },

  account: {
    getStatus:                 () => ipcRenderer.invoke('account:getStatus'),
    signUp:          (payload) => ipcRenderer.invoke('account:signUp', payload),
    signIn:          (payload) => ipcRenderer.invoke('account:signIn', payload),
    refresh:                   () => ipcRenderer.invoke('account:refresh'),
    signOut:                   () => ipcRenderer.invoke('account:signOut')
  },

  // AI
  ai: {
    getSettings:             () => ipcRenderer.invoke('ai:getSettings'),
    saveSettings:  (settings) => ipcRenderer.invoke('ai:saveSettings', settings),
    improveSubject:    (data) => ipcRenderer.invoke('ai:improveSubject', data),
    analyzeContent:    (data) => ipcRenderer.invoke('ai:analyzeContent', data),
    generateContent:   (data) => ipcRenderer.invoke('ai:generateContent', data),
    generateTemplateBlocks: (data) => ipcRenderer.invoke('ai:generateTemplateBlocks', data),
    getModels:               () => ipcRenderer.invoke('ai:getModels'),
    getLmstudioModels: (baseUrl) => ipcRenderer.invoke('ai:getLmstudioModels', baseUrl),
    testConnection: (settings) => ipcRenderer.invoke('ai:testConnection', settings),
    getDiagnostics:          () => ipcRenderer.invoke('ai:getDiagnostics'),
    probeUrl:              (url) => ipcRenderer.invoke('ai:probeUrl', url),
    localAnalysis:     (data) => ipcRenderer.invoke('ai:localAnalysis', data),
    getAppContext:      () => ipcRenderer.invoke('ai:getAppContext'),
    getUnverifiedContacts: () => ipcRenderer.invoke('ai:getUnverifiedContacts'),
    getDeliverabilitySnapshot: () => ipcRenderer.invoke('ai:getDeliverabilitySnapshot'),
    getCapabilities:     () => ipcRenderer.invoke('ai:getCapabilities'),
    getMemories:        () => ipcRenderer.invoke('ai:getMemories'),
    setMemory:      (payload) => ipcRenderer.invoke('ai:setMemory', payload),
    deleteMemory:       (key) => ipcRenderer.invoke('ai:deleteMemory', key),
    deleteContact:       (id) => ipcRenderer.invoke('ai:deleteContact', id),
    executeAction:  (action) => ipcRenderer.invoke('ai:executeAction', action),
    chat:          (payload) => ipcRenderer.invoke('ai:chat', payload),
  },

  // Stats
  stats: {
    getDashboard:             () => ipcRenderer.invoke('stats:getDashboard'),
    getEngagementAnalytics: (params) => ipcRenderer.invoke('stats:getEngagementAnalytics', params),
    getInstallDate:           () => ipcRenderer.invoke('stats:getInstallDate')
  },

  // SMTP Warmup
  warmup: {
    getSchedules:          () => ipcRenderer.invoke('warmup:getSchedules'),
    create:      (schedule) => ipcRenderer.invoke('warmup:create', schedule),
    update:      (schedule) => ipcRenderer.invoke('warmup:update', schedule),
    delete:   (scheduleId) => ipcRenderer.invoke('warmup:delete', scheduleId),
    autoGenerate:  (config) => ipcRenderer.invoke('warmup:autoGenerate', config),
    detectColdIP: (smtpAccountId) => ipcRenderer.invoke('warmup:detectColdIP', smtpAccountId),
    getProgress: (smtpAccountId) => ipcRenderer.invoke('warmup:getProgress', smtpAccountId),
    enforceLimit: (smtpAccountId) => ipcRenderer.invoke('warmup:enforceLimit', smtpAccountId),
    getReputation: (smtpAccountId) => ipcRenderer.invoke('warmup:getReputation', smtpAccountId)
  },

  // Export
  export: {
    contacts:            (contacts) => ipcRenderer.invoke('export:contacts', contacts),
    logs:                   (logs) => ipcRenderer.invoke('export:logs', logs),
    blacklist:                   () => ipcRenderer.invoke('export:blacklist'),
    verificationResults: (results) => ipcRenderer.invoke('export:verificationResults', results),
    templateFile:  (data, filename) => ipcRenderer.invoke('export:templateFile', { data, filename })
  },

  // Backup & Restore
  backup: {
    create:              () => ipcRenderer.invoke('backup:create'),
    restore:             () => ipcRenderer.invoke('backup:restore'),
    getInfo:             () => ipcRenderer.invoke('backup:getInfo'),
    getHistory:          () => ipcRenderer.invoke('backup:getHistory'),
    autoConfig:  (config) => ipcRenderer.invoke('backup:autoConfig', config),
    getAutoConfig:       () => ipcRenderer.invoke('backup:getAutoConfig')
  },

  // System
  system: {
    resetAll: () => ipcRenderer.invoke('system:resetAll')
  },

  // Segments
  segments: {
    getAll:              () => ipcRenderer.invoke('segments:getAll'),
    get:          (id) => ipcRenderer.invoke('segments:get', id),
    add:      (segment) => ipcRenderer.invoke('segments:add', segment),
    update:   (segment) => ipcRenderer.invoke('segments:update', segment),
    delete:       (id) => ipcRenderer.invoke('segments:delete', id),
    getContacts: (filters) => ipcRenderer.invoke('segments:getContacts', filters),
    count:      (filters) => ipcRenderer.invoke('segments:count', filters)
  },

  // Retry Queue
  retry: {
    getStats:         () => ipcRenderer.invoke('retry:getStats'),
    clear: (campaignId) => ipcRenderer.invoke('retry:clear', campaignId)
  },

  // Deliverability
  deliverability: {
    getHistory: (smtpAccountId) => ipcRenderer.invoke('deliverability:getHistory', smtpAccountId),
    getScore:   (smtpAccountId) => ipcRenderer.invoke('deliverability:getScore', smtpAccountId)
  },

  // Global Search
  search: {
    global: (query) => ipcRenderer.invoke('search:global', query)
  },

  // SMTP detailed test
  smtpTest: {
    detailed: (account) => ipcRenderer.invoke('smtp:testDetailed', account)
  },

  // DNS checking
  dns: {
    check: (domain) => ipcRenderer.invoke('dns:check', domain)
  },

  // Real-time data change listener — fires whenever main process writes data
  onDataChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('data:changed', handler);
    return () => ipcRenderer.removeListener('data:changed', handler);
  },

  // Real-time tracking unsubscribe listener — fires when someone unsubscribes via tracking server
  onTrackingUnsubscribe: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tracking:unsubscribe', handler);
    return () => ipcRenderer.removeListener('tracking:unsubscribe', handler);
  },

  // Tray → renderer navigation.
  onNavigatePage: (callback) => {
    const handler = (_event, page) => {
      _pendingNavigatePage = null;
      callback(page);
    };
    ipcRenderer.on('navigate:page', handler);

    if (_pendingNavigatePage !== null) {
      const buffered = _pendingNavigatePage;
      _pendingNavigatePage = null;
      queueMicrotask(() => callback(buffered));
    }

    return () => ipcRenderer.removeListener('navigate:page', handler);
  },

  // Automations (Phase 1)
  automation: {
    getAll:     () => ipcRenderer.invoke('automation:getAll'),
    get:        (id) => ipcRenderer.invoke('automation:get', id),
    create:     (data) => ipcRenderer.invoke('automation:create', data),
    update:     (data) => ipcRenderer.invoke('automation:update', data),
    delete:     (id) => ipcRenderer.invoke('automation:delete', id),
    toggle:     (id) => ipcRenderer.invoke('automation:toggle', id),
    getLogs:    (id) => ipcRenderer.invoke('automation:getLogs', id),
    processTrigger: (event) => ipcRenderer.invoke('automation:processTrigger', event)
  },

  // Drip Sequences (Phase 1)
  drip: {
    getAll:     () => ipcRenderer.invoke('drip:getAll'),
    get:        (id) => ipcRenderer.invoke('drip:get', id),
    create:     (data) => ipcRenderer.invoke('drip:create', data),
    update:     (data) => ipcRenderer.invoke('drip:update', data),
    delete:     (id) => ipcRenderer.invoke('drip:delete', id),
    toggle:     (id) => ipcRenderer.invoke('drip:toggle', id)
  },

  // Signup Forms (Phase 1)
  form: {
    getAll:         () => ipcRenderer.invoke('form:getAll'),
    get:            (id) => ipcRenderer.invoke('form:get', id),
    create:         (data) => ipcRenderer.invoke('form:create', data),
    update:         (data) => ipcRenderer.invoke('form:update', data),
    delete:         (id) => ipcRenderer.invoke('form:delete', id),
    getSubmissions: (id) => ipcRenderer.invoke('form:getSubmissions', id),
    getEmbedCode:  (id) => ipcRenderer.invoke('form:getEmbedCode', id)
  },

  // A/B Tests (Phase 1)
  abtest: {
    getAll:      () => ipcRenderer.invoke('abtest:getAll'),
    get:         (id) => ipcRenderer.invoke('abtest:get', id),
    create:      (data) => ipcRenderer.invoke('abtest:create', data),
    update:      (data) => ipcRenderer.invoke('abtest:update', data),
    delete:      (id) => ipcRenderer.invoke('abtest:delete', id),
    calculate:  (id) => ipcRenderer.invoke('abtest:calculate', id)
  },

  // Seed accounts for inbox placement testing
  seed: {
    getAll:      () => ipcRenderer.invoke('seed:getAll'),
    get:         (id) => ipcRenderer.invoke('seed:get', id),
    create:      (data) => ipcRenderer.invoke('seed:create', data),
    update:      (data) => ipcRenderer.invoke('seed:update', data),
    delete:      (id) => ipcRenderer.invoke('seed:delete', id),
    getActive:   () => ipcRenderer.invoke('seed:getActive')
  },

  // Auto-updater events
  onUpdaterStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  }
});
