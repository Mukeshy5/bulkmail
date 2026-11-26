import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
export function databasePath(config) {
  return path.resolve(
    backendDirectory,
    config.BULK_MAIL_DB_PATH || 'data/bulk-mail-sender.sqlite',
  );
}
