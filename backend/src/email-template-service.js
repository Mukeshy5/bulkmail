import { randomUUID } from 'node:crypto';
import {
  normalizeSettings,
  renderDesign,
  templateCategories,
  validDesign,
} from './email-design.js';
import { recordActivity } from './operations.js';

const MAX_HTML_BYTES = 500 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
const invalidHeader = (value) => /\p{Cc}/u.test(value);
const problem = (error) => ({ ok: false, error });
const templateRecord = (db, id) =>
  typeof id === 'string'
    ? db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id)
    : undefined;

function templateFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject: row.subject,
    htmlBody: row.html_body,
    textBody: row.text_body,
    category: row.category,
    design: row.design ? JSON.parse(row.design) : null,
    designSettings: row.design_settings
      ? JSON.parse(row.design_settings)
      : null,
    favorite: Boolean(row.favorite),
    isSystem: Boolean(row.is_system),
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function prepareTemplateInput(input) {
  if (input?.design != null && input.designSettings != null) {
    const rendered = await renderDesign(input.design, input.designSettings);
    if (!rendered.ok) return rendered;
    return {
      ok: true,
      input: {
        ...input,
        htmlBody: rendered.html,
        designSettings: rendered.settings,
      },
    };
  }
  return { ok: true, input };
}

function validateTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return problem('Enter the email template details.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input.description === 'string' ? input.description.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const htmlBody = typeof input.htmlBody === 'string' ? input.htmlBody : '';
  const textBody = typeof input.textBody === 'string' ? input.textBody : '';
  const category = templateCategories.includes(input.category)
    ? input.category
    : 'General';
  const status = input.status === 'draft' ? 'draft' : 'ready';
  if (input.design != null && !validDesign(input.design))
    return problem(
      'Use up to 100 supported blocks and 500 KB of design content.',
    );
  if (!name || name.length > 100 || invalidHeader(name))
    return problem('Enter a template name up to 100 characters.');
  if (description.length > 500)
    return problem('Template descriptions can be up to 500 characters.');
  if (subject.length > 200 || invalidHeader(subject))
    return problem('Template subjects can be up to 200 characters.');
  if (!htmlBody.trim() && status !== 'draft')
    return problem('Add HTML content to this template.');
  if (Buffer.byteLength(htmlBody) > MAX_HTML_BYTES)
    return problem('HTML templates must be 500 KB or smaller.');
  if (Buffer.byteLength(textBody) > MAX_TEXT_BYTES)
    return problem('Plain-text templates must be 200 KB or smaller.');
  return {
    ok: true,
    template: {
      name,
      description,
      subject,
      htmlBody,
      textBody,
      category,
      status,
      design: input.design == null ? null : JSON.stringify(input.design),
      designSettings:
        input.designSettings == null
          ? null
          : JSON.stringify(normalizeSettings(input.designSettings)),
    },
  };
}

const fields =
  'name, description, subject, html_body, text_body, category, status, design, design_settings';
const values =
  '@name, @description, @subject, @htmlBody, @textBody, @category, @status, @design, @designSettings';

function saveVersion(db, row, reason) {
  const snapshot = templateFromRow(row);
  db.prepare(
    'INSERT OR IGNORE INTO email_template_versions VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.revision, JSON.stringify(snapshot), reason, row.updated_at);
}

export function listEmailTemplates(db, userId = null) {
  const rows = db
    .prepare(
      'SELECT t.*, f.template_id IS NOT NULL AS favorite FROM email_templates t LEFT JOIN email_template_favorites f ON f.template_id = t.id AND f.user_id = ? ORDER BY t.is_system DESC, t.updated_at DESC, t.name COLLATE NOCASE',
    )
    .all(userId);
  return { ok: true, templates: rows.map(templateFromRow) };
}

export function getEmailTemplate(db, id) {
  const row = templateRecord(db, id);
  return row
    ? { ok: true, template: templateFromRow(row) }
    : problem('Email template not found.');
}

export function setTemplateFavorite(db, user, input) {
  if (!templateRecord(db, input?.id) || typeof input.favorite !== 'boolean')
    return problem('Email template not found.');
  const query = input.favorite
    ? 'INSERT OR IGNORE INTO email_template_favorites (template_id, user_id) VALUES (?, ?)'
    : 'DELETE FROM email_template_favorites WHERE template_id = ? AND user_id = ?';
  db.prepare(query).run(input.id, user);
  return { ok: true, favorite: input.favorite };
}

export function createEmailTemplate(db, actor, input) {
  const validated = validateTemplate(input);
  if (!validated.ok) return validated;
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.prepare(
        'INSERT INTO email_templates (id, created_by, created_at, updated_at, ' +
          fields +
          ') VALUES (@id, @actor, @now, @now, ' +
          values +
          ')',
      ).run({ ...validated.template, id, actor, now });
      const row = templateRecord(db, id);
      saveVersion(
        db,
        row,
        input.reason === 'autosave' ? 'Autosave' : 'Created',
      );
      recordActivity(
        db,
        actor,
        'template.created',
        'email_template',
        id,
        'Template created: ' + row.name,
      );
    }).immediate();
    return getEmailTemplate(db, id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return problem('A template with this name already exists.');
    throw error;
  }
}

