import path from 'node:path';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { exportReport } from './export-service.js';
import {
  listSegments,
  saveSegment,
  deleteSegment,
  resolveAudience,
} from './audience-service.js';
import {
  reviewCampaign,
  planCampaign,
  controlCampaign,
  sendCampaignTest,
} from './delivery-service.js';
import {
  analytics,
  campaignMetrics,
  listSuppressions,
  report,
} from './report-service.js';
import {
  listActivity,
  listNotifications,
  readNotification,
  recordActivity,
  saveSettings,
  setSetting,
  settings,
} from './operations.js';
import { listForms, saveForm, deleteForm } from './forms-service.js';
import {
  listUsers,
  saveUser,
  deleteUser,
  listLoginHistory,
  createRecoveryCode,
  resetWithCode,
  changePassword,
  rolePermissions,
  saveRolePermissions,
} from './admin-service.js';
import {
  backupHistory,
  createBackup,
  restoreBackup,
} from './backup-service.js';

const failed = (error) => ({ ok: false, error });
const isDatabasePath = (value) =>
  typeof value === 'string' &&
  path.isAbsolute(value) &&
  /\.(?:sqlite|sqlite3|db)$/i.test(value);

export function registerWorkspaceRoutes(
  register,
  { db, decrypt, restoreWithWorker },
) {
  const handle = (name, permission, action) =>
    register('workspace:' + name, permission, action);
  const read = 'workspace.read';
  const edit = 'workspace.edit';
  const send = 'campaign.send';
  const admin = 'workspace.admin';
  handle('segments', read, () => ({ ok: true, segments: listSegments(db) }));
  handle('saveSegment', edit, (input, user) =>
    db
      .transaction(() => {
        const result = saveSegment(db, input);
        if (result.ok)
          recordActivity(
            db,
            user.id,
            'segment.saved',
            'segment',
            input.id || null,
            input.name,
          );
        return result;
      })
      .immediate(),
  );
  handle('deleteSegment', edit, (id, user) =>
    db
      .transaction(() => {
        const result = deleteSegment(db, id);
        if (result.ok)
          recordActivity(
            db,
            user.id,
            'segment.deleted',
            'segment',
            id,
            'Segment deleted.',
          );
        return result;
      })
      .immediate(),
  );
  handle('segmentCount', read, (id) => ({
    ok: true,
    count: resolveAudience(db, { segmentId: id }).length,
  }));
  handle('review', read, (id) => reviewCampaign(db, id));
  handle('sendTest', send, (id, user) => {
    const since = new Date(Date.now() - 60000).toISOString();
    if (
      db
        .prepare(
          "SELECT 1 FROM activity_log WHERE actor_user_id = ? AND action = 'campaign.test' AND created_at >= ?",
        )
        .get(user.id, since)
    ) {
      return failed('Wait one minute before sending another test email.');
    }
    recordActivity(
      db,
      user.id,
      'campaign.test',
      'campaign',
      id,
      'Test email requested by the signed-in user.',
    );
    return sendCampaignTest(db, id, user.email, { decrypt });
  });
  handle('plan', send, (input, user) =>
    planCampaign(db, user.id, input.id, input),
  );
  handle('control', send, (input, user) =>
    controlCampaign(db, user.id, input.id, input.action),
  );
  handle('metrics', read, (id) => ({
    ok: true,
    data: campaignMetrics(db, id),
  }));
  handle('analytics', read, (input) => analytics(db, input));
  handle('report', read, (input) => report(db, input));
  handle('exportReport', read, (input) => exportReport(db, input));
  handle('suppressions', read, () => ({
    ok: true,
    rows: listSuppressions(db),
  }));
  handle('suppress', edit, (input, user) => {
    const email =
      typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const reason = input?.reason;
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
      !['blocked', 'unsubscribed'].includes(reason)
    )
      return failed('Enter a valid email and reason.');
    db.transaction(() => {
      const now = new Date().toISOString();
      db.prepare(
        'INSERT OR IGNORE INTO suppression_list VALUES (?, ?, ?, ?)',
      ).run(email, reason, 'manual', now);
      if (reason === 'unsubscribed')
        db.prepare(
          'INSERT OR IGNORE INTO unsubscribe_list VALUES (?, ?, ?)',
        ).run(email, 'manual', now);
      db.prepare(
        'UPDATE contacts SET subscription_status = ?, updated_at = ? WHERE email = ?',
      ).run(reason, now, email);
      recordActivity(db, user.id, 'contact.suppressed', 'contact', null, email);
    }).immediate();
    return { ok: true };
  });
  handle('forms', read, () => ({ ok: true, forms: listForms(db) }));
  handle('saveForm', edit, (input, user) => saveForm(db, user.id, input));
  handle('deleteForm', edit, (id, user) => deleteForm(db, user.id, id));
  handle('activity', admin, () => ({ ok: true, rows: listActivity(db) }));
  handle('notifications', read, (_input, user) => ({
    ok: true,
    rows: listNotifications(db, user.id),
  }));
  handle('readNotification', read, (id, user) =>
    readNotification(db, user.id, id),
  );
  handle('users', admin, () => ({
    ok: true,
    users: listUsers(db),
    logins: listLoginHistory(db),
    permissions: rolePermissions(db),
  }));
  handle('savePermissions', admin, (input, user) =>
    saveRolePermissions(db, user, input),
  );
  handle('saveUser', admin, (input, user) => saveUser(db, user, input));
  handle('deleteUser', admin, (id, user) => deleteUser(db, user, id));
  handle('newRecoveryCode', read, (_input, user) =>
    createRecoveryCode(db, user),
  );
  handle('resetPassword', null, (input) => resetWithCode(db, input));
  handle('changePassword', read, (input, user) =>
    changePassword(db, user, input),
  );
  handle('preferences', read, () => ({ ok: true, theme: settings(db).theme }));
  handle('theme', read, (input) => {
    setSetting(db, 'theme', input === 'dark' ? 'dark' : 'light');
    return { ok: true };
  });
  handle('settings', admin, () => ({
    ok: true,
    settings: settings(db),
    path: db.name,
    backups: backupHistory(db),
  }));
  handle('saveSettings', admin, (input, user) => {
    const result = saveSettings(db, input);
    if (!result.ok) return result;
    if (!settings(db).publicInstance)
      setSetting(db, 'publicInstance', randomUUID());
    recordActivity(
      db,
      user.id,
      'settings.updated',
      'settings',
      null,
      'Application settings saved.',
    );
    return result;
  });
  handle('checkPublic', admin, async () => {
    const { publicUrl, publicInstance } = settings(db);
    if (!publicUrl || !publicInstance)
      return failed('Save the public HTTPS URL first.');
    try {
      const response = await fetch(publicUrl + '/api/ready', {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (response.ok && (await response.json()).instance === publicInstance)
        return { ok: true };
    } catch {
      /* An unavailable service is reported below. */
    }
    return failed(
      'The public service did not respond with this workspace’s identifier.',
    );
  });
  handle('desktopNotifications', read, (input) => {
    const since =
      typeof input === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input)
        ? input
        : new Date().toISOString();
    const enabled = settings(db).desktopNotifications;
    const rows = enabled
      ? db
          .prepare(
            'SELECT id, message, created_at FROM notifications WHERE created_at > ? ORDER BY created_at, id LIMIT 2000',
          )
          .all(since)
      : [];
    return { ok: true, enabled, rows };
  });
  handle('chooseBackupFolder', admin, async (folder) => {
    if (
      typeof folder !== 'string' ||
      !path.isAbsolute(folder) ||
      !(await stat(folder).catch(() => null))?.isDirectory()
    ) {
      return failed('Choose an existing folder accessible to the backend.');
    }
    setSetting(db, 'backupFolder', folder);
    return { ok: true };
  });
  handle('backup', admin, async (filename) => {
    if (!isDatabasePath(filename))
      return failed('Choose a SQLite backup file.');
    const [destination, original] = await Promise.all([
      stat(filename).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }),
      stat(db.name),
    ]);
    if (
      destination &&
      (!destination.isFile() ||
        (destination.ino === original.ino && destination.dev === original.dev))
    ) {
      return failed('Choose a different file from the live database.');
    }
    return createBackup(db, filename);
  });
  handle('restore', admin, async (filename, user) => {
    if (user.role !== 'super_admin')
      return failed('Only the Super Admin can restore the database.');
    if (!isDatabasePath(filename))
      return failed('Choose a SQLite backup file.');
    return restoreWithWorker(() => restoreBackup(db, filename));
  });
  handle('exportTemplate', read, (id) => {
    const template = db
      .prepare('SELECT name, html_body FROM email_templates WHERE id = ?')
      .get(id);
    if (!template) return failed('Template not found.');
    return {
      ok: true,
      file: {
        name: template.name.replace(/[^a-z0-9-]/gi, '-') + '.html',
        format: 'html',
        text: template.html_body,
      },
    };
  });
  handle('openForm', read, (id) => {
    const form = listForms(db).find(
      (item) => item.id === id && item.published && item.url,
    );
    if (!form) return failed('Publish the form first.');
    return { ok: true, url: form.url };
  });
}
