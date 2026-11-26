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
});
