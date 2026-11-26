import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { link, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { backendDirectory, databasePath } from './src/data-path.js';
import { openDatabase } from './src/database.js';

dotenv.config({ path: path.join(backendDirectory, '.env'), quiet: true });
const source = process.argv[2];
const destination = databasePath(process.env);

async function migrate() {
  if (!source)
    throw new Error('Pass the full path to the old desktop SQLite file.');
  const origin = path.resolve(source);
  if (!(await stat(origin)).isFile())
    throw new Error('Choose the desktop SQLite file.');
  const exists = await stat(destination).then(
    () => true,
    (error) => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    },
  );
  if (exists)
    throw new Error(
      'The backend database already exists. It was left unchanged.',
    );
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const staging = destination + '.' + randomUUID() + '.migration';
  const previous = new Database(origin, {
    readonly: true,
    fileMustExist: true,
  });
  let current;
  try {
    if (
      !previous
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'",
        )
        .get() ||
      !previous
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'campaigns'",
        )
        .get()
    ) {
      throw new Error('The source is not a Bulk Mail Sender database.');
    }
    if (previous.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('The old desktop database failed its integrity check.');
    await previous.backup(staging);
    current = openDatabase(staging);
    const result = current
      .transaction(() => {
        const legacySmtp = current
          .prepare(
            "SELECT count(*) FROM smtp_accounts WHERE hex(substr(encrypted_password, 1, 4)) != '424D5332'",
          )
          .pluck()
          .get();
        const date = new Date().toISOString();
        current
          .prepare(
            "UPDATE smtp_accounts SET is_default = 0, is_enabled = 0, connection_status = 'untested', last_tested_at = NULL WHERE hex(substr(encrypted_password, 1, 4)) != '424D5332'",
          )
          .run();
        current
          .prepare(
            "UPDATE campaigns SET status = 'paused', updated_at = ? WHERE status IN ('processing','sending')",
          )
          .run(date);
        current
          .prepare(
            "UPDATE email_queue SET state = 'uncertain', updated_at = ? WHERE state = 'working'",
          )
          .run(date);
        current.exec('DELETE FROM user_sessions');
        return {
          users: current.prepare('SELECT count(*) FROM users').pluck().get(),
          legacySmtp,
        };
      })
      .immediate();
    current.pragma('wal_checkpoint(TRUNCATE)');
    current.close();
    await link(staging, destination);
    console.log('Backend database migrated:', destination);
    console.log('Existing user accounts transferred:', result.users);
    if (result.legacySmtp)
      console.log(
        'Re-enter and test credentials for ' +
          result.legacySmtp +
          ' legacy SMTP account(s).',
      );
  } finally {
    if (current?.open) current.close();
    previous.close();
    await rm(staging, { force: true });
  }
}

try {
  await migrate();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
}
