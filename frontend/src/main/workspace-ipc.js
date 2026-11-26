import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
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
  escapeHtml,
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
const safeSpreadsheet = (value) =>
  typeof value === 'string' && /^[\s]*[=+@-]/.test(value)
    ? "'" + value
    : (value ?? '');
const csvValue = (value) =>
  '"' + String(safeSpreadsheet(value)).replaceAll('"', '""') + '"';

async function exportReport(db, window, input) {
  const dataset = report(db, input);
  if (!dataset.ok) return dataset;
  if (!dataset.rows.length)
    return failed('There are no rows to export for this date range.');
  const format = input.format;
  if (!['csv', 'xlsx', 'pdf'].includes(format))
    return failed('Choose a supported report format.');
  const result = await dialog.showSaveDialog(window, {
    defaultPath: input.type + '-report.' + format,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled) return { ok: false, cancelled: true };
  const columns = Object.keys(dataset.rows[0]);
  const rows = dataset.rows.map((row) => columns.map((column) => row[column]));
  if (format === 'csv') {
    await writeFile(
      result.filePath,
      '\uFEFF' +
        [columns, ...rows]
          .map((row) => row.map(csvValue).join(','))
          .join('\r\n'),
      'utf8',
    );
  } else if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.columns = columns.map((key) => ({
      header: key.replaceAll('_', ' '),
      key,
      width: 25,
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) sheet.addRow(row.map((value) => value ?? ''));
    await workbook.xlsx.writeFile(result.filePath);
  } else {
    const html =
      '<meta charset="utf-8"><style>body{font:12px sans-serif;color:#142748}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #cdd7e8;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#eaf0f9}tr{break-inside:avoid}</style><h1>' +
      escapeHtml(input.type) +
      ' report</h1><table><thead><tr>' +
      columns
        .map((item) => '<th>' + escapeHtml(item.replaceAll('_', ' ')) + '</th>')
        .join('') +
      '</tr></thead><tbody>' +
      rows
        .map(
          (row) =>
            '<tr>' +
            row
              .map((item) => '<td>' + escapeHtml(item ?? '') + '</td>')
              .join('') +
            '</tr>',
        )
        .join('') +
      '</tbody></table>';
    const printer = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        javascript: false,
      },
    });
    try {
      await printer.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(html),
      );
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        landscape: columns.length > 5,
      });
      await writeFile(result.filePath, pdf);
    } finally {
      printer.destroy();
    }
  }
  return { ok: true };
}

export function registerWorkspaceIpc({
  db,
  getWindow,
  trust,
  authorize,
  decrypt,
  clearSessions,
  restoreWithWorker,
}) {
  const handle = (name, permission, action) =>
    ipcMain.handle('workspace:' + name, (event, input) => {
      trust(event);
      const user = permission && authorize(event, permission);
      return action(input, user);
    });
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
  handle('exportReport', read, (input) => exportReport(db, getWindow(), input));
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
  handle('chooseBackupFolder', admin, async () => {
    const choice = await dialog.showOpenDialog(getWindow(), {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (choice.canceled) return { ok: false, cancelled: true };
    setSetting(db, 'backupFolder', choice.filePaths[0]);
    return { ok: true };
  });
  handle('backup', admin, async () => {
    const choice = await dialog.showSaveDialog(getWindow(), {
      defaultPath: 'bulk-mail-backup.sqlite',
      filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
    });
    if (choice.canceled) return { ok: false, cancelled: true };
    try {
      const [destination, original] = await Promise.all([
        stat(choice.filePath),
        stat(db.name),
      ]);
      if (destination.ino === original.ino && destination.dev === original.dev)
        return failed('Choose a different file from the live database.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return createBackup(db, choice.filePath);
  });
  handle('restore', admin, async (_input, user) => {
    if (user.role !== 'super_admin')
      return failed('Only the Super Admin can restore the database.');
    const choice = await dialog.showOpenDialog(getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
    });
    if (choice.canceled) return { ok: false, cancelled: true };
    const confirmation = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['Cancel', 'Restore database'],
      defaultId: 0,
      cancelId: 0,
      message: 'Restore this backup and replace the workspace?',
      detail:
        'Current suppression records are retained. Restored active campaigns are cancelled and everyone is signed out.',
    });
    if (confirmation.response !== 1) return { ok: false, cancelled: true };
    const result = await restoreWithWorker(() =>
      restoreBackup(db, choice.filePaths[0]),
    );
    if (result.ok) clearSessions();
    return result;
  });
  handle('exportTemplate', read, async (id) => {
    const template = db
      .prepare('SELECT name, html_body FROM email_templates WHERE id = ?')
      .get(id);
    if (!template) return failed('Template not found.');
    const choice = await dialog.showSaveDialog(getWindow(), {
      defaultPath: template.name.replace(/[^a-z0-9-]/gi, '-') + '.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (choice.canceled) return { ok: false, cancelled: true };
    await writeFile(choice.filePath, template.html_body, 'utf8');
    return { ok: true };
  });
  handle('openForm', read, async (id) => {
    const form = listForms(db).find(
      (item) => item.id === id && item.published && item.url,
    );
    if (!form) return failed('Publish the form first.');
    await shell.openExternal(form.url);
    return { ok: true };
  });
}
