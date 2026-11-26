export default `
ALTER TABLE contacts ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN consent_evidence TEXT NOT NULL DEFAULT '';
CREATE TABLE contact_segments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  match_mode TEXT NOT NULL CHECK (match_mode IN ('and', 'or')),
  rules TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE campaign_lists (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, list_id)
);
INSERT INTO campaign_lists SELECT id, recipient_list_id FROM campaigns WHERE recipient_list_id IS NOT NULL;
ALTER TABLE campaigns ADD COLUMN segment_id TEXT REFERENCES contact_segments(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN exclusions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN preview_text TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN custom_html TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN delivery_config TEXT;
ALTER TABLE campaigns ADD COLUMN started_at TEXT;
ALTER TABLE campaigns ADD COLUMN completed_at TEXT;
ALTER TABLE email_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE email_templates ADD COLUMN design TEXT;
CREATE TABLE campaign_recipients (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL COLLATE NOCASE, token TEXT NOT NULL UNIQUE,
  UNIQUE (campaign_id, email)
);
CREATE TABLE email_queue (
  recipient_id TEXT PRIMARY KEY REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('pending','working','submitted','failed','skipped','uncertain','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT
);
CREATE INDEX email_queue_due_idx ON email_queue (state, next_at);
CREATE TABLE email_logs (
  id TEXT PRIMARY KEY, recipient_id TEXT REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX email_logs_recipient_idx ON email_logs (recipient_id, created_at);
CREATE TABLE tracking_links (
  id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  destination TEXT NOT NULL, UNIQUE(recipient_id, destination)
);
CREATE TABLE tracking_events (
  id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('open','click','delivered','bounce','complaint','unsubscribe')),
  detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX tracking_events_recipient_idx ON tracking_events (recipient_id, kind, created_at);
CREATE TABLE bounce_logs (
  id TEXT PRIMARY KEY REFERENCES tracking_events(id) ON DELETE CASCADE,
  category TEXT NOT NULL, provider TEXT NOT NULL
);
CREATE TABLE unsubscribe_list (
  email TEXT PRIMARY KEY COLLATE NOCASE, source TEXT NOT NULL, created_at TEXT NOT NULL
);
INSERT INTO unsubscribe_list SELECT email, source, created_at FROM suppression_list WHERE reason = 'unsubscribed';
CREATE TRIGGER suppression_unsubscribe_history AFTER INSERT ON suppression_list
  WHEN NEW.reason = 'unsubscribed' BEGIN
    INSERT OR IGNORE INTO unsubscribe_list VALUES (NEW.email, NEW.source, NEW.created_at);
  END;
CREATE TABLE application_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE signup_forms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
  consent TEXT NOT NULL, options TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE signup_submissions (
  id TEXT PRIMARY KEY, form_id TEXT REFERENCES signup_forms(id) ON DELETE SET NULL,
  email TEXT NOT NULL COLLATE NOCASE, token_hash TEXT UNIQUE, details TEXT NOT NULL,
  created_at TEXT NOT NULL, confirmed_at TEXT, UNIQUE(form_id, email)
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, user_id)
);
CREATE TABLE login_history (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  successful INTEGER NOT NULL, created_at TEXT NOT NULL
);
ALTER TABLE users ADD COLUMN last_login TEXT;
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE backup_history (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO roles VALUES ('super_admin','Super Admin'), ('administrator','Administrator'),
  ('marketing_manager','Campaign Manager'), ('campaign_operator','Marketing Staff'), ('viewer','Viewer');
CREATE TABLE permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission TEXT NOT NULL,
  PRIMARY KEY(role_id, permission)
);
INSERT INTO permissions SELECT id, 'workspace.read' FROM roles;
INSERT INTO permissions SELECT id, 'workspace.edit' FROM roles WHERE id != 'viewer';
INSERT INTO permissions SELECT id, 'campaign.send' FROM roles WHERE id IN ('super_admin','administrator','marketing_manager');
INSERT INTO permissions SELECT id, 'workspace.admin' FROM roles WHERE id IN ('super_admin','administrator');
`;
