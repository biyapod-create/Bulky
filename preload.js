const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  hide: () => ipcRenderer.invoke('window:hide'),
  show: () => ipcRenderer.invoke('window:show'),
  quit: () => ipcRenderer.invoke('window:quit'),

  // Contacts
  contacts: {
    getAll: () => ipcRenderer.invoke('contacts:getAll'),
    getFiltered: (filter) => ipcRenderer.invoke('contacts:getFiltered', filter),
    getPage: (params) => ipcRenderer.invoke('contacts:getPage', params),
    getStats: () => ipcRenderer.invoke('contacts:getStats'),
    add: (contact) => ipcRenderer.invoke('contacts:add', contact),
    addBulk: (contacts) => ipcRenderer.invoke('contacts:addBulk', contacts),
    update: (contact) => ipcRenderer.invoke('contacts:update', contact),
    delete: (ids) => ipcRenderer.invoke('contacts:delete', ids),
    deleteByVerification: (status) => ipcRenderer.invoke('contacts:deleteByVerification', status),
    getRecipientCount: (filter) => ipcRenderer.invoke('contacts:getRecipientCount', filter),
    getForCampaign: (filter) => ipcRenderer.invoke('contacts:getForCampaign', filter),
    import: () => ipcRenderer.invoke('contacts:import'),
    importRaw: () => ipcRenderer.invoke('contacts:importRaw'),
    importFromPath: (filePath) => ipcRenderer.invoke('contacts:importFromPath', filePath),
    addTagBulk: (ids, tagId) => ipcRenderer.invoke('contacts:addTagBulk', ids, tagId),
    getRecipientBreakdown: (filter) => ipcRenderer.invoke('contacts:getRecipientBreakdown', filter)
  },

  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    add: (tag) => ipcRenderer.invoke('tags:add', tag),
    delete: (id) => ipcRenderer.invoke('tags:delete', id)
  },

  // Lists
  lists: {
    getAll: () => ipcRenderer.invoke('lists:getAll'),
    add: (list) => ipcRenderer.invoke('lists:add', list),
    update: (list) => ipcRenderer.invoke('lists:update', list),
    delete: (id) => ipcRenderer.invoke('lists:delete', id),
    getContacts: (listId) => ipcRenderer.invoke('lists:getContacts', listId)
  },

  // Blacklist
  blacklist: {
    getAll: () => ipcRenderer.invoke('blacklist:getAll'),
    add: (entry) => ipcRenderer.invoke('blacklist:add', entry),
    addBulk: (entries) => ipcRenderer.invoke('blacklist:addBulk', entries),
    remove: (id) => ipcRenderer.invoke('blacklist:remove', id),
    check: (email) => ipcRenderer.invoke('blacklist:check', email),
    import: () => ipcRenderer.invoke('blacklist:import'),
    autoBlacklist: () => ipcRenderer.invoke('bounces:autoBlacklist')
  },

  // Unsubscribes
  unsubscribes: {
    getAll: () => ipcRenderer.invoke('unsubscribes:getAll'),
    add: (data) => ipcRenderer.invoke('unsubscribes:add', data),
    remove: (email) => ipcRenderer.invoke('unsubscribes:remove', email),
    check: (email) => ipcRenderer.invoke('unsubscribes:check', email)
  },

  // Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    getByCategory: (category) => ipcRenderer.invoke('templates:getByCategory', category),
    getWithBlocks: (templateId) => ipcRenderer.invoke('templates:getWithBlocks', templateId),
    saveBlocks: (data) => ipcRenderer.invoke('templates:saveBlocks', data),
    getCategories: () => ipcRenderer.invoke('templates:getCategories'),
    add: (template) => ipcRenderer.invoke('templates:add', template),
    update: (template) => ipcRenderer.invoke('templates:update', template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
    importFile: () => ipcRenderer.invoke('templates:importFile'),
    exportTemplate: (template, filename) => ipcRenderer.invoke('templates:exportTemplate', { template, filename })
  },

  // SMTP Accounts (Multiple)
  smtpAccounts: {
    getAll: () => ipcRenderer.invoke('smtpAccounts:getAll'),
    getActive: () => ipcRenderer.invoke('smtpAccounts:getActive'),
    add: (account) => ipcRenderer.invoke('smtpAccounts:add', account),
    update: (account) => ipcRenderer.invoke('smtpAccounts:update', account),
    delete: (id) => ipcRenderer.invoke('smtpAccounts:delete', id),
    test: (account) => ipcRenderer.invoke('smtpAccounts:test', account)
  },

  // Legacy SMTP (single)
  smtp: {
    get: () => ipcRenderer.invoke('smtp:get'),
    save: (settings) => ipcRenderer.invoke('smtp:save', settings),
    test: (settings) => ipcRenderer.invoke('smtp:test', settings)
  },

  // Campaigns
  campaigns: {
    getAll: () => ipcRenderer.invoke('campaigns:getAll'),
    getScheduled: () => ipcRenderer.invoke('campaigns:getScheduled'),
    add: (campaign) => ipcRenderer.invoke('campaigns:add', campaign),
    update: (campaign) => ipcRenderer.invoke('campaigns:update', campaign),
    delete: (id) => ipcRenderer.invoke('campaigns:delete', id),
    getLogs: (campaignId) => ipcRenderer.invoke('campaigns:getLogs', campaignId),
    getAnalytics: (campaignId) => ipcRenderer.invoke('campaigns:getAnalytics', campaignId),
    schedule: (data) => ipcRenderer.invoke('campaigns:schedule', data),
    cancelSchedule: (campaignId) => ipcRenderer.invoke('campaigns:cancelSchedule', campaignId)
  },

  // Email
  email: {
    send: (data) => ipcRenderer.invoke('email:send', data),
    testSend: (data) => ipcRenderer.invoke('email:testSend', data),
    pause: () => ipcRenderer.invoke('email:pause'),
    resume: () => ipcRenderer.invoke('email:resume'),
    stop: () => ipcRenderer.invoke('email:stop'),
    onProgress: (callback) => {
      ipcRenderer.removeAllListeners('email:progress'); // prevent stacking
      const handler = (event, data) => callback(data);
      ipcRenderer.on('email:progress', handler);
      return () => ipcRenderer.removeListener('email:progress', handler);
    },
    removeProgressListener: () => ipcRenderer.removeAllListeners('email:progress')
  },

  // Verification
  verify: {
    email: (email, options = {}) => ipcRenderer.invoke('verify:email', { email, smtpCheck: options.smtpCheck === true }),
    bulk: (emails, options = {}) => ipcRenderer.invoke('verify:bulk', { emails, smtpCheck: options.smtpCheck === true }),
    pause: () => ipcRenderer.invoke('verify:pause'),
    resume: () => ipcRenderer.invoke('verify:resume'),
    stop: () => ipcRenderer.invoke('verify:stop'),
    onProgress: (callback) => {
      ipcRenderer.removeAllListeners('verify:progress'); // prevent stacking
      const handler = (event, data) => callback(data);
      ipcRenderer.on('verify:progress', handler);
      return () => ipcRenderer.removeListener('verify:progress', handler);
    },
    removeProgressListener: () => ipcRenderer.removeAllListeners('verify:progress')
  },

  // Spam Check & Auto-Fix
  spam: {
    check: (data) => ipcRenderer.invoke('spam:check', data),
    autoFix: (data) => ipcRenderer.invoke('spam:autoFix', data),
    getSuggestions: (word) => ipcRenderer.invoke('spam:getSuggestions', word),
    getReplacements: () => ipcRenderer.invoke('spam:getReplacements'),
    addReplacement: (item) => ipcRenderer.invoke('spam:addReplacement', item),
    updateReplacement: (item) => ipcRenderer.invoke('spam:updateReplacement', item),
    deleteReplacement: (id) => ipcRenderer.invoke('spam:deleteReplacement', id)
  },

  // Tracking
  tracking: {
    addEvent: (event) => ipcRenderer.invoke('tracking:addEvent', event),
    getEvents: (campaignId) => ipcRenderer.invoke('tracking:getEvents', campaignId)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    getWarmup: () => ipcRenderer.invoke('settings:getWarmup'),
    saveWarmup: (settings) => ipcRenderer.invoke('settings:saveWarmup', settings),
    getDeliverability: () => ipcRenderer.invoke('settings:getDeliverability'),
    saveDeliverability: (settings) => ipcRenderer.invoke('settings:saveDeliverability', settings),
    checkDomain: (domain) => ipcRenderer.invoke('settings:checkDomain', domain),
    exportAll: () => ipcRenderer.invoke('settings:exportAll'),
    importAll: () => ipcRenderer.invoke('settings:importAll')
  },

  // AI
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('ai:saveSettings', settings),
    improveSubject: (data) => ipcRenderer.invoke('ai:improveSubject', data),
    analyzeContent: (data) => ipcRenderer.invoke('ai:analyzeContent', data),
    generateContent: (data) => ipcRenderer.invoke('ai:generateContent', data),
    generateTemplateBlocks: (data) => ipcRenderer.invoke('ai:generateTemplateBlocks', data),
    getModels: () => ipcRenderer.invoke('ai:getModels'),
    localAnalysis: (data) => ipcRenderer.invoke('ai:localAnalysis', data)
  },

  // Stats
  stats: {
    getDashboard: () => ipcRenderer.invoke('stats:getDashboard')
  },

  // SMTP Warmup
  warmup: {
    getSchedules: () => ipcRenderer.invoke('warmup:getSchedules'),
    create: (schedule) => ipcRenderer.invoke('warmup:create', schedule),
    update: (schedule) => ipcRenderer.invoke('warmup:update', schedule),
    delete: (scheduleId) => ipcRenderer.invoke('warmup:delete', scheduleId),
    autoGenerate: (config) => ipcRenderer.invoke('warmup:autoGenerate', config)
  },

  // Export
  export: {
    contacts: (contacts) => ipcRenderer.invoke('export:contacts', contacts),
    logs: (logs) => ipcRenderer.invoke('export:logs', logs),
    blacklist: () => ipcRenderer.invoke('export:blacklist'),
    verificationResults: (results) => ipcRenderer.invoke('export:verificationResults', results),
    templateFile: (data, filename) => ipcRenderer.invoke('export:templateFile', { data, filename })
  },

  // Backup & Restore
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    getInfo: () => ipcRenderer.invoke('backup:getInfo'),
    getHistory: () => ipcRenderer.invoke('backup:getHistory'),
    autoConfig: (config) => ipcRenderer.invoke('backup:autoConfig', config),
    getAutoConfig: () => ipcRenderer.invoke('backup:getAutoConfig')
  },

  // System
  system: {
    resetAll: () => ipcRenderer.invoke('system:resetAll')
  },

  // Segments
  segments: {
    getAll: () => ipcRenderer.invoke('segments:getAll'),
    get: (id) => ipcRenderer.invoke('segments:get', id),
    add: (segment) => ipcRenderer.invoke('segments:add', segment),
    update: (segment) => ipcRenderer.invoke('segments:update', segment),
    delete: (id) => ipcRenderer.invoke('segments:delete', id),
    getContacts: (filters) => ipcRenderer.invoke('segments:getContacts', filters),
    count: (filters) => ipcRenderer.invoke('segments:count', filters)
  },

  // Retry Queue
  retry: {
    getStats: () => ipcRenderer.invoke('retry:getStats'),
    clear: (campaignId) => ipcRenderer.invoke('retry:clear', campaignId)
  },

  // Deliverability
  deliverability: {
    getHistory: (smtpAccountId) => ipcRenderer.invoke('deliverability:getHistory', smtpAccountId),
    getScore: (smtpAccountId) => ipcRenderer.invoke('deliverability:getScore', smtpAccountId)
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

  // Real-time data change listener â€” fires whenever main process writes data
  onDataChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('data:changed', handler);
    return () => ipcRenderer.removeListener('data:changed', handler);
  },

  // Real-time tracking unsubscribe listener â€” fires when someone unsubscribes via tracking server
  onTrackingUnsubscribe: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('tracking:unsubscribe', handler);
    return () => ipcRenderer.removeListener('tracking:unsubscribe', handler);
  },

  // Tray â†’ renderer navigation: fires when the user clicks "Settings" in the system tray menu
  onNavigatePage: (callback) => {
    const handler = (event, page) => callback(page);
    ipcRenderer.on('navigate:page', handler);
    return () => ipcRenderer.removeListener('navigate:page', handler);
  }
});
