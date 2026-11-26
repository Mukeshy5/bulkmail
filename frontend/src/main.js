import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import {
  bulkAssignTags,
  bulkDeleteContacts,
  createContact,
  createContactList,
  deleteContact,
  deleteContactList,
  exportContactsCsv,
  getContact,
  getContactListMembers,
  getDashboardSummary,
  listContactLists,
  listContacts,
  replaceContactListMembers,
  updateContact,
  updateContactList,
} from './main/contacts-service.js';
import {
  importContacts,
  previewContactImport,
} from './main/contact-import-service.js';
import {
  createSmtpAccount,
  deleteSmtpAccount,
  listSmtpAccounts,
  setDefaultSmtpAccount,
  testSmtpAccount,
  updateSmtpAccount,
} from './main/smtp-service.js';
import {
  createCampaignDraft,
  deleteCampaignDraft,
  duplicateCampaignDraft,
  getCampaign,
  listCampaigns,
  updateCampaignDraft,
} from './main/campaign-service.js';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from './main/email-template-service.js';
import { loginUser, registerUser } from './main/auth-service.js';
import { openUserDatabase } from './main/database.js';

const contactEditorRoles = new Set([
  'super_admin',
  'administrator',
  'marketing_manager',
  'campaign_operator',
]);
const smtpAdminRoles = new Set(['super_admin', 'administrator']);

if (started) {
  app.quit();
}

let mainWindow;
let database;
const authenticatedUsers = new Map();

const assertTrustedRenderer = (event) => {
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error(
      'Untrusted renderer attempted to access the application API.',
    );
  }
};

const getAuthenticatedUser = (event) => {
  assertTrustedRenderer(event);
  const user = authenticatedUsers.get(event.sender.id);
  if (!user) {
    throw new Error('Sign in before using the workspace.');
  }
  return user;
};

const requireContactEditor = (event) => {
  const user = getAuthenticatedUser(event);
  if (!contactEditorRoles.has(user.role)) {
    throw new Error('Your account has read-only access.');
  }
  return user;
};

const requireSmtpAdmin = (event) => {
  const user = getAuthenticatedUser(event);
  if (!smtpAdminRoles.has(user.role)) {
    throw new Error('Only administrators can manage SMTP accounts.');
  }
  return user;
};

const encryptSmtpSecret = (secret) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure credential storage is unavailable on this device. SMTP passwords were not saved.',
    );
  }
  return safeStorage.encryptString(secret);
};

const decryptSmtpSecret = (encryptedSecret) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure credential storage is unavailable on this device. SMTP passwords cannot be accessed.',
    );
  }
  return safeStorage.decryptString(encryptedSecret);
};

