import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from './database.js';
import { notify, settings } from './operations.js';

const tables = [
  'users',
  'roles',
  'permissions',
  'unsubscribe_list',
  'suppression_list',
  'contacts',
  'contact_lists',
  'contact_list_members',
  'contact_segments',
  'email_templates',
  'email_template_favorites',
  'email_template_versions',
  'email_media',
  'smtp_accounts',
  'campaigns',
  'campaign_lists',
  'campaign_recipients',
  'email_queue',
  'email_logs',
  'tracking_links',
  'tracking_events',
  'bounce_logs',
  'signup_forms',
  'signup_submissions',
  'notifications',
  'notification_reads',
  'application_settings',
  'activity_log',
  'backup_history',
  'import_jobs',
  'login_history',
  'password_recovery',
  'webhook_receipts',
];
const queueStates = "('scheduled','processing','sending','paused')";

export const backupHistory = (db) =>
  db.prepare('SELECT * FROM backup_history ORDER BY created_at DESC').all();

export async function createBackup(db, filename) {
  if (
    path.resolve(filename).toLowerCase() === path.resolve(db.name).toLowerCase()
  )
    return {
      ok: false,
      error: 'Choose a different file from the live database.',
    };
  await db.backup(filename);
  const copy = new Database(filename, { fileMustExist: true });
  try {
    copy.prepare('DELETE FROM user_sessions').run();
  } finally {
    copy.close();
  }
  db.prepare('INSERT INTO backup_history VALUES (?, ?, ?)').run(
    randomUUID(),
    filename,
    new Date().toISOString(),
  );
  notify(db, 'backup.completed', 'Database backup completed.');
  return { ok: true };
}

export async function automaticBackup(db) {
  const config = settings(db);
  if (!config.autoBackup || !config.backupFolder) return;
  const last = db
    .prepare(
      'SELECT created_at FROM backup_history ORDER BY created_at DESC LIMIT 1',
    )
    .get();
  if (last && Date.now() - Date.parse(last.created_at) < 86400000) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await createBackup(
    db,
    path.join(config.backupFolder, 'bulk-mail-' + timestamp + '.sqlite'),
  );
}

export async function restoreBackup(db, filename) {
  const [source, active] = await Promise.all([stat(filename), stat(db.name)]);
  if (source.ino === active.ino && source.dev === active.dev)
    return { ok: false, error: 'Choose a backup file.' };
  const backup = new Database(filename, {
    readonly: true,
    fileMustExist: true,
  });
  const staging = db.name + '.' + randomUUID() + '.restore';
  let restorePath = filename;
  let attached = false;
  try {
    const version = backup.pragma('user_version', { simple: true });
    const activeVersion = db.pragma('user_version', { simple: true });
    if (
      version < 1 ||
      version > activeVersion ||
      backup.pragma('quick_check', { simple: true }) !== 'ok' ||
      !backup
        .prepare(
          "SELECT 1 FROM users WHERE role = 'super_admin' AND is_active = 1",
        )
        .get()
    ) {
      return {
        ok: false,
        error: 'Choose a healthy workspace backup with an active Super Admin.',
      };
    }
    if (version < activeVersion) {
      await backup.backup(staging);
      const upgraded = openDatabase(staging);
      upgraded.close();
      restorePath = staging;
    }
    backup.close();
    db.prepare('ATTACH DATABASE ? AS restore_source').run(restorePath);
    attached = true;
    db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      db.exec(
        'CREATE TEMP TABLE preserved_suppression AS SELECT * FROM suppression_list',
      );
      db.exec(
        'CREATE TEMP TABLE preserved_unsubscribes AS SELECT * FROM unsubscribe_list',
      );
      const instance = db
        .prepare(
          "SELECT value FROM application_settings WHERE key = 'publicInstance'",
        )
        .get();
      db.exec('DELETE FROM user_sessions');
      for (const table of [...tables].reverse())
        db.exec('DELETE FROM main.' + table);
      for (const table of tables) {
        const columns = db
          .prepare('PRAGMA main.table_info(' + table + ')')
          .all()
          .map((column) => column.name);
        db.exec(
          'INSERT INTO main.' +
            table +
            '(' +
            columns.join(',') +
            ') SELECT ' +
            columns.join(',') +
            ' FROM restore_source.' +
            table,
        );
      }
      db.exec(
        'INSERT OR IGNORE INTO suppression_list SELECT * FROM preserved_suppression',
      );
      db.exec(
        'INSERT OR IGNORE INTO unsubscribe_list SELECT * FROM preserved_unsubscribes',
      );
      db.exec(
        "UPDATE contacts SET subscription_status = (SELECT reason FROM suppression_list WHERE email = contacts.email) WHERE subscription_status = 'subscribed' AND email IN (SELECT email FROM suppression_list)",
      );
      db.exec(
        'DROP TABLE preserved_suppression; DROP TABLE preserved_unsubscribes',
      );
      if (instance)
        db.prepare(
          "INSERT OR REPLACE INTO application_settings VALUES ('publicInstance', ?)",
        ).run(instance.value);
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE campaigns SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE status IN " +
          queueStates,
      ).run(now, now);
      db.prepare(
        "UPDATE email_queue SET state = CASE WHEN state = 'working' THEN 'uncertain' ELSE 'cancelled' END, updated_at = ? WHERE state IN ('pending','working')",
      ).run(now);
      if (db.pragma('foreign_key_check').length)
        throw new Error('Backup contains invalid references.');
      notify(
        db,
        'backup.restored',
        'Database restored. Previously active campaigns are cancelled.',
      );
    }).immediate();
  } finally {
    if (attached) db.exec('DETACH DATABASE restore_source');
    if (backup.open) backup.close();
    await rm(staging, { force: true });
  }
  return { ok: true };
}
