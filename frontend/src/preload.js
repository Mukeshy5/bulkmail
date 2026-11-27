import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bulkMail', {
  auth: {
    needsSetup: () => ipcRenderer.invoke('auth:needs-setup'),
    register: (input) => ipcRenderer.invoke('auth:register', input),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    currentUser: () => ipcRenderer.invoke('auth:current-user'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  workspace: {
    segments: (input) => ipcRenderer.invoke('workspace:segments', input),
    saveSegment: (input) => ipcRenderer.invoke('workspace:saveSegment', input),
    deleteSegment: (input) =>
      ipcRenderer.invoke('workspace:deleteSegment', input),
    segmentCount: (input) =>
      ipcRenderer.invoke('workspace:segmentCount', input),
    review: (input) => ipcRenderer.invoke('workspace:review', input),
    sendTest: (input) => ipcRenderer.invoke('workspace:sendTest', input),
    plan: (input) => ipcRenderer.invoke('workspace:plan', input),
    control: (input) => ipcRenderer.invoke('workspace:control', input),
    metrics: (input) => ipcRenderer.invoke('workspace:metrics', input),
    analytics: (input) => ipcRenderer.invoke('workspace:analytics', input),
    report: (input) => ipcRenderer.invoke('workspace:report', input),
    exportReport: (input) =>
      ipcRenderer.invoke('workspace:exportReport', input),
    suppressions: (input) =>
      ipcRenderer.invoke('workspace:suppressions', input),
    suppress: (input) => ipcRenderer.invoke('workspace:suppress', input),
    forms: (input) => ipcRenderer.invoke('workspace:forms', input),
    saveForm: (input) => ipcRenderer.invoke('workspace:saveForm', input),
    deleteForm: (input) => ipcRenderer.invoke('workspace:deleteForm', input),
    activity: (input) => ipcRenderer.invoke('workspace:activity', input),
    notifications: (input) =>
      ipcRenderer.invoke('workspace:notifications', input),
    readNotification: (input) =>
      ipcRenderer.invoke('workspace:readNotification', input),
    users: (input) => ipcRenderer.invoke('workspace:users', input),
    saveUser: (input) => ipcRenderer.invoke('workspace:saveUser', input),
    savePermissions: (input) =>
      ipcRenderer.invoke('workspace:savePermissions', input),
    deleteUser: (input) => ipcRenderer.invoke('workspace:deleteUser', input),
    newRecoveryCode: (input) =>
      ipcRenderer.invoke('workspace:newRecoveryCode', input),
    resetPassword: (input) =>
      ipcRenderer.invoke('workspace:resetPassword', input),
    changePassword: (input) =>
      ipcRenderer.invoke('workspace:changePassword', input),
    preferences: (input) => ipcRenderer.invoke('workspace:preferences', input),
    theme: (input) => ipcRenderer.invoke('workspace:theme', input),
    settings: (input) => ipcRenderer.invoke('workspace:settings', input),
    saveSettings: (input) =>
      ipcRenderer.invoke('workspace:saveSettings', input),
    checkPublic: (input) => ipcRenderer.invoke('workspace:checkPublic', input),
    chooseBackupFolder: (input) =>
      ipcRenderer.invoke('workspace:chooseBackupFolder', input),
    backup: (input) => ipcRenderer.invoke('workspace:backup', input),
    restore: (input) => ipcRenderer.invoke('workspace:restore', input),
    exportTemplate: (input) =>
      ipcRenderer.invoke('workspace:exportTemplate', input),
    openForm: (input) => ipcRenderer.invoke('workspace:openForm', input),
  },
  contacts: {
    dashboard: () => ipcRenderer.invoke('contacts:dashboard'),
    list: (filters) => ipcRenderer.invoke('contacts:list', filters),
    get: (id) => ipcRenderer.invoke('contacts:get', id),
    create: (input) => ipcRenderer.invoke('contacts:create', input),
    update: (id, input) => ipcRenderer.invoke('contacts:update', { id, input }),
    delete: (id) => ipcRenderer.invoke('contacts:delete', id),
    bulkDelete: (ids) => ipcRenderer.invoke('contacts:bulk-delete', ids),
    bulkStatus: (input) => ipcRenderer.invoke('contacts:bulk-status', input),
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
    transfer: (input) => ipcRenderer.invoke('contact-lists:transfer', input),
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
    get: (id) => ipcRenderer.invoke('email-templates:get', id),
    create: (input) => ipcRenderer.invoke('email-templates:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('email-templates:update', { id, input }),
    duplicate: (id) => ipcRenderer.invoke('email-templates:duplicate', id),
    delete: (id) => ipcRenderer.invoke('email-templates:delete', id),
    favorite: (input) => ipcRenderer.invoke('email-templates:favorite', input),
    versions: (id) => ipcRenderer.invoke('email-templates:versions', id),
    restoreVersion: (input) =>
      ipcRenderer.invoke('email-templates:restore-version', input),
    render: (input) => ipcRenderer.invoke('email-templates:render', input),
    link: (input) => ipcRenderer.invoke('email-templates:link', input),
    openLink: (input) => ipcRenderer.invoke('desktop:open-email-link', input),
    inspect: (input) => ipcRenderer.invoke('email-templates:inspect', input),
    portable: (input) => ipcRenderer.invoke('email-templates:portable', input),
    exportHtml: (input) =>
      ipcRenderer.invoke('email-templates:export-html', input),
    copyHtml: (input) => ipcRenderer.invoke('desktop:copy-email-html', input),
    test: (input) => ipcRenderer.invoke('email-templates:test', input),
  },
  emailMedia: {
    list: (search) => ipcRenderer.invoke('email-media:list', search),
    get: (id) => ipcRenderer.invoke('email-media:get', id),
    upload: (input) => ipcRenderer.invoke('email-media:upload', input),
    crop: (input) => ipcRenderer.invoke('email-media:crop', input),
    delete: (id) => ipcRenderer.invoke('email-media:delete', id),
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
