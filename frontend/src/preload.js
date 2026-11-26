import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bulkMail', {
  auth: {
    register: (input) => ipcRenderer.invoke('auth:register', input),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    currentUser: () => ipcRenderer.invoke('auth:current-user'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  contacts: {
    dashboard: () => ipcRenderer.invoke('contacts:dashboard'),
    list: (filters) => ipcRenderer.invoke('contacts:list', filters),
    get: (id) => ipcRenderer.invoke('contacts:get', id),
    create: (input) => ipcRenderer.invoke('contacts:create', input),
    update: (id, input) => ipcRenderer.invoke('contacts:update', { id, input }),
    delete: (id) => ipcRenderer.invoke('contacts:delete', id),
    bulkDelete: (ids) => ipcRenderer.invoke('contacts:bulk-delete', ids),
    bulkAssignTags: (ids, tags) =>
      ipcRenderer.invoke('contacts:bulk-tag', { ids, tags }),
    exportCsv: (filters) => ipcRenderer.invoke('contacts:export', filters),
    previewImport: (input) =>
      ipcRenderer.invoke('contacts:preview-import', input),
    import: (input) => ipcRenderer.invoke('contacts:import', input),
  },
  contactLists: {
    list: (search) => ipcRenderer.invoke('contact-lists:list', search),
    create: (input) => ipcRenderer.invoke('contact-lists:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('contact-lists:update', { id, input }),
    delete: (id) => ipcRenderer.invoke('contact-lists:delete', id),
    getMembers: (id) => ipcRenderer.invoke('contact-lists:get-members', id),
    replaceMembers: (listId, contactIds) =>
      ipcRenderer.invoke('contact-lists:replace-members', {
        listId,
        contactIds,
      }),
  },
  smtpAccounts: {
    list: () => ipcRenderer.invoke('smtp-accounts:list'),
    create: (input) => ipcRenderer.invoke('smtp-accounts:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('smtp-accounts:update', { id, input }),
    delete: (id) => ipcRenderer.invoke('smtp-accounts:delete', id),
    setDefault: (id) => ipcRenderer.invoke('smtp-accounts:set-default', id),
    test: (id) => ipcRenderer.invoke('smtp-accounts:test', id),
  },
  emailTemplates: {
    list: () => ipcRenderer.invoke('email-templates:list'),
    create: (input) => ipcRenderer.invoke('email-templates:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('email-templates:update', { id, input }),
    duplicate: (id) => ipcRenderer.invoke('email-templates:duplicate', id),
    delete: (id) => ipcRenderer.invoke('email-templates:delete', id),
  },
  campaigns: {
    list: (search) => ipcRenderer.invoke('campaigns:list', search),
    get: (id) => ipcRenderer.invoke('campaigns:get', id),
    create: (input) => ipcRenderer.invoke('campaigns:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('campaigns:update', { id, input }),
    duplicate: (id) => ipcRenderer.invoke('campaigns:duplicate', id),
    delete: (id) => ipcRenderer.invoke('campaigns:delete', id),
  },
});
