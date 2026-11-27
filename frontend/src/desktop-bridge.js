import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  safeStorage,
  shell,
} from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const forwarded = [
  'workspace:segments',
  'workspace:saveSegment',
  'workspace:deleteSegment',
  'workspace:segmentCount',
  'workspace:review',
  'workspace:sendTest',
  'workspace:plan',
  'workspace:control',
  'workspace:metrics',
  'workspace:analytics',
  'workspace:report',
  'workspace:exportReport',
  'workspace:suppressions',
  'workspace:suppress',
  'workspace:forms',
  'workspace:saveForm',
  'workspace:deleteForm',
  'workspace:activity',
  'workspace:notifications',
  'workspace:readNotification',
  'workspace:users',
  'workspace:saveUser',
  'workspace:savePermissions',
  'workspace:deleteUser',
  'workspace:newRecoveryCode',
  'workspace:resetPassword',
  'workspace:changePassword',
  'workspace:preferences',
  'workspace:theme',
  'workspace:settings',
  'workspace:saveSettings',
  'workspace:checkPublic',
  'workspace:chooseBackupFolder',
  'workspace:backup',
  'workspace:restore',
  'workspace:exportTemplate',
  'workspace:openForm',
  'contacts:dashboard',
  'contacts:list',
  'contacts:get',
  'contacts:create',
  'contacts:update',
  'contacts:delete',
  'contacts:bulk-delete',
  'contacts:bulk-status',
  'contacts:bulk-tag',
  'contacts:export',
  'contacts:preview-import',
  'contacts:import',
  'contact-lists:list',
  'contact-lists:create',
  'contact-lists:update',
  'contact-lists:delete',
  'contact-lists:get-members',
  'contact-lists:transfer',
  'contact-lists:replace-members',
  'smtp-accounts:list',
  'smtp-accounts:create',
  'smtp-accounts:update',
  'smtp-accounts:delete',
  'smtp-accounts:set-default',
  'smtp-accounts:test',
  'email-templates:list',
  'email-templates:create',
  'email-templates:update',
  'email-templates:duplicate',
  'email-templates:delete',
  'campaigns:list',
  'campaigns:get',
  'campaigns:create',
  'campaigns:update',
  'campaigns:duplicate',
  'campaigns:delete',
];
const exportChannels = new Set([
  'contacts:export',
  'workspace:exportReport',
  'workspace:exportTemplate',
]);
const imports = new Set(['contacts:import', 'contacts:preview-import']);
const maxImportBytes = 10 * 1024 * 1024;
const failed = (error) => ({ ok: false, error });
const cancelled = { ok: false, cancelled: true };
const sqliteFilter = [
  { name: 'SQLite database', extensions: ['sqlite', 'sqlite3', 'db'] },
];

function desktopOrigin() {
  const configured =
    app.commandLine.getSwitchValue('bulk-mail-api-url') ||
    process.env.BULK_MAIL_API_URL ||
    __BULK_MAIL_API_URL__ ||
    'http://127.0.0.1:3002';
  try {
    const url = new URL(configured);
    if (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    ) {
      return 'http://127.0.0.1:' + (url.port || 80);
    }
  } catch {
    /* The error below also covers malformed URLs. */
  }
  throw new Error(
    'Use a local HTTP origin for BULK_MAIL_API_URL, such as http://127.0.0.1:3002.',
  );
}

async function request(origin, name, input, token) {
  const [group, operation] = name.split(':');
  let response;
  try {
    response = await fetch(origin + '/api/desktop/' + group + '/' + operation, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bulk-Mail-Client': 'desktop-v1',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ input }),
      redirect: 'error',
      signal: AbortSignal.timeout(
        name === 'workspace:restore' || name === 'workspace:backup'
          ? 120000
          : 60000,
      ),
    });
  } catch {
    throw new Error(
      'Cannot connect to the backend at ' +
        origin +
        '. Start it with npm start in the backend folder.',
    );
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The configured address is not the Bulk Mail desktop API.');
  }
  const result = await response.json();
  if (typeof result?.ok !== 'boolean')
    throw new Error('The backend returned an unexpected response.');
  return result;
}

async function saveExport(window, file) {
  const choice = await dialog.showSaveDialog(window, {
    defaultPath: path.basename(file.name),
    filters: [{ name: file.format.toUpperCase(), extensions: [file.format] }],
  });
  if (choice.canceled || !choice.filePath) return false;
  if (file.format !== 'pdf') {
    const contents =
      file.format === 'xlsx' ? Buffer.from(file.base64, 'base64') : file.text;
    await writeFile(choice.filePath, contents);
    return true;
  }
  const printer = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  });
  try {
    await printer.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(file.html),
    );
    const pdf = await printer.webContents.printToPDF({
      printBackground: true,
      landscape: file.landscape === true,
    });
    await writeFile(choice.filePath, pdf);
  } finally {
    printer.destroy();
  }
  return true;
}

