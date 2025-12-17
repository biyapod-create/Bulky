const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Contacts
  contacts: {
    getAll: () => ipcRenderer.invoke('contacts:getAll'),
    add: (contact) => ipcRenderer.invoke('contacts:add', contact),
    addBulk: (contacts) => ipcRenderer.invoke('contacts:addBulk', contacts),
    update: (contact) => ipcRenderer.invoke('contacts:update', contact),
    delete: (ids) => ipcRenderer.invoke('contacts:delete', ids),
    import: () => ipcRenderer.invoke('contacts:import')
  },

  // Lists
  lists: {
    getAll: () => ipcRenderer.invoke('lists:getAll'),
    add: (list) => ipcRenderer.invoke('lists:add', list),
    update: (list) => ipcRenderer.invoke('lists:update', list),
    delete: (id) => ipcRenderer.invoke('lists:delete', id),
    getContacts: (listId) => ipcRenderer.invoke('lists:getContacts', listId)
  },

  // Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    add: (template) => ipcRenderer.invoke('templates:add', template),
    update: (template) => ipcRenderer.invoke('templates:update', template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id)
  },

  // Campaigns
  campaigns: {
    getAll: () => ipcRenderer.invoke('campaigns:getAll'),
    add: (campaign) => ipcRenderer.invoke('campaigns:add', campaign),
    update: (campaign) => ipcRenderer.invoke('campaigns:update', campaign),
    delete: (id) => ipcRenderer.invoke('campaigns:delete', id),
    getLogs: (campaignId) => ipcRenderer.invoke('campaigns:getLogs', campaignId)
  },

  // SMTP
  smtp: {
    get: () => ipcRenderer.invoke('smtp:get'),
    save: (settings) => ipcRenderer.invoke('smtp:save', settings),
    test: (settings) => ipcRenderer.invoke('smtp:test', settings)
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

  // Spam Check
  spam: {
    check: (data) => ipcRenderer.invoke('spam:check', data)
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
    logs: (logs) => ipcRenderer.invoke('export:logs', logs)
  }
});
