import { campaignAudience, resolveAudience } from './audience-service.js';

export const reportTypes = [
  'campaigns',
  'contacts',
  'lists',
  'subscribers',
  'bounces',
  'unsubscribes',
  'smtp',
  'daily',
  'monthly',
  'complaints',
  'queue',
];
const isoDay = /^\d{4}-\d\d-\d\d$/;
const condition = (column) => column + ' >= @from AND ' + column + ' <= @to';
const withRange = (db, query, range) => db.prepare(query).all(range);

function dateRange(input) {
  const { from = '', to = '' } = input || {};
  if (
    (from && !isoDay.test(from)) ||
    (to && !isoDay.test(to)) ||
    (from && to && from > to)
  )
    return null;
  return { from: from || '0000', to: to ? to + 'T23:59:59.999Z' : '9999' };
}

export function campaignMetrics(db, id) {
  const campaign = db
    .prepare(
      'SELECT id, name, subject, status, started_at, completed_at, scheduled_at, timezone FROM campaigns WHERE id = ?',
    )
    .get(id);
  if (!campaign) return null;
  const queue = db
    .prepare(
      'SELECT q.state, count(*) AS count FROM email_queue q JOIN campaign_recipients r ON r.id = q.recipient_id WHERE r.campaign_id = ? GROUP BY q.state',
    )
    .all(id);
  const events = db
    .prepare(
      'SELECT e.kind, count(*) AS total, count(DISTINCT e.recipient_id) AS unique_count FROM tracking_events e JOIN campaign_recipients r ON r.id = e.recipient_id WHERE r.campaign_id = ? GROUP BY e.kind',
    )
    .all(id);
  const logs = db
    .prepare(
      'SELECT l.created_at, l.kind, l.detail, r.email FROM email_logs l JOIN campaign_recipients r ON r.id = l.recipient_id WHERE r.campaign_id = ? ORDER BY l.created_at DESC LIMIT 100',
    )
    .all(id);
  const states = Object.fromEntries(queue.map((row) => [row.state, row.count]));
  const total =
    queue.reduce((sum, row) => sum + row.count, 0) ||
    (campaign.status === 'scheduled'
      ? resolveAudience(db, campaignAudience(db, id)).length
      : 0);
  return {
    campaign,
    audience: campaignAudience(db, id),
    states,
    events,
    logs,
    total,
    remaining:
      campaign.status === 'scheduled'
        ? total
        : (states.pending || 0) + (states.working || 0),
  };
}

export function analytics(db, input) {
  const range = dateRange(input);
  if (!range) return { ok: false, error: 'Choose a valid date range.' };
  const submitted = db
    .prepare(
      'SELECT count(*) AS count FROM email_queue WHERE ' +
        condition('submitted_at'),
    )
    .get(range).count;
  const events = withRange(
    db,
    'SELECT kind, count(*) AS total, count(DISTINCT recipient_id) AS unique_count FROM tracking_events WHERE ' +
      condition('created_at') +
      ' GROUP BY kind',
    range,
  );
  const totals = Object.fromEntries(events.map((event) => [event.kind, event]));
  const engagement = withRange(
    db,
    'SELECT e.kind, count(DISTINCT e.recipient_id) AS recipients FROM tracking_events e JOIN email_queue q ON q.recipient_id = e.recipient_id WHERE ' +
      condition('q.submitted_at') +
      ' AND e.created_at <= @to GROUP BY e.kind',
    range,
  );
  const campaigns = report(db, { ...input, type: 'campaigns' }).rows;
  const period = ['weekly', 'monthly'].includes(input?.period)
    ? input.period
    : 'daily';
  return {
    ok: true,
    submitted,
    totals,
    cohort: Object.fromEntries(
      engagement.map((event) => [event.kind, event.recipients]),
    ),
    campaigns,
    trend: timeline(db, range, period),
    counts: db
      .prepare(
        'SELECT (SELECT count(*) FROM contacts) AS contacts, (SELECT count(*) FROM contacts WHERE subscription_status = ?) AS subscribers, (SELECT count(*) FROM contact_lists) AS lists, (SELECT count(*) FROM contact_segments) AS segments, (SELECT count(*) FROM campaigns) AS campaigns, (SELECT count(*) FROM campaigns WHERE status = ?) AS scheduled, (SELECT count(*) FROM email_queue WHERE state IN (?,?)) AS waiting',
      )
      .get('subscribed', 'scheduled', 'pending', 'working'),
  };
}

