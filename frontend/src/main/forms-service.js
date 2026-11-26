import { randomUUID } from 'node:crypto';
import { recordActivity, settings } from './operations.js';

export function listForms(db) {
  const publicUrl = settings(db).publicUrl;
  return db
    .prepare(
      'SELECT f.*, (SELECT count(*) FROM signup_submissions s WHERE s.form_id = f.id AND s.confirmed_at IS NOT NULL) AS subscribers FROM signup_forms f ORDER BY f.updated_at DESC',
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      consent: row.consent,
      listId: row.list_id,
      published: Boolean(row.published),
      subscribers: row.subscribers,
      ...JSON.parse(row.options),
      url: publicUrl ? publicUrl + '/f/' + row.id : '',
    }));
}

export function saveForm(db, actor, input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const consent =
    typeof input?.consent === 'string' ? input.consent.trim() : '';
  if (
    !name ||
    name.length > 100 ||
    !consent ||
    consent.length > 500 ||
    typeof input.listId !== 'string' ||
    !db.prepare('SELECT 1 FROM contact_lists WHERE id = ?').get(input.listId)
  ) {
    return {
      ok: false,
      error: 'Enter a form name, consent text, and valid contact list.',
    };
  }
  if (input.published && !settings(db).publicUrl)
    return {
      ok: false,
      error:
        'Configure the public HTTPS service in Settings before publishing.',
    };
  if (
    input.id &&
    !db.prepare('SELECT 1 FROM signup_forms WHERE id = ?').get(input.id)
  )
    return { ok: false, error: 'Form not found.' };
  const duplicate = db
    .prepare('SELECT id FROM signup_forms WHERE name = ?')
    .get(name);
  if (duplicate && duplicate.id !== input.id)
    return { ok: false, error: 'That form name is already in use.' };
  const customFields = input.customFields ?? [];
  if (
    !Array.isArray(customFields) ||
    customFields.length > 12 ||
    !customFields.every((key) => /^[a-zA-Z0-9_-]{1,40}$/.test(key))
  )
    return {
      ok: false,
      error:
        'Use up to 12 custom field names with letters, numbers, underscores, or hyphens.',
    };
  const id = input.id || randomUUID();
  const options = JSON.stringify({
    company: input.company === true,
    phone: input.phone === true,
    doubleOptIn: input.doubleOptIn !== false,
    customFields: [...new Set(customFields)],
  });
  db.transaction(() => {
    db.prepare(
      'INSERT INTO signup_forms VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, list_id=excluded.list_id, consent=excluded.consent, options=excluded.options, published=excluded.published, updated_at=excluded.updated_at',
    ).run(
      id,
      name,
      input.listId,
      consent,
      options,
      input.published ? 1 : 0,
      new Date().toISOString(),
    );
    recordActivity(db, actor, 'form.saved', 'signup_form', id, name);
  }).immediate();
  return { ok: true };
}

export function deleteForm(db, actor, id) {
  return db
    .transaction(() => {
      if (!db.prepare('DELETE FROM signup_forms WHERE id = ?').run(id).changes)
        return { ok: false, error: 'Form not found.' };
      recordActivity(
        db,
        actor,
        'form.deleted',
        'signup_form',
        id,
        'Signup form deleted.',
      );
      return { ok: true };
    })
    .immediate();
}