export function registerDesktopBridge(getWindow) {
  const remembered = path.join(app.getPath('userData'), 'backend-session.bin');
  let token;
  let origin;
  let notificationTime = new Date().toISOString();
  let polling = false;
  const endpoint = () => (origin ??= desktopOrigin());
  const call = (name, input) => request(endpoint(), name, input, token);
  const handle = (name, action) =>
    ipcMain.handle(name, (event, input) => {
      const window = getWindow();
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      ) {
        throw new Error(
          'Untrusted renderer attempted to access the desktop API.',
        );
      }
      return action(input);
    });
  async function clearSession() {
    token = undefined;
    await rm(remembered, { force: true });
  }

  handle('auth:needs-setup', () => call('auth:needs-setup'));
  handle('auth:register', (input) => call('auth:register', input));
  handle('auth:login', async (input) => {
    const remember =
      input?.remember === true && safeStorage.isEncryptionAvailable();
    const { token: nextToken, ...result } = await call('auth:login', {
      ...input,
      remember,
    });
    if (result.ok) {
      token = nextToken;
      notificationTime = new Date().toISOString();
      try {
        if (remember) {
          await writeFile(
            remembered,
            safeStorage.encryptString(
              JSON.stringify({ origin: endpoint(), token }),
            ),
          );
        } else await rm(remembered, { force: true });
      } catch (error) {
        console.error(
          'Could not update the remembered session:',
          error.code || error.name,
        );
      }
    }
    return result;
  });
  handle('auth:current-user', async () => {
    if (!token && safeStorage.isEncryptionAvailable()) {
      try {
        const saved = JSON.parse(
          safeStorage.decryptString(await readFile(remembered)),
        );
        if (saved.origin === endpoint() && typeof saved.token === 'string')
          token = saved.token;
      } catch (error) {
        if (error.code !== 'ENOENT')
          console.error(
            'Could not read the remembered session:',
            error.code || error.name,
          );
      }
    }
    const result = await call('auth:current-user');
    if (result.ok && !result.user && token) await clearSession();
    return result;
  });
  handle('auth:logout', async () => {
    try {
      await call('auth:logout');
    } catch (error) {
      console.error(
        'Local sign-out completed while the backend was unreachable:',
        error.message,
      );
    }
    await clearSession();
    return { ok: true };
  });

  for (const name of forwarded) {
    handle(name, async (input) => {
      if (imports.has(name)) {
        const bytes = input?.fileData;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxImportBytes)
          return failed('Choose a CSV or XLSX file up to 10 MB.');
        input = { ...input, fileData: Buffer.from(bytes).toString('base64') };
      }
      if (name === 'workspace:chooseBackupFolder') {
        const choice = await dialog.showOpenDialog(getWindow(), {
          properties: ['openDirectory', 'createDirectory'],
        });
        if (choice.canceled || !choice.filePaths[0]) return cancelled;
        input = choice.filePaths[0];
      } else if (name === 'workspace:backup') {
        const choice = await dialog.showSaveDialog(getWindow(), {
          defaultPath: 'bulk-mail-backup.sqlite',
          filters: sqliteFilter,
        });
        if (choice.canceled || !choice.filePath) return cancelled;
        input = choice.filePath;
      } else if (name === 'workspace:restore') {
        const choice = await dialog.showOpenDialog(getWindow(), {
          properties: ['openFile'],
          filters: sqliteFilter,
        });
        if (choice.canceled || !choice.filePaths[0]) return cancelled;
        const confirmation = await dialog.showMessageBox(getWindow(), {
          type: 'warning',
          buttons: ['Cancel', 'Restore database'],
          defaultId: 0,
          cancelId: 0,
          message: 'Restore this backup and replace the workspace?',
          detail:
            'Current suppression records are retained. Restored active campaigns are cancelled and everyone is signed out.',
        });
        if (confirmation.response !== 1) return cancelled;
        input = choice.filePaths[0];
      }
      const result = await call(name, input);
      if (!result.ok) return result;
      if (exportChannels.has(name)) {
        const { file, ...summary } = result;
        return (await saveExport(getWindow(), file)) ? summary : cancelled;
      }
      if (name === 'workspace:openForm') {
        const url = new URL(result.url);
        if (url.protocol !== 'https:' || url.username || url.password)
          return failed('The public form URL is invalid.');
        await shell.openExternal(url.href);
        return { ok: true };
      }
      return result;
    });
  }
  const timer = setInterval(async () => {
    if (!token || polling || !Notification.isSupported()) return;
    polling = true;
    try {
      const result = await call(
        'workspace:desktopNotifications',
        notificationTime,
      );
      if (result.ok && !result.enabled)
        notificationTime = new Date().toISOString();
      for (const row of result.rows || []) {
        new Notification({
          title: 'Bulk Mail Sender Pro',
          body: row.message,
        }).show();
        notificationTime = row.created_at;
      }
    } catch {
      /* The workspace polls again when the backend reconnects. */
    } finally {
      polling = false;
    }
  }, 15000);
  return () => clearInterval(timer);
}
