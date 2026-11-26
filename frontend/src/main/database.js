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
  `CREATE TABLE smtp_accounts (
    id TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    encryption TEXT NOT NULL CHECK (encryption IN ('ssl', 'starttls', 'none')),
    username TEXT NOT NULL,
    encrypted_password BLOB NOT NULL,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL COLLATE NOCASE,
    reply_to_email TEXT NOT NULL DEFAULT '',
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    connection_status TEXT NOT NULL DEFAULT 'untested'
      CHECK (connection_status IN ('untested', 'connected', 'failed')),
    last_tested_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (is_default = 0 OR is_enabled = 1)
  );
  CREATE INDEX smtp_accounts_enabled_idx ON smtp_accounts (is_enabled);
  CREATE UNIQUE INDEX smtp_accounts_single_default_idx
    ON smtp_accounts (is_default) WHERE is_default = 1;`,
  `CREATE TABLE email_templates (
    id TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    html_body TEXT NOT NULL,
    text_body TEXT NOT NULL DEFAULT '',
    is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX email_templates_updated_at_idx ON email_templates (updated_at DESC);

  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    campaign_type TEXT NOT NULL DEFAULT 'marketing'
      CHECK (campaign_type IN ('marketing', 'newsletter', 'promotion', 'announcement', 'customer_update', 'transactional')),
    subject TEXT NOT NULL DEFAULT '',
    sender_name TEXT NOT NULL DEFAULT '',
    sender_email TEXT NOT NULL DEFAULT '',
    reply_to_email TEXT NOT NULL DEFAULT '',
    recipient_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
    template_id TEXT REFERENCES email_templates(id) ON DELETE SET NULL,
    smtp_account_id TEXT REFERENCES smtp_accounts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'scheduled', 'processing', 'sending', 'paused', 'completed', 'failed', 'cancelled')),
    scheduled_at TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX campaigns_status_updated_idx ON campaigns (status, updated_at DESC);
  CREATE INDEX campaigns_schedule_idx ON campaigns (status, scheduled_at);`,
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

  seedDefaultTemplates(database);
  return database;
}

function seedDefaultTemplates(database) {
  const now = new Date().toISOString();
  const templates = [
    [
      'template-welcome',
      'Welcome Email',
      'A permission-based welcome for new subscribers.',
      'Welcome to our community, {{first_name}}',
      '<h1>Welcome, {{first_name}}!</h1><p>We are glad you joined us. Here is what you can expect from our updates.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Welcome, {{first_name}}! We are glad you joined us. You can unsubscribe at {{unsubscribe_url}}.',
    ],
    [
      'template-business-intro',
      'Business Introduction',
      'Introduce your organization and its services.',
      'A quick introduction from {{company}}',
      '<h1>Hello {{full_name}},</h1><p>We would like to introduce our team and explain how we can support your work.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{full_name}}, we would like to introduce our team. Unsubscribe: {{unsubscribe_url}}.',
    ],
    [
      'template-newsletter',
      'Newsletter',
      'A simple layout for recurring news and updates.',
      'The latest updates from our team',
      '<h1>Monthly update</h1><p>Hello {{first_name}}, here are the latest updates from our team.</p><hr /><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{first_name}}, here are the latest updates from our team. Unsubscribe: {{unsubscribe_url}}.',
    ],
    [
      'template-promotion',
      'Promotional Offer',
      'Share a time-limited offer with opted-in recipients.',
      'An offer selected for you',
      '<h1>A special offer</h1><p>Hello {{first_name}}, take a look at the offer we prepared for you.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{first_name}}, take a look at the offer we prepared for you. Unsubscribe: {{unsubscribe_url}}.',
    ],
    [
      'template-product',
      'Product Announcement',
      'Announce a product update or new feature.',
      'Introducing our latest update',
      '<h1>Introducing our latest update</h1><p>Hello {{first_name}}, learn what is new and how it can help your team.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{first_name}}, learn what is new and how it can help your team. Unsubscribe: {{unsubscribe_url}}.',
    ],
    [
      'template-follow-up',
      'Customer Follow-up',
      'Follow up with existing customers.',
      'Checking in, {{first_name}}',
      '<h1>Checking in</h1><p>Hello {{first_name}}, we hope everything is going well. Reply if you need help.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{first_name}}, we hope everything is going well. Unsubscribe: {{unsubscribe_url}}.',
    ],
    [
      'template-event',
      'Event Invitation',
      'Invite opted-in contacts to an event.',
      'You are invited to our upcoming event',
      '<h1>You are invited</h1><p>Hello {{first_name}}, join us for an upcoming event with our team.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      'Hello {{first_name}}, join us for an upcoming event with our team. Unsubscribe: {{unsubscribe_url}}.',
    ],
  ];
  const insert = database.prepare(
    `INSERT OR IGNORE INTO email_templates (
      id, name, description, subject, html_body, text_body,
      is_system, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const seed = database.transaction(() => {
    for (const template of templates) {
      insert.run(...template, now, now);
    }
  });
  seed.immediate();
}

export function openUserDatabase(userDataPath) {
  return openDatabase(path.join(userDataPath, 'bulk-mail-sender.sqlite'));
}
