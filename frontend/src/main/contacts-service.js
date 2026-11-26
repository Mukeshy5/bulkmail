import { randomUUID } from 'node:crypto';

const subscriptionStatuses = new Set([
  'pending',
  'subscribed',
  'unsubscribed',
  'bounced',
  'blocked',
]);

const sortableColumns = {
  name: 'full_name',
  email: 'email',
  company: 'company',
  status: 'subscription_status',
  added: 'created_at',
};

function contactFromRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    country: row.country,
    city: row.city,
    category: row.category,
    tags: JSON.parse(row.tags),
    subscriptionStatus: row.subscription_status,
    consentSource: row.consent_source,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordActivity(
  database,
  actorUserId,
  action,
  entityType,
  entityId,
  description,
) {
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
      entityType,
      entityId,
      description,
      new Date().toISOString(),
    );
}

function normalizeTags(input) {
  const source = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const tags = [
    ...new Set(
      source
        .filter((tag) => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];

  if (tags.length > 30 || tags.some((tag) => tag.length > 50)) {
    return { error: 'Use up to 30 tags, each no longer than 50 characters.' };
  }
  return { tags };
}

export function validateContact(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Enter the contact details.' };
  }

  const firstName =
    typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const lastName =
    typeof input.lastName === 'string' ? input.lastName.trim() : '';
  const fullName =
    typeof input.fullName === 'string' && input.fullName.trim()
      ? input.fullName.trim()
      : [firstName, lastName].filter(Boolean).join(' ');
  const email =
    typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const subscriptionStatus = input.subscriptionStatus || 'pending';
  const tagsResult = normalizeTags(input.tags);

  if (!fullName || fullName.length > 150) {
    return { ok: false, error: 'Enter a contact name (up to 150 characters).' };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (!subscriptionStatuses.has(subscriptionStatus)) {
    return { ok: false, error: 'Choose a valid subscription status.' };
  }
  if (tagsResult.error) {
    return { ok: false, error: tagsResult.error };
  }

  const consentSource =
    typeof input.consentSource === 'string'
      ? input.consentSource.trim().slice(0, 255)
      : '';
  let consentAt = null;
  if (input.consentAt) {
    const parsedDate = new Date(input.consentAt);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getTime() > Date.now()
    ) {
      return {
        ok: false,
        error: 'Enter a valid consent date that is not in the future.',
      };
    }
    consentAt = parsedDate.toISOString();
  }
  if (subscriptionStatus === 'subscribed' && (!consentSource || !consentAt)) {
    return {
      ok: false,
      error: 'Active subscribers need a recorded consent source and date.',
    };
  }

  const textFields = [
    ['company', 150],
    ['phone', 50],
    ['country', 100],
    ['city', 100],
    ['category', 100],
  ];
  const contact = {
    fullName,
    firstName: firstName.slice(0, 75) || fullName.split(/\s+/)[0],
    lastName: lastName.slice(0, 75) || fullName.split(/\s+/).slice(1).join(' '),
    email,
    tags: tagsResult.tags,
    subscriptionStatus,
    consentSource: consentSource || null,
    consentAt,
  };

  for (const [field, maxLength] of textFields) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (value.length > maxLength) {
      return {
        ok: false,
        error: `${field} must be ${maxLength} characters or fewer.`,
      };
    }
    contact[field] = value;
  }

  return { ok: true, contact };
}

function isSuppressed(database, email) {
  return Boolean(
    database
      .prepare('SELECT email FROM suppression_list WHERE email = ?')
      .get(email),
  );
}

export function getContact(database, id) {
  const row = database.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  return row
    ? { ok: true, contact: contactFromRow(row) }
    : { ok: false, error: 'Contact not found.' };
}

export function createContact(database, actorUserId, input) {
  const validated = validateContact(input);
  if (!validated.ok) return validated;
  const { contact } = validated;

  if (
    contact.subscriptionStatus === 'subscribed' &&
    isSuppressed(database, contact.email)
  ) {
    return {
      ok: false,
      error:
        'This address is on the global suppression list and cannot be subscribed.',
    };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    const create = database.transaction(() => {
      database
        .prepare(
          `INSERT INTO contacts (
            id, full_name, first_name, last_name, email, company, phone, country,
            city, category, tags, subscription_status, consent_source, consent_at,
            created_at, updated_at
          ) VALUES (
            @id, @fullName, @firstName, @lastName, @email, @company, @phone,
            @country, @city, @category, @tags, @subscriptionStatus, @consentSource,
            @consentAt, @createdAt, @updatedAt
          )`,
        )
        .run({
          id,
          ...contact,
          tags: JSON.stringify(contact.tags),
          createdAt: now,
          updatedAt: now,
        });
      recordActivity(
        database,
        actorUserId,
        'contact.created',
        'contact',
        id,
        'Contact created',
      );
    });
    create.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A contact with that email already exists.' };
    }
    throw error;
  }

  return getContact(database, id);
}

