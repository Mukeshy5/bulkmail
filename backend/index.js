import dotenv from 'dotenv';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDesktopApp } from './src/desktop-app.js';
import {
  createApp as createPublicApp,
  createConfirmationSender,
} from './src/public-app.js';
import { openDatabase } from './src/database.js';
import { backendDirectory, databasePath } from './src/data-path.js';
import { loadCredentialStore } from './src/credential-store.js';
import { createDeliveryWorker } from './src/delivery-service.js';
import { automaticBackup } from './src/backup-service.js';

function servicePort(value, fallback, name) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Set a valid ' + name + ' in backend/.env.');
  return port;
}

export async function startServices(config) {
  const desktopPort = servicePort(
    config.DESKTOP_API_PORT,
    3002,
    'DESKTOP_API_PORT',
  );
  const publicPort = servicePort(config.PORT, 3001, 'PORT');
  if (desktopPort === publicPort)
    throw new Error(
      'Use different ports for the desktop API and public service.',
    );
  if (
    config.PUBLIC_URL &&
    (!config.PUBLIC_URL.startsWith('https://') ||
      new URL(config.PUBLIC_URL).origin !== config.PUBLIC_URL)
  ) {
    throw new Error(
      'PUBLIC_URL must be an HTTPS origin without a trailing slash.',
    );
  }

  const filename = databasePath(config);
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const credentials = await loadCredentialStore(
    path.dirname(filename),
    config.BULK_MAIL_CREDENTIAL_KEY,
  );
  const db = openDatabase(filename);
  const servers = [];
  let worker;
  let maintenance;
  let maintenanceWork;
  let restoreWork;
  let closing = false;
  let shutdown;

  function close() {
    if (!shutdown) {
      closing = true;
      clearInterval(maintenance);
      const listeners = servers
        .filter((server) => server.listening)
        .map((server) => new Promise((resolve) => server.close(resolve)));
      shutdown = Promise.allSettled([
        ...listeners,
        restoreWork,
        maintenanceWork,
        worker?.stop(),
      ]).then(() => {
        if (db.open) db.close();
      });
    }
    return shutdown;
  }

  function restoreWithWorker(run) {
    if (closing || restoreWork)
      return { ok: false, error: 'The backend is busy. Try again shortly.' };
    restoreWork = (async () => {
      try {
        await worker?.stop();
        await maintenanceWork;
        return await run();
      } finally {
        if (!closing) worker?.start();
      }
    })().finally(() => {
      restoreWork = null;
    });
    return restoreWork;
  }

  try {
    const desktop = createDesktopApp(db, {
      ...credentials,
      isRestoring: () => Boolean(restoreWork),
      restoreWithWorker,
    });
    const publicRoutes = createPublicApp(db, config, {
      sendConfirmation: createConfirmationSender(config),
    });
    for (const [router, port] of [
      [desktop, desktopPort],
      [publicRoutes, publicPort],
    ]) {
      const server = createServer(router);
      servers.push(server);
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
    }
    worker = createDeliveryWorker(db, { decrypt: credentials.decrypt });
    worker.start();
    maintenance = setInterval(() => {
      if (restoreWork || maintenanceWork) return;
      maintenanceWork = automaticBackup(db)
        .catch((error) =>
          console.error('Automatic backup failed:', error.code || error.name),
        )
        .finally(() => {
          maintenanceWork = null;
        });
    }, 15000);
    return { close, desktopPort, publicPort, filename };
  } catch (error) {
    await close();
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  dotenv.config({ path: path.join(backendDirectory, '.env'), quiet: true });
  try {
    const service = await startServices(process.env);
    console.log(
      'Desktop API listening on http://127.0.0.1:' + service.desktopPort,
    );
    console.log(
      'Public service listening on http://127.0.0.1:' + service.publicPort,
    );
    console.log('Backend database:', service.filename);
    process.once('SIGINT', () => void service.close());
    process.once('SIGTERM', () => void service.close());
  } catch (error) {
    console.error('Could not start the backend:', error.message);
    process.exitCode = 1;
  }
}
