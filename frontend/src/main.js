import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  Notification,
} from 'electron';
import { writeFile, readFile, rm } from 'node:fs/promises';
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
  transferContacts,
  updateContactStatuses,
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
import {
  getUser,
  needsSetup,
  newSession,
  revokeSession,
  sessionUser,
} from './main/admin-service.js';
import { createDeliveryWorker } from './main/delivery-service.js';
import { registerWorkspaceIpc } from './main/workspace-ipc.js';
import { automaticBackup } from './main/backup-service.js';
import { notify, settings } from './main/operations.js';

const explicitProfile = app.commandLine.getSwitchValue('user-data-dir');
if (explicitProfile) app.setPath('userData', path.resolve(explicitProfile));
const ownsWorkspace = !started && app.requestSingleInstanceLock();
if (!ownsWorkspace) {
  app.quit();
}

let mainWindow;
let database;
let worker;
let maintenance;
let maintenanceWork;
let quitting = false;
let restored = false;
let restoring = false;
const authenticatedUsers = new Map();
const rememberedSessionFile = () =>
  path.join(app.getPath('userData'), 'session.bin');

const assertTrustedRenderer = (event) => {
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error(
      'Untrusted renderer attempted to access the application API.',
    );
  }
  if (restoring) throw new Error('The workspace is restoring a backup.');
};

const getAuthenticatedUser = (event) => {
  assertTrustedRenderer(event);
  const user = sessionUser(database, authenticatedUsers.get(event.sender.id));
  if (!user) {
    throw new Error('Sign in before using the workspace.');
  }
  return user;
};

const authorize = (event, permission) => {
  const user = getAuthenticatedUser(event);
  if (!user.permissions.includes(permission)) {
    throw new Error('Your role does not have permission for this action.');
  }
  return user;
};

const requireContactEditor = (event) => authorize(event, 'workspace.edit');
const requireSmtpAdmin = (event) => authorize(event, 'workspace.admin');

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
    return registerUser(database, input, { setupOnly: true });
  });

  ipcMain.handle('auth:needs-setup', (event) => {
    assertTrustedRenderer(event);
    return { ok: true, needsSetup: needsSetup(database) };
  });

  ipcMain.handle('auth:login', async (event, input) => {
    assertTrustedRenderer(event);
    const result = await loginUser(database, input);
    if (result.ok) {
      const remember =
        input.remember === true && safeStorage.isEncryptionAvailable();
      revokeSession(database, authenticatedUsers.get(event.sender.id));
      const token = newSession(database, result.user, remember);
      authenticatedUsers.set(event.sender.id, token);
      try {
        if (remember)
          await writeFile(
            rememberedSessionFile(),
            safeStorage.encryptString(token),
          );
        else await rm(rememberedSessionFile(), { force: true });
      } catch (error) {
        console.error('Could not update the remembered session:', error.code);
      }
      return { ...result, user: getUser(database, result.user.id) };
    }
    return result;
  });

  ipcMain.handle('auth:current-user', async (event) => {
    assertTrustedRenderer(event);
    if (
      !authenticatedUsers.has(event.sender.id) &&
      !restored &&
      safeStorage.isEncryptionAvailable()
    ) {
      try {
        const token = safeStorage.decryptString(
          await readFile(rememberedSessionFile()),
        );
        if (sessionUser(database, token))
          authenticatedUsers.set(event.sender.id, token);
      } catch (error) {
        if (error.code !== 'ENOENT')
          console.error('Could not read the remembered session:', error.code);
      }
    }
    return {
      ok: true,
      user: sessionUser(database, authenticatedUsers.get(event.sender.id)),
    };
  });

  ipcMain.handle('auth:logout', async (event) => {
    assertTrustedRenderer(event);
    revokeSession(database, authenticatedUsers.get(event.sender.id));
    authenticatedUsers.delete(event.sender.id);
    await rm(rememberedSessionFile(), { force: true });
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
  ipcMain.handle('contacts:bulk-status', (event, input) => {
    const user = requireContactEditor(event);
    return updateContactStatuses(database, user.id, input);
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
    const result = await importContacts(database, user.id, input);
    if (result.ok)
      notify(database, 'import.completed', 'Contact import completed.');
    return result;
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
  ipcMain.handle('contact-lists:transfer', (event, input) => {
    const user = requireContactEditor(event);
    return transferContacts(database, user.id, input);
  });

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
    }).then((result) => {
      if (!result.ok) notify(database, 'smtp.error', result.error);
      return result;
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
  registerWorkspaceIpc({
    db: database,
    getWindow: () => mainWindow,
    trust: assertTrustedRenderer,
    authorize,
    decrypt: decryptSmtpSecret,
    clearSessions: () => {
      authenticatedUsers.clear();
      restored = true;
    },
    restoreWithWorker: async (restore) => {
      restoring = true;
      try {
        await worker.stop();
        await maintenanceWork;
        return await restore();
      } finally {
        restoring = false;
        worker.start();
      }
    },
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
    title: 'Bulk Mail Sender Pro',
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
  } else {
    window.loadFile(rendererPath);
  }

  const senderId = window.webContents.id;
  window.on('closed', () => {
    authenticatedUsers.delete(senderId);
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
};

if (ownsWorkspace)
  app
    .whenReady()
    .then(() => {
      database = openUserDatabase(app.getPath('userData'));
      worker = createDeliveryWorker(database, { decrypt: decryptSmtpSecret });
      worker.start();
      let lastNotification = new Date().toISOString();
      maintenance = setInterval(() => {
        if (restoring || maintenanceWork) return;
        maintenanceWork = automaticBackup(database)
          .then(() => {
            if (
              !settings(database).desktopNotifications ||
              !Notification.isSupported()
            )
              return;
            const messages = database
              .prepare(
                'SELECT message, created_at FROM notifications WHERE created_at > ? ORDER BY created_at',
              )
              .all(lastNotification);
            for (const row of messages) {
              new Notification({
                title: 'Bulk Mail Sender Pro',
                body: row.message,
              }).show();
              lastNotification = row.created_at;
            }
          })
          .catch((error) =>
            console.error('Background maintenance:', error.message),
          )
          .finally(() => {
            maintenanceWork = null;
          });
      }, 15000);
      registerIpcHandlers();
      createWindow();
      app.on('second-instance', () => {
        if (mainWindow?.isMinimized()) mainWindow.restore();
        mainWindow?.focus();
      });

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

app.on('before-quit', (event) => {
  if (quitting || !database?.open) return;
  event.preventDefault();
  quitting = true;
  clearInterval(maintenance);
  authenticatedUsers.clear();
  Promise.allSettled([worker?.stop(), maintenanceWork]).finally(() => {
    if (database?.open) database.close();
    app.quit();
  });
});