export function updateContact(database, actorUserId, id, input) {
  const current = database
    .prepare('SELECT id FROM contacts WHERE id = ?')
    .get(id);
  if (!current) return { ok: false, error: 'Contact not found.' };

  const validated = validateContact(input);
  if (!validated.ok) return validated;
  const { contact } = validated;
  if (
    contact.subscriptionStatus === 'subscribed' &&
    isSuppressed(database, contact.email)
  ) {
    return {
      ok: false,
      error:
        'This address is on the global suppression list and cannot be subscribed.',
    };
  }

  try {
    const update = database.transaction(() => {
      database
        .prepare(
          `UPDATE contacts SET
            full_name = @fullName,
            first_name = @firstName,
            last_name = @lastName,
            email = @email,
            company = @company,
            phone = @phone,
            country = @country,
            city = @city,
            category = @category,
            tags = @tags,
            subscription_status = @subscriptionStatus,
            consent_source = @consentSource,
            consent_at = @consentAt,
            updated_at = @updatedAt
          WHERE id = @id`,
        )
        .run({
          id,
          ...contact,
          tags: JSON.stringify(contact.tags),
          updatedAt: new Date().toISOString(),
        });
      recordActivity(
        database,
        actorUserId,
        'contact.updated',
        'contact',
        id,
        'Contact updated',
      );
    });
    update.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A contact with that email already exists.' };
    }
    throw error;
  }

  return getContact(database, id);
}

