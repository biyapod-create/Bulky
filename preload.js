const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Contacts
  contacts: {
    getAll: () => ipcRenderer.invoke('contacts:getAll'),
    getFiltered: (filter) => ipcRenderer.invoke('contacts:getFiltered', filter),
    add: (contact) => ipcRenderer.invoke('contacts:add', contact),
    addBulk: (contacts) => ipcRenderer.invoke('contacts:addBulk', contacts),
    update: (contact) => ipcRenderer.invoke('contacts:update', contact),
    delete: (ids) => ipcRenderer.invoke('contacts:delete', ids),
    deleteByVerification: (status) => ipcRenderer.invoke('contacts:deleteByVerification', status),
    import: () => ipcRenderer.invoke('contacts:import')
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
    import: () => ipcRenderer.invoke('blacklist:import')
  },

  // Unsubscribes
  unsubscribes: {
    getAll: () => ipcRenderer.invoke('unsubscribes:getAll'),
    add: (data) => ipcRenderer.invoke('unsubscribes:add', data),
    check: (email) => ipcRenderer.invoke('unsubscribes:check', email)
  },

  // Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    getByCategory: (category) => ipcRenderer.invoke('templates:getByCategory', category),
    add: (template) => ipcRenderer.invoke('templates:add', template),
    update: (template) => ipcRenderer.invoke('templates:update', template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id)
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
    pause: () => ipcRenderer.invoke('email:pause'),
    resume: () => ipcRenderer.invoke('email:resume'),
    stop: () => ipcRenderer.invoke('email:stop'),
    onProgress: (callback) => {
      ipcRenderer.on('email:progress', (event, data) => callback(data));
    }
  },

  // Verification
  verify: {
    email: (email) => ipcRenderer.invoke('verify:email', email),
    bulk: (emails) => ipcRenderer.invoke('verify:bulk', emails),
    onProgress: (callback) => {
      ipcRenderer.on('verify:progress', (event, data) => callback(data));
    }
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
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },

  // Stats
  stats: {
    getDashboard: () => ipcRenderer.invoke('stats:getDashboard')
  },

  // Export
  export: {
    contacts: (contacts) => ipcRenderer.invoke('export:contacts', contacts),
    logs: (logs) => ipcRenderer.invoke('export:logs', logs),
    blacklist: () => ipcRenderer.invoke('export:blacklist'),
    verificationResults: (results) => ipcRenderer.invoke('export:verificationResults', results)
  },

  // Backup & Restore
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    getInfo: () => ipcRenderer.invoke('backup:getInfo')
  }
});
