import { randomUUID } from 'node:crypto';

const MAX_HTML_BYTES = 500 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;

function hasHeaderControls(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

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
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordActivity(database, actorUserId, action, id, description) {
  database
    .prepare(
      `INSERT INTO activity_log (
        id, actor_user_id, action, entity_type, entity_id, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      actorUserId,
      action,
      'email_template',
      id,
      description,
      new Date().toISOString(),
    );
}

function validateTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Enter the email template details.' };
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input.description === 'string' ? input.description.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const htmlBody = typeof input.htmlBody === 'string' ? input.htmlBody : '';
  const textBody = typeof input.textBody === 'string' ? input.textBody : '';
  const category = [
    'Business',
    'Marketing',
    'Newsletter',
    'Events',
    'Customer Communication',
  ].includes(input.category)
    ? input.category
    : 'General';
  const design = input.design == null ? null : JSON.stringify(input.design);
  if (
    design &&
    (!Array.isArray(input.design) ||
      input.design.length > 100 ||
      Buffer.byteLength(design) > MAX_HTML_BYTES ||
      !input.design.every(
        (block) =>
          block &&
          typeof block.type === 'string' &&
          typeof block.id === 'string' &&
          Object.values(block).every(
            (value) => typeof value === 'string' || typeof value === 'number',
          ),
      ))
  ) {
    return {
      ok: false,
      error: 'The visual design exceeds the supported block count or size.',
    };
  }

  if (!name || name.length > 100 || hasHeaderControls(name)) {
    return { ok: false, error: 'Enter a template name up to 100 characters.' };
  }
  if (description.length > 500) {
    return {
      ok: false,
      error: 'Template descriptions can be up to 500 characters.',
    };
  }
  if (subject.length > 200 || hasHeaderControls(subject)) {
    return {
      ok: false,
      error: 'Template subjects can be up to 200 characters.',
    };
  }
  if (!htmlBody.trim()) {
    return { ok: false, error: 'Add HTML content to this template.' };
  }
  if (Buffer.byteLength(htmlBody, 'utf8') > MAX_HTML_BYTES) {
    return { ok: false, error: 'HTML templates must be 500 KB or smaller.' };
  }
  if (Buffer.byteLength(textBody, 'utf8') > MAX_TEXT_BYTES) {
    return {
      ok: false,
      error: 'Plain-text templates must be 200 KB or smaller.',
    };
  }

  return {
    ok: true,
    template: {
      name,
      description,
      subject,
      htmlBody,
      textBody,
      category,
      design,
    },
  };
}

export function listEmailTemplates(database) {
  const rows = database
    .prepare(
      `SELECT * FROM email_templates
       ORDER BY is_system DESC, updated_at DESC, name COLLATE NOCASE`,
    )
    .all();
  return { ok: true, templates: rows.map(templateFromRow) };
}

export function createEmailTemplate(database, actorUserId, input) {
  const validated = validateTemplate(input);
  if (!validated.ok) return validated;
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    const create = database.transaction(() => {
      database
        .prepare(
          `INSERT INTO email_templates (
            id, created_by, name, description, subject, html_body,
            text_body, category, design, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          actorUserId,
          validated.template.name,
          validated.template.description,
          validated.template.subject,
          validated.template.htmlBody,
          validated.template.textBody,
          validated.template.category,
          validated.template.design,
          now,
          now,
        );
      recordActivity(
        database,
        actorUserId,
        'template.created',
        id,
        `Email template "${validated.template.name}" created`,
      );
    });
    create.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A template with this name already exists.' };
    }
    throw error;
  }
  return {
    ok: true,
    template: templateFromRow(
      database.prepare('SELECT * FROM email_templates WHERE id = ?').get(id),
    ),
  };
}

export function updateEmailTemplate(database, actorUserId, id, input) {
  const existing = database
    .prepare('SELECT id, is_system, category FROM email_templates WHERE id = ?')
    .get(id);
  if (!existing) return { ok: false, error: 'Email template not found.' };
  if (existing.is_system)
    return {
      ok: false,
      error: 'Duplicate the built-in template to customize it.',
    };
  const validated = validateTemplate({ category: existing.category, ...input });
  if (!validated.ok) return validated;
  const now = new Date().toISOString();
  try {
    const update = database.transaction(() => {
      database
        .prepare(
          `UPDATE email_templates SET
            name = ?, description = ?, subject = ?, html_body = ?,
            text_body = ?, category = ?, design = ?, updated_at = ?
          WHERE id = ?`,
        )
        .run(
          validated.template.name,
          validated.template.description,
          validated.template.subject,
          validated.template.htmlBody,
          validated.template.textBody,
          validated.template.category,
          validated.template.design,
          now,
          id,
        );
      recordActivity(
        database,
        actorUserId,
        'template.updated',
        id,
        `Email template "${validated.template.name}" updated`,
      );
    });
    update.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A template with this name already exists.' };
    }
    throw error;
  }
  return {
    ok: true,
    template: templateFromRow(
      database.prepare('SELECT * FROM email_templates WHERE id = ?').get(id),
    ),
  };
}

export function duplicateEmailTemplate(database, actorUserId, id) {
  const template = database
    .prepare('SELECT * FROM email_templates WHERE id = ?')
    .get(id);
  if (!template) return { ok: false, error: 'Email template not found.' };

  const baseName = `${template.name} copy`.slice(0, 100);
  let name = baseName;
  let suffix = 2;
  while (
    database.prepare('SELECT 1 FROM email_templates WHERE name = ?').get(name)
  ) {
    const suffixText = ` ${suffix}`;
    name = `${baseName.slice(0, 100 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return createEmailTemplate(database, actorUserId, {
    name,
    description: template.description,
    subject: template.subject,
    htmlBody: template.html_body,
    textBody: template.text_body,
    category: template.category,
    design: template.design ? JSON.parse(template.design) : null,
  });
}

export function deleteEmailTemplate(database, actorUserId, id) {
  const template = database
    .prepare('SELECT id, name, is_system FROM email_templates WHERE id = ?')
    .get(id);
  if (!template) return { ok: false, error: 'Email template not found.' };
  if (template.is_system) {
    return {
      ok: false,
      error:
        'Built-in templates cannot be deleted. Duplicate one to customize it.',
    };
  }

  const remove = database.transaction(() => {
    database.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
    recordActivity(
      database,
      actorUserId,
      'template.deleted',
      id,
      `Email template "${template.name}" deleted`,
    );
  });
  remove.immediate();
  return { ok: true };
}
