import Database from 'better-sqlite3';
import path from 'node:path';

const migrations = [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'administrator', 'marketing_manager', 'campaign_operator', 'viewer')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX users_created_at_idx ON users (created_at);`,
  `CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    subscription_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (subscription_status IN ('pending', 'subscribed', 'unsubscribed', 'bounced', 'blocked')),
    consent_source TEXT,
    consent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      subscription_status != 'subscribed' OR
      (consent_source IS NOT NULL AND trim(consent_source) != '' AND consent_at IS NOT NULL)
    )
  );
  CREATE INDEX contacts_name_idx ON contacts (full_name);
  CREATE INDEX contacts_status_idx ON contacts (subscription_status);

  CREATE TABLE contact_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE contact_list_members (
    list_id TEXT NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (list_id, contact_id)
  );
  CREATE INDEX contact_list_members_contact_idx ON contact_list_members (contact_id);

  CREATE TABLE suppression_list (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'blocked')),
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX activity_log_created_at_idx ON activity_log (created_at DESC);

  CREATE TABLE import_jobs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    imported_count INTEGER NOT NULL,
    duplicate_count INTEGER NOT NULL,
    invalid_count INTEGER NOT NULL,
    suppressed_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TRIGGER contacts_suppress_insert
  AFTER INSERT ON contacts
  WHEN NEW.subscription_status IN ('unsubscribed', 'bounced', 'blocked')
  BEGIN
    INSERT OR IGNORE INTO suppression_list (email, reason, source, created_at)
    VALUES (NEW.email, NEW.subscription_status, 'contact', NEW.updated_at);
  END;

  CREATE TRIGGER contacts_suppress_update
  AFTER UPDATE OF email, subscription_status ON contacts
  WHEN NEW.subscription_status IN ('unsubscribed', 'bounced', 'blocked')
  BEGIN
    INSERT OR IGNORE INTO suppression_list (email, reason, source, created_at)
    VALUES (NEW.email, NEW.subscription_status, 'contact', NEW.updated_at);
  END;`,
];

export function openDatabase(databasePath) {
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  let version = database.pragma('user_version', { simple: true });
  if (version > migrations.length) {
    database.close();
    throw new Error('The local database was created by a newer app version.');
  }
  while (version < migrations.length) {
    const targetVersion = version + 1;
    const migration = database.transaction(() => {
      database.exec(migrations[version]);
      database.pragma(`user_version = ${targetVersion}`);
    });
    migration.immediate();
    version = targetVersion;
  }

  return database;
}

export function openUserDatabase(userDataPath) {
  return openDatabase(path.join(userDataPath, 'bulk-mail-sender.sqlite'));
}
