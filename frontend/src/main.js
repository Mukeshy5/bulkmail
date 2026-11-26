import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { registerDesktopBridge } from './desktop-bridge.js';

const explicitProfile = app.commandLine.getSwitchValue('user-data-dir');
if (explicitProfile) app.setPath('userData', path.resolve(explicitProfile));
const ownsWorkspace = !started && app.requestSingleInstanceLock();
if (!ownsWorkspace) app.quit();

let mainWindow;
let stopBridge;

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

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
};

if (ownsWorkspace)
  app
    .whenReady()
    .then(() => {
      stopBridge = registerDesktopBridge(() => mainWindow);
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

app.on('before-quit', () => stopBridge?.());