function unchanged(row, candidate) {
  return fields
    .split(', ')
    .every(
      (column, index) =>
        row[column] === candidate[values.split(', ')[index].slice(1)],
    );
}

export function updateEmailTemplate(db, actor, id, input) {
  try {
    return db
      .transaction(() => {
        const existing = templateRecord(db, id);
        if (!existing) return problem('Email template not found.');
        if (existing.is_system)
          return problem('Duplicate the built-in template to customize it.');
        if (
          input?.expectedRevision != null &&
          input.expectedRevision !== existing.revision
        )
          return {
            ...problem(
              'This template changed elsewhere. Reload it before saving.',
            ),
            conflict: true,
          };
        const validated = validateTemplate({
          ...templateFromRow(existing),
          ...input,
        });
        if (!validated.ok) return validated;
        const next = validated.template;
        if (unchanged(existing, next))
          return { ok: true, template: templateFromRow(existing) };
        saveVersion(db, existing, 'Original');
        const now = new Date().toISOString();
        db.prepare(
          'UPDATE email_templates SET (' +
            fields +
            ') = (' +
            values +
            '), updated_at = @now, revision = revision + 1 WHERE id = @id',
        ).run({ ...next, id, now });
        const row = templateRecord(db, id);
        const reason =
          input?.reason === 'autosave'
            ? 'Autosave'
            : input?.reason === 'restore'
              ? 'Restored'
              : input?.reason === 'rename'
                ? 'Renamed'
                : 'Saved';
        saveVersion(db, row, reason);
        if (reason !== 'Autosave')
          recordActivity(
            db,
            actor,
            'template.updated',
            'email_template',
            id,
            'Template updated: ' + row.name,
          );
        return { ok: true, template: templateFromRow(row) };
      })
      .immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return problem('A template with this name already exists.');
    throw error;
  }
}

export function templateVersions(db, id) {
  const row = templateRecord(db, id);
  if (!row) return problem('Email template not found.');
  const items = db
    .prepare(
      "SELECT revision, reason, created_at AS createdAt, json_extract(snapshot,'$.name') AS name, json_extract(snapshot,'$.status') AS status FROM email_template_versions WHERE template_id = ? ORDER BY revision DESC",
    )
    .all(id);
  return {
    ok: true,
    versions: items.length
      ? items
      : [
          {
            revision: row.revision,
            reason: 'Original',
            createdAt: row.updated_at,
            name: row.name,
            status: row.status,
          },
        ],
  };
}

export function restoreTemplateVersion(db, actor, input) {
  const { id, revision, expectedRevision } = input || {};
  if (typeof id !== 'string' || !Number.isInteger(revision))
    return problem('Choose a valid template version.');
  const item = db
    .prepare(
      'SELECT snapshot FROM email_template_versions WHERE template_id = ? AND revision = ?',
    )
    .get(id, revision);
  return item
    ? updateEmailTemplate(db, actor, id, {
        ...JSON.parse(item.snapshot),
        expectedRevision,
        reason: 'restore',
      })
    : problem('The selected version does not exist.');
}

export function duplicateEmailTemplate(db, actor, id) {
  const row = templateRecord(db, id);
  if (!row) return problem('Email template not found.');
  const item = templateFromRow(row);
  const base = (item.name + ' copy').slice(0, 100);
  let name = base;
  let suffix = 2;
  while (db.prepare('SELECT 1 FROM email_templates WHERE name = ?').get(name)) {
    const tail = ' ' + suffix++;
    name = base.slice(0, 100 - tail.length) + tail;
  }
  return createEmailTemplate(db, actor, { ...item, name });
}

export function deleteEmailTemplate(db, actor, id) {
  const row = templateRecord(db, id);
  if (!row) return problem('Email template not found.');
  if (row.is_system)
    return problem(
      'Built-in templates cannot be deleted. Duplicate one to customize it.',
    );
  db.transaction(() => {
    db.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
    recordActivity(
      db,
      actor,
      'template.deleted',
      'email_template',
      id,
      'Template deleted: ' + row.name,
    );
  }).immediate();
  return { ok: true };
}
