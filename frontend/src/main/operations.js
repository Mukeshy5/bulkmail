import { randomUUID } from 'node:crypto';

const defaults = {
  businessAddress: '',
  publicUrl: '',
  intervalSeconds: 5,
  hourlyLimit: 100,
  trackOpen: false,
  trackClick: false,
  desktopNotifications: false,
  backupFolder: '',
  autoBackup: false,
  theme: 'light',
};

export function settings(db) {
  const values = Object.fromEntries(
    db
      .prepare('SELECT key, value FROM application_settings')
      .all()
      .map((row) => [row.key, JSON.parse(row.value)]),
  );
  return { ...defaults, ...values };
}

export function saveSettings(db, input) {
  const publicUrl =
    typeof input?.publicUrl === 'string'
      ? input.publicUrl.trim().replace(/\/+$/, '')
      : '';
  if (publicUrl) {
    let url;
    try {
      url = new URL(publicUrl);
    } catch {
      return { ok: false, error: 'Enter a valid HTTPS public URL.' };
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      return {
        ok: false,
        error: 'Enter the HTTPS origin of the public service, without a path.',
      };
    }
  }
  const intervalSeconds = Number(input?.intervalSeconds);
  const hourlyLimit = Number(input?.hourlyLimit);
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < 1 ||
    intervalSeconds > 3600 ||
    !Number.isInteger(hourlyLimit) ||
    hourlyLimit < 1 ||
    hourlyLimit > 10000
  ) {
    return {
      ok: false,
      error:
        'Enter a sending interval of 1–3,600 seconds and an hourly limit of 1–10,000.',
    };
  }
  const businessAddress =
    typeof input?.businessAddress === 'string'
      ? input.businessAddress.trim()
      : '';
  if (businessAddress.length > 500)
    return {
      ok: false,
      error: 'The business address can be up to 500 characters.',
    };
  const next = {
    businessAddress,
    publicUrl,
    intervalSeconds,
    hourlyLimit,
    trackOpen: input.trackOpen === true,
    trackClick: input.trackClick === true,
    desktopNotifications: input.desktopNotifications === true,
    autoBackup: input.autoBackup === true,
    theme: input.theme === 'dark' ? 'dark' : 'light',
  };
  db.transaction(() => {
    for (const [key, value] of Object.entries(next)) setSetting(db, key, value);
  }).immediate();
  return { ok: true, settings: settings(db) };
}

export function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO application_settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function recordActivity(db, actor, action, type, id, description) {
  db.prepare('INSERT INTO activity_log VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    actor,
    action,
    type,
    id,
    description,
    new Date().toISOString(),
  );
}

export function notify(db, kind, message) {
  db.prepare('INSERT INTO notifications VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    kind,
    message,
    new Date().toISOString(),
  );
}

export function listNotifications(db, userId) {
  return db
    .prepare(
      'SELECT n.*, r.user_id IS NOT NULL AS read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ? ORDER BY n.created_at DESC LIMIT 250',
    )
    .all(userId);
}

export function readNotification(db, userId, id) {
  db.prepare(
    'INSERT OR IGNORE INTO notification_reads SELECT id, ? FROM notifications WHERE id = ?',
  ).run(userId, id);
  return { ok: true };
}

export function listActivity(db) {
  return db
    .prepare(
      'SELECT a.*, u.full_name AS actor FROM activity_log a LEFT JOIN users u ON a.actor_user_id = u.id ORDER BY a.created_at DESC LIMIT 500',
    )
    .all();
}