const registerIpcHandlers = () => {
  ipcMain.handle('auth:register', async (event, input) => {
    assertTrustedRenderer(event);
    return registerUser(database, input);
  });

  ipcMain.handle('auth:login', async (event, input) => {
    assertTrustedRenderer(event);
    const result = await loginUser(database, input);
    if (result.ok) {
      authenticatedUsers.set(event.sender.id, result.user);
    }
    return result;
  });

  ipcMain.handle('auth:current-user', (event) => {
    assertTrustedRenderer(event);
    return {
      ok: true,
      user: authenticatedUsers.get(event.sender.id) ?? null,
    };
  });

  ipcMain.handle('auth:logout', (event) => {
    assertTrustedRenderer(event);
    authenticatedUsers.delete(event.sender.id);
    return { ok: true };
  });

  ipcMain.handle('contacts:dashboard', (event) => {
    getAuthenticatedUser(event);
    return getDashboardSummary(database);
  });

  ipcMain.handle('contacts:list', (event, filters) => {
    getAuthenticatedUser(event);
    return listContacts(database, filters);
  });

  ipcMain.handle('contacts:get', (event, id) => {
    getAuthenticatedUser(event);
    return getContact(database, id);
  });

  ipcMain.handle('contacts:create', (event, input) => {
    const user = requireContactEditor(event);
    return createContact(database, user.id, input);
  });

  ipcMain.handle('contacts:update', (event, { id, input }) => {
    const user = requireContactEditor(event);
    return updateContact(database, user.id, id, input);
  });

  ipcMain.handle('contacts:delete', (event, id) => {
    const user = requireContactEditor(event);
    return deleteContact(database, user.id, id);
  });

  ipcMain.handle('contacts:bulk-delete', (event, ids) => {
    const user = requireContactEditor(event);
    return bulkDeleteContacts(database, user.id, ids);
  });

  ipcMain.handle('contacts:bulk-tag', (event, { ids, tags }) => {
    const user = requireContactEditor(event);
    return bulkAssignTags(database, user.id, ids, tags);
  });

  ipcMain.handle('contacts:export', async (event, filters) => {
    getAuthenticatedUser(event);
    const result = exportContactsCsv(database, filters);
    if (!result.ok) return result;

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export contacts',
      defaultPath: 'contacts.csv',
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
    });
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, cancelled: true };
    }

    await writeFile(saveResult.filePath, result.csv, 'utf8');
    return { ok: true, count: result.count };
  });

  ipcMain.handle('contacts:preview-import', (event, input) => {
    getAuthenticatedUser(event);
    return previewContactImport(input);
  });

  ipcMain.handle('contacts:import', async (event, input) => {
    const user = requireContactEditor(event);
    return importContacts(database, user.id, input);
  });

  ipcMain.handle('contact-lists:list', (event, search) => {
    getAuthenticatedUser(event);
    return listContactLists(database, search);
  });

  ipcMain.handle('contact-lists:create', (event, input) => {
    const user = requireContactEditor(event);
    return createContactList(database, user.id, input);
  });

  ipcMain.handle('contact-lists:update', (event, { id, input }) => {
    const user = requireContactEditor(event);
    return updateContactList(database, user.id, id, input);
  });

  ipcMain.handle('contact-lists:delete', (event, id) => {
    const user = requireContactEditor(event);
    return deleteContactList(database, user.id, id);
  });

  ipcMain.handle('contact-lists:get-members', (event, id) => {
    getAuthenticatedUser(event);
    return getContactListMembers(database, id);
  });

  ipcMain.handle(
    'contact-lists:replace-members',
    (event, { listId, contactIds }) => {
      const user = requireContactEditor(event);
      return replaceContactListMembers(database, user.id, listId, contactIds);
    },
  );

  ipcMain.handle('smtp-accounts:list', (event) => {
    getAuthenticatedUser(event);
    return listSmtpAccounts(database);
  });

  ipcMain.handle('smtp-accounts:create', (event, input) => {
    const user = requireSmtpAdmin(event);
    return createSmtpAccount(database, user.id, input, encryptSmtpSecret);
  });

  ipcMain.handle('smtp-accounts:update', (event, { id, input }) => {
    const user = requireSmtpAdmin(event);
    return updateSmtpAccount(database, user.id, id, input, encryptSmtpSecret);
  });

  ipcMain.handle('smtp-accounts:delete', (event, id) => {
    const user = requireSmtpAdmin(event);
    return deleteSmtpAccount(database, user.id, id);
  });

  ipcMain.handle('smtp-accounts:set-default', (event, id) => {
    const user = requireSmtpAdmin(event);
    return setDefaultSmtpAccount(database, user.id, id);
  });

  ipcMain.handle('smtp-accounts:test', (event, id) => {
    const user = requireSmtpAdmin(event);
    return testSmtpAccount(database, user.id, id, {
      decryptSecret: decryptSmtpSecret,
    });
  });

  ipcMain.handle('email-templates:list', (event) => {
    getAuthenticatedUser(event);
    return listEmailTemplates(database);
  });

  ipcMain.handle('email-templates:create', (event, input) => {
    const user = requireContactEditor(event);
    return createEmailTemplate(database, user.id, input);
  });

  ipcMain.handle('email-templates:update', (event, { id, input }) => {
    const user = requireContactEditor(event);
    return updateEmailTemplate(database, user.id, id, input);
  });

  ipcMain.handle('email-templates:duplicate', (event, id) => {
    const user = requireContactEditor(event);
    return duplicateEmailTemplate(database, user.id, id);
  });

  ipcMain.handle('email-templates:delete', (event, id) => {
    const user = requireContactEditor(event);
    return deleteEmailTemplate(database, user.id, id);
  });

  ipcMain.handle('campaigns:list', (event, search) => {
    getAuthenticatedUser(event);
    return listCampaigns(database, search);
  });

  ipcMain.handle('campaigns:get', (event, id) => {
    getAuthenticatedUser(event);
    return getCampaign(database, id);
  });

  ipcMain.handle('campaigns:create', (event, input) => {
    const user = requireContactEditor(event);
    return createCampaignDraft(database, user.id, input);
  });

  ipcMain.handle('campaigns:update', (event, { id, input }) => {
    const user = requireContactEditor(event);
    return updateCampaignDraft(database, user.id, id, input);
  });

  ipcMain.handle('campaigns:duplicate', (event, id) => {
    const user = requireContactEditor(event);
    return duplicateCampaignDraft(database, user.id, id);
  });

  ipcMain.handle('campaigns:delete', (event, id) => {
    const user = requireContactEditor(event);
    return deleteCampaignDraft(database, user.id, id);
  });
};

const createWindow = () => {
  const rendererPath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const rendererFileUrl = pathToFileURL(rendererPath).href;
  const developmentUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 620,
    title: 'Bulk Mail Sender',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const isAllowed = developmentUrl
      ? new URL(url).origin === new URL(developmentUrl).origin
      : url === rendererFileUrl;

    if (!isAllowed) {
      event.preventDefault();
    }
  });

  if (developmentUrl) {
    window.loadURL(developmentUrl);
    window.webContents.openDevTools();
  } else {
    window.loadFile(rendererPath);
  }

  window.on('closed', () => {
    authenticatedUsers.delete(window.webContents.id);
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
};

app
  .whenReady()
  .then(() => {
    database = openUserDatabase(app.getPath('userData'));
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error('Failed to initialize Bulk Mail Sender.', error);
    dialog.showErrorBox(
      'Bulk Mail Sender could not start',
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  authenticatedUsers.clear();
  if (database?.open) {
    database.close();
  }
});