function timeline(db, range, period) {
  const rows = withRange(
    db,
    "SELECT substr(stamp, 1, 10) AS day, kind, count(*) AS count FROM (SELECT submitted_at AS stamp, 'submitted' AS kind FROM email_queue WHERE submitted_at IS NOT NULL UNION ALL SELECT created_at, kind FROM tracking_events) WHERE " +
      condition('stamp') +
      ' GROUP BY day, kind ORDER BY day',
    range,
  );
  const points = new Map();
  for (const row of rows) {
    let day = row.day;
    if (period === 'weekly') {
      const date = new Date(day + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      day = date.toISOString().slice(0, 10);
    } else if (period === 'monthly') day = day.slice(0, 7);
    if (!points.has(day))
      points.set(day, {
        date: day,
        submitted: 0,
        open: 0,
        click: 0,
        bounce: 0,
        delivered: 0,
        complaint: 0,
        unsubscribe: 0,
      });
    points.get(day)[row.kind] += row.count;
  }
  return [...points.values()];
}

export function report(db, input) {
  const range = dateRange(input);
  if (!range || !reportTypes.includes(input?.type))
    return { ok: false, error: 'Choose a report and date range.' };
  const type = input.type;
  let rows;
  if (type === 'daily' || type === 'monthly') rows = timeline(db, range, type);
  else if (type === 'campaigns') {
    rows = withRange(
      db,
      'SELECT c.id, c.name, c.subject, c.status, c.started_at, c.completed_at, ' +
        '(SELECT count(*) FROM campaign_recipients r JOIN email_queue q ON q.recipient_id = r.id WHERE r.campaign_id = c.id AND ' +
        condition('q.submitted_at') +
        ') AS submitted, ' +
        ['delivered', 'open', 'click', 'bounce', 'complaint', 'unsubscribe']
          .map(
            (kind) =>
              "(SELECT count(DISTINCT e.recipient_id) FROM tracking_events e JOIN campaign_recipients r ON r.id = e.recipient_id WHERE r.campaign_id = c.id AND e.kind = '" +
              kind +
              "' AND " +
              condition('e.created_at') +
              ') AS ' +
              kind,
          )
          .join(', ') +
        ' FROM campaigns c WHERE ' +
        condition('c.created_at') +
        ' OR EXISTS (SELECT 1 FROM campaign_recipients r JOIN email_queue q ON q.recipient_id = r.id WHERE r.campaign_id = c.id AND ' +
        condition('q.submitted_at') +
        ') OR EXISTS (SELECT 1 FROM campaign_recipients r JOIN tracking_events e ON e.recipient_id = r.id WHERE r.campaign_id = c.id AND ' +
        condition('e.created_at') +
        ') ORDER BY c.created_at DESC',
      range,
    );
  } else {
    const queries = {
      contacts:
        'SELECT full_name, email, company, country, subscription_status, created_at FROM contacts WHERE ' +
        condition('created_at'),
      lists:
        'SELECT l.name, l.description, l.created_at, (SELECT count(*) FROM contact_list_members m WHERE m.list_id = l.id) AS contacts FROM contact_lists l WHERE ' +
        condition('l.created_at'),
      subscribers:
        "SELECT full_name, email, consent_source, consent_at FROM contacts WHERE subscription_status = 'subscribed' AND " +
        condition('consent_at'),
      bounces:
        'SELECT r.email, b.category, b.provider, c.name AS campaign, e.created_at FROM bounce_logs b JOIN tracking_events e ON e.id = b.id JOIN campaign_recipients r ON r.id = e.recipient_id JOIN campaigns c ON c.id = r.campaign_id WHERE ' +
        condition('e.created_at'),
      complaints:
        "SELECT r.email, c.name AS campaign, e.created_at FROM tracking_events e JOIN campaign_recipients r ON r.id = e.recipient_id JOIN campaigns c ON c.id = r.campaign_id WHERE e.kind = 'complaint' AND " +
        condition('e.created_at'),
      unsubscribes:
        'SELECT email, source, created_at FROM unsubscribe_list WHERE ' +
        condition('created_at'),
      smtp:
        'SELECT name, host, sender_email, connection_status, last_tested_at FROM smtp_accounts WHERE ' +
        condition('created_at'),
      queue:
        'SELECT c.name AS campaign, r.email, q.state, q.attempts, q.next_at, q.updated_at FROM email_queue q JOIN campaign_recipients r ON r.id = q.recipient_id JOIN campaigns c ON c.id = r.campaign_id WHERE ' +
        condition('q.updated_at'),
    };
    rows = withRange(db, queries[type], range);
  }
  if (type === 'campaigns' && input.campaignId)
    rows = rows.filter((row) => row.id === input.campaignId);
  return { ok: true, rows };
}

export function listSuppressions(db) {
  return db
    .prepare(
      'SELECT email, reason, source, created_at FROM suppression_list ORDER BY created_at DESC',
    )
    .all();
}
