import { randomUUID } from 'node:crypto';

const fields = new Set([
  'country',
  'city',
  'company',
  'tags',
  'consent_at',
  'source',
  'category',
  'list',
  'opens',
  'clicks',
]);
const operators = new Set([
  'contains',
  'not_contains',
  'eq',
  'neq',
  'gt',
  'lt',
]);

export function listSegments(db) {
  return db
    .prepare('SELECT * FROM contact_segments ORDER BY name')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.match_mode,
      rules: JSON.parse(row.rules),
    }));
}

export function saveSegment(db, segment) {
  const name = typeof segment?.name === 'string' ? segment.name.trim() : '';
  const { id, mode, rules } = segment || {};
  if (
    !name ||
    name.length > 100 ||
    !['and', 'or'].includes(mode) ||
    !Array.isArray(rules) ||
    !rules.length ||
    rules.length > 20 ||
    !rules.every(
      (rule) =>
        rule &&
        typeof rule.field === 'string' &&
        (fields.has(rule.field) ||
          /^custom\.[a-zA-Z0-9_-]{1,40}$/.test(rule.field)) &&
        operators.has(rule.operator) &&
        typeof rule.value === 'string' &&
        rule.value.trim() &&
        rule.value.length <= 200,
    )
  ) {
    return {
      ok: false,
      error: 'Enter a segment name and at least one complete rule.',
    };
  }
  if (
    id &&
    !db.prepare('SELECT id FROM contact_segments WHERE id = ?').get(id)
  ) {
    return { ok: false, error: 'Segment not found.' };
  }
  const duplicate = db
    .prepare('SELECT id FROM contact_segments WHERE name = ?')
    .get(name);
  if (duplicate && duplicate.id !== id)
    return { ok: false, error: 'That segment name is already in use.' };
  db.prepare(
    'INSERT INTO contact_segments VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, match_mode=excluded.match_mode, rules=excluded.rules, updated_at=excluded.updated_at',
  ).run(
    id || randomUUID(),
    name,
    mode,
    JSON.stringify(rules),
    new Date().toISOString(),
  );
  return { ok: true };
}

export function deleteSegment(db, id) {
  return {
    ok: Boolean(
      db.prepare('DELETE FROM contact_segments WHERE id = ?').run(id).changes,
    ),
    error: 'Segment not found.',
  };
}

function matchesRule(rule, contact, lists, engagement) {
  const field = rule.field;
  const value = rule.value.trim().toLowerCase();
  let actual = contact[field];
  if (field === 'tags') actual = JSON.parse(contact.tags);
  if (field === 'list') actual = lists.get(contact.id) || [];
  if (field === 'opens' || field === 'clicks')
    actual = engagement.get(contact.id)?.[field] ?? 0;
  if (field.startsWith('custom.'))
    actual = JSON.parse(contact.custom_fields)[field.slice(7)];
  const values = (Array.isArray(actual) ? actual : [actual ?? '']).map((item) =>
    String(item).toLowerCase(),
  );
  switch (rule.operator) {
    case 'contains':
      return values.some((item) => item.includes(value));
    case 'not_contains':
      return values.every((item) => !item.includes(value));
    case 'eq':
      return values.includes(value);
    case 'neq':
      return !values.includes(value);
    case 'gt':
    case 'lt':
      return values.some((item) => {
        if (!item) return false;
        const numeric =
          Number.isFinite(Number(item)) && Number.isFinite(Number(value));
        const left = numeric
          ? Number(item)
          : field === 'consent_at'
            ? item.slice(0, 10)
            : item;
        const right = numeric
          ? Number(value)
          : field === 'consent_at'
            ? value.slice(0, 10)
            : value;
        return rule.operator === 'gt' ? left > right : left < right;
      });
    default:
      return false;
  }
}

export function resolveAudience(
  db,
  { listIds = [], segmentId, exclusions = [] },
) {
  if (!listIds.length && !segmentId) return [];
  const selected = new Set(listIds);
  const excluded = new Set(exclusions.map((email) => email.toLowerCase()));
  const segment =
    segmentId && listSegments(db).find((row) => row.id === segmentId);
  const membership = new Map();
  const lists = new Map();
  for (const row of db
    .prepare(
      'SELECT m.contact_id, m.list_id, l.name FROM contact_list_members m JOIN contact_lists l ON l.id = m.list_id',
    )
    .iterate()) {
    if (selected.has(row.list_id)) membership.set(row.contact_id, true);
    if (segment?.rules.some((rule) => rule.field === 'list')) {
      if (!lists.has(row.contact_id)) lists.set(row.contact_id, []);
      lists.get(row.contact_id).push(row.name);
    }
  }
  const engagement = new Map();
  if (segment?.rules.some((rule) => ['opens', 'clicks'].includes(rule.field))) {
    for (const row of db
      .prepare(
        "SELECT r.contact_id, sum(e.kind = 'open') AS opens, sum(e.kind = 'click') AS clicks FROM tracking_events e JOIN campaign_recipients r ON r.id = e.recipient_id GROUP BY r.contact_id",
      )
      .iterate()) {
      engagement.set(row.contact_id, row);
    }
  }
  return db
    .prepare(
      "SELECT c.* FROM contacts c WHERE c.subscription_status = 'subscribed' AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email) ORDER BY c.id",
    )
    .all()
    .filter((contact) => {
      if (excluded.has(contact.email.toLowerCase())) return false;
      if (membership.has(contact.id)) return true;
      if (!segment) return false;
      const matches = (rule) => matchesRule(rule, contact, lists, engagement);
      return segment.mode === 'and'
        ? segment.rules.every(matches)
        : segment.rules.some(matches);
    });
}

export function campaignAudience(db, id) {
  const campaign = db
    .prepare('SELECT segment_id, exclusions FROM campaigns WHERE id = ?')
    .get(id);
  if (!campaign) return null;
  return {
    listIds: db
      .prepare('SELECT list_id FROM campaign_lists WHERE campaign_id = ?')
      .all(id)
      .map((row) => row.list_id),
    segmentId: campaign.segment_id,
    exclusions: JSON.parse(campaign.exclusions),
  };
}