function contactFilters(filters = {}) {
  const clauses = [];
  const values = [];
  const search =
    typeof filters.search === 'string' ? filters.search.trim() : '';
  const status = filters.status === 'all' ? '' : filters.status || '';

  if (search) {
    const pattern = `%${search.slice(0, 100)}%`;
    clauses.push(
      '(full_name LIKE ? OR email LIKE ? OR company LIKE ? OR city LIKE ?)',
    );
    values.push(pattern, pattern, pattern, pattern);
  }
  if (status) {
    if (!subscriptionStatuses.has(status)) {
      return { error: 'Choose a valid subscription status filter.' };
    }
    clauses.push('subscription_status = ?');
    values.push(status);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

export function listContacts(database, filters = {}) {
  const filtered = contactFilters(filters);
  if (filtered.error) return { ok: false, error: filtered.error };

  const page = Number.isInteger(filters.page) ? Math.max(filters.page, 1) : 1;
  const pageSize = Number.isInteger(filters.pageSize)
    ? Math.min(Math.max(filters.pageSize, 1), 100)
    : 50;
  const sortBy = sortableColumns[filters.sortBy] ? filters.sortBy : 'added';
  const direction = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const total = database
    .prepare(`SELECT COUNT(*) AS count FROM contacts ${filtered.where}`)
    .get(...filtered.values).count;
  const rows = database
    .prepare(
      `SELECT * FROM contacts ${filtered.where}
       ORDER BY ${sortableColumns[sortBy]} ${direction}
       LIMIT ? OFFSET ?`,
    )
    .all(...filtered.values, pageSize, (page - 1) * pageSize);

  return {
    ok: true,
    contacts: rows.map(contactFromRow),
    total,
    page,
    pageSize,
  };
}

export function deleteContact(database, actorUserId, id) {
  const remove = database.transaction(() => {
    const result = database
      .prepare('DELETE FROM contacts WHERE id = ?')
      .run(id);
    if (!result.changes) return false;
    recordActivity(
      database,
      actorUserId,
      'contact.deleted',
      'contact',
      id,
      'Contact deleted',
    );
    return true;
  });

  return remove.immediate()
    ? { ok: true }
    : { ok: false, error: 'Contact not found.' };
}

export function bulkDeleteContacts(database, actorUserId, ids) {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== 'string')
  ) {
    return { ok: false, error: 'Select between 1 and 500 contacts.' };
  }
  const uniqueIds = [...new Set(ids)];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const remove = database.transaction(() => {
    const result = database
      .prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`)
      .run(...uniqueIds);
    if (result.changes) {
      recordActivity(
        database,
        actorUserId,
        'contacts.bulk_deleted',
        'contacts',
        null,
        `${result.changes} contacts deleted`,
      );
    }
    return result.changes;
  });

  return { ok: true, deleted: remove.immediate() };
}

export function bulkAssignTags(database, actorUserId, ids, inputTags) {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== 'string')
  ) {
    return { ok: false, error: 'Select between 1 and 500 contacts.' };
  }
  const normalized = normalizeTags(inputTags);
  if (normalized.error || normalized.tags.length === 0) {
    return { ok: false, error: normalized.error || 'Enter at least one tag.' };
  }

  const update = database.transaction(() => {
    const updateContactTags = database.prepare(
      'UPDATE contacts SET tags = ?, updated_at = ? WHERE id = ?',
    );
    let updated = 0;
    for (const id of new Set(ids)) {
      const row = database
        .prepare('SELECT tags FROM contacts WHERE id = ?')
        .get(id);
      if (!row) continue;
      const tags = [...new Set([...JSON.parse(row.tags), ...normalized.tags])];
      updated += updateContactTags.run(
        JSON.stringify(tags),
        new Date().toISOString(),
        id,
      ).changes;
    }
    if (updated) {
      recordActivity(
        database,
        actorUserId,
        'contacts.tagged',
        'contacts',
        null,
        `Tags assigned to ${updated} contacts`,
      );
    }
    return updated;
  });

  return { ok: true, updated: update.immediate() };
}

export function getDashboardSummary(database) {
  const contactCounts = database
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(subscription_status = 'subscribed') AS subscribed,
        SUM(subscription_status = 'pending') AS pending
      FROM contacts`,
    )
    .get();
  const listCount = database
    .prepare('SELECT COUNT(*) AS count FROM contact_lists')
    .get().count;
  const suppressionCount = database
    .prepare('SELECT COUNT(*) AS count FROM suppression_list')
    .get().count;
  const statusDistribution = database
    .prepare(
      `SELECT subscription_status AS status, COUNT(*) AS count
       FROM contacts GROUP BY subscription_status`,
    )
    .all();
  const recentActivity = database
    .prepare(
      `SELECT action, entity_type AS entityType, description, created_at AS createdAt
       FROM activity_log ORDER BY created_at DESC LIMIT 8`,
    )
    .all();

  return {
    ok: true,
    contacts: {
      total: contactCounts.total,
      subscribed: contactCounts.subscribed || 0,
      pending: contactCounts.pending || 0,
    },
    contactLists: listCount,
    suppressedAddresses: suppressionCount,
    statusDistribution,
    recentActivity,
  };
}

export function listContactLists(database, search = '') {
  const normalizedSearch = typeof search === 'string' ? search.trim() : '';
  const rows = database
    .prepare(
      `SELECT
        lists.id, lists.name, lists.description,
        lists.created_at AS createdAt, lists.updated_at AS updatedAt,
        COUNT(members.contact_id) AS contactCount,
        SUM(contacts.subscription_status = 'subscribed') AS subscribedCount
      FROM contact_lists AS lists
      LEFT JOIN contact_list_members AS members ON members.list_id = lists.id
      LEFT JOIN contacts ON contacts.id = members.contact_id
      WHERE (? = '' OR lists.name LIKE ? OR lists.description LIKE ?)
      GROUP BY lists.id
      ORDER BY lists.name COLLATE NOCASE`,
    )
    .all(
      normalizedSearch.slice(0, 100),
      `%${normalizedSearch.slice(0, 100)}%`,
      `%${normalizedSearch.slice(0, 100)}%`,
    );

  return {
    ok: true,
    lists: rows.map((row) => ({
      ...row,
      subscribedCount: row.subscribedCount || 0,
    })),
  };
}

export function createContactList(database, actorUserId, input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input?.description === 'string' ? input.description.trim() : '';
  if (!name || name.length > 100 || description.length > 500) {
    return {
      ok: false,
      error:
        'List name is required (up to 100 characters); description is limited to 500.',
    };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    const create = database.transaction(() => {
      database
        .prepare(
          `INSERT INTO contact_lists (id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, name, description, now, now);
      recordActivity(
        database,
        actorUserId,
        'contact_list.created',
        'contact_list',
        id,
        'Contact list created',
      );
    });
    create.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A list with that name already exists.' };
    }
    throw error;
  }

  return {
    ok: true,
    list: listContactLists(database).lists.find((list) => list.id === id),
  };
}

export function updateContactList(database, actorUserId, id, input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input?.description === 'string' ? input.description.trim() : '';
  if (!name || name.length > 100 || description.length > 500) {
    return { ok: false, error: 'List name and description are invalid.' };
  }

  try {
    const update = database.transaction(() => {
      const result = database
        .prepare(
          'UPDATE contact_lists SET name = ?, description = ?, updated_at = ? WHERE id = ?',
        )
        .run(name, description, new Date().toISOString(), id);
      if (!result.changes) return false;
      recordActivity(
        database,
        actorUserId,
        'contact_list.updated',
        'contact_list',
        id,
        'Contact list updated',
      );
      return true;
    });
    if (!update.immediate())
      return { ok: false, error: 'Contact list not found.' };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'A list with that name already exists.' };
    }
    throw error;
  }

  return {
    ok: true,
    list: listContactLists(database).lists.find((list) => list.id === id),
  };
}

export function deleteContactList(database, actorUserId, id) {
  const remove = database.transaction(() => {
    const result = database
      .prepare('DELETE FROM contact_lists WHERE id = ?')
      .run(id);
    if (!result.changes) return false;
    recordActivity(
      database,
      actorUserId,
      'contact_list.deleted',
      'contact_list',
      id,
      'Contact list deleted',
    );
    return true;
  });

  return remove.immediate()
    ? { ok: true }
    : { ok: false, error: 'Contact list not found.' };
}

export function getContactListMembers(database, id) {
  const list = database
    .prepare('SELECT id, name FROM contact_lists WHERE id = ?')
    .get(id);
  if (!list) return { ok: false, error: 'Contact list not found.' };

  const members = database
    .prepare(
      `SELECT contacts.*
       FROM contacts
       INNER JOIN contact_list_members AS members ON members.contact_id = contacts.id
       WHERE members.list_id = ?
       ORDER BY contacts.full_name COLLATE NOCASE`,
    )
    .all(id);
  return { ok: true, list, contacts: members.map(contactFromRow) };
}

export function replaceContactListMembers(
  database,
  actorUserId,
  listId,
  contactIds,
) {
  if (
    !Array.isArray(contactIds) ||
    contactIds.length > 5000 ||
    contactIds.some((id) => typeof id !== 'string')
  ) {
    return { ok: false, error: 'Select up to 5,000 valid contacts.' };
  }
  const uniqueIds = [...new Set(contactIds)];
  if (
    !database.prepare('SELECT id FROM contact_lists WHERE id = ?').get(listId)
  ) {
    return { ok: false, error: 'Contact list not found.' };
  }
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const found = database
      .prepare(`SELECT id FROM contacts WHERE id IN (${placeholders})`)
      .all(...uniqueIds);
    if (found.length !== uniqueIds.length) {
      return {
        ok: false,
        error: 'One or more selected contacts no longer exist.',
      };
    }
  }

  const replace = database.transaction(() => {
    database
      .prepare('DELETE FROM contact_list_members WHERE list_id = ?')
      .run(listId);
    const addMember = database.prepare(
      'INSERT INTO contact_list_members (list_id, contact_id, added_at) VALUES (?, ?, ?)',
    );
    const now = new Date().toISOString();
    for (const contactId of uniqueIds) {
      addMember.run(listId, contactId, now);
    }
    recordActivity(
      database,
      actorUserId,
      'contact_list.members_replaced',
      'contact_list',
      listId,
      `Contact list membership updated (${uniqueIds.length} contacts)`,
    );
  });
  replace.immediate();

  return { ok: true, memberCount: uniqueIds.length };
}

export function exportContactsCsv(database, filters = {}) {
  const filtered = contactFilters(filters);
  if (filtered.error) return { ok: false, error: filtered.error };
  const rows = database
    .prepare(
      `SELECT full_name, first_name, last_name, email, company, phone, country,
        city, category, tags, subscription_status, consent_source, consent_at,
        created_at, updated_at
       FROM contacts ${filtered.where}
       ORDER BY created_at DESC`,
    )
    .all(...filtered.values);
  const columns = [
    ['Full Name', 'full_name'],
    ['First Name', 'first_name'],
    ['Last Name', 'last_name'],
    ['Email', 'email'],
    ['Company', 'company'],
    ['Phone', 'phone'],
    ['Country', 'country'],
    ['City', 'city'],
    ['Category', 'category'],
    ['Tags', 'tags'],
    ['Subscription Status', 'subscription_status'],
    ['Consent Source', 'consent_source'],
    ['Consent Date', 'consent_at'],
    ['Date Added', 'created_at'],
    ['Last Updated', 'updated_at'],
  ];
  const escapeCsv = (value) => {
    const text = String(value ?? '');
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const csv = [
    columns.map(([label]) => escapeCsv(label)).join(','),
    ...rows.map((row) =>
      columns
        .map(([, field]) =>
          escapeCsv(
            field === 'tags' ? JSON.parse(row[field]).join(', ') : row[field],
          ),
        )
        .join(','),
    ),
  ].join('\r\n');

  return { ok: true, csv, count: rows.length };
}
