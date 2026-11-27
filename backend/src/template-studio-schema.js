export default `
ALTER TABLE email_templates ADD COLUMN design_settings TEXT;
ALTER TABLE email_templates ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'draft'));
ALTER TABLE email_templates ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
INSERT OR IGNORE INTO template_categories(name) VALUES
 ('Promotional'), ('Welcome Email'), ('Follow-up Email'), ('Product Launch'),
 ('Event Invitation'), ('Offers & Discounts'), ('Transactional Emails');
CREATE TABLE email_template_favorites (
  template_id TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(template_id, user_id)
);
CREATE TABLE email_template_versions (
  template_id TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(template_id, revision)
);
CREATE TABLE email_media (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX email_media_created_idx ON email_media (created_at DESC);
`;
