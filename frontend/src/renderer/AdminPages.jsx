import { useEffect, useState } from 'react';
import { Modal, PageHeading, formatDate, useToast } from './ui.jsx';
import {
  Action,
  call,
  DataTable,
  ErrorText,
  Field,
  QueryState,
  useQuery,
} from './workspace-ui.jsx';

const roles = {
  super_admin: 'Super Admin',
  administrator: 'Administrator',
  marketing_manager: 'Campaign Manager',
  campaign_operator: 'Marketing Staff',
  viewer: 'Viewer',
};
const emptyUser = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  role: 'viewer',
  active: true,
};

export function Users({ user }) {
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery('users', undefined, revision);
  const allowed = (row) =>
    row.id !== user.id &&
    row.role !== 'super_admin' &&
    (row.role !== 'administrator' || user.role === 'super_admin');
  const update = (key, value) =>
    setEditing((current) => ({ ...current, [key]: value }));
  async function modify(method, input) {
    setError('');
    setBusy(true);
    try {
      await call(method, input);
      setEditing(null);
      setRevision(revision + 1);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-page">
      <PageHeading
        title="Users"
        description="Manage workspace accounts and review recent sign-ins."
        actions={
          <Action
            primary
            onClick={() => {
              setError('');
              setEditing(emptyUser);
            }}
          >
            New user
          </Action>
        }
      />
      <QueryState query={query} />
      {!editing && <ErrorText text={error} />}
      {query.data && (
        <>
          <section className="studio-card">
            {query.data.users.map((row) => (
              <article className="studio-record" key={row.id}>
                <div>
                  <h2>
                    {row.fullName}{' '}
                    <span className="studio-badge">{roles[row.role]}</span>
                  </h2>
                  <p>
                    {row.username} · {row.email} ·{' '}
                    {row.active ? 'Active' : 'Disabled'}
                  </p>
                  <p>Last sign-in {formatDate(row.lastLogin)}</p>
                </div>
                {allowed(row) && (
                  <div className="studio-actions">
                    <Action
                      onClick={() => {
                        setError('');
                        setEditing({ ...row, password: '' });
                      }}
                    >
                      Edit account
                    </Action>
                    <Action
                      danger
                      disabled={busy}
                      onClick={() =>
                        window.confirm('Delete this user account?') &&
                        modify('deleteUser', row.id)
                      }
                    >
                      Delete
                    </Action>
                  </div>
                )}
              </article>
            ))}
          </section>
          <section className="studio-card">
            <h2>Role permissions</h2>
            {['marketing_manager', 'campaign_operator', 'viewer'].map(
              (role) => {
                const assigned = query.data.permissions
                  .filter((row) => row.role_id === role)
                  .map((row) => row.permission);
                const edit = assigned.includes('workspace.edit');
                const send = assigned.includes('campaign.send');
                return (
                  <div className="studio-record" key={role}>
                    <strong>{roles[role]}</strong>
                    <div className="studio-actions">
                      <label className="studio-check">
                        <input
                          type="checkbox"
                          checked={edit}
                          disabled={busy}
                          onChange={(e) =>
                            modify('savePermissions', {
                              role,
                              edit: e.target.checked,
                              send: e.target.checked && send,
                            })
                          }
                        />
                        Edit workspace data
                      </label>
                      <label className="studio-check">
                        <input
                          type="checkbox"
                          checked={send}
                          disabled={busy || !edit}
                          onChange={(e) =>
                            modify('savePermissions', {
                              role,
                              edit,
                              send: e.target.checked,
                            })
                          }
                        />
                        Send and schedule campaigns
                      </label>
                    </div>
                  </div>
                );
              },
            )}
          </section>
          <section className="studio-card">
            <h2>Login history</h2>
            <DataTable
              rows={query.data.logins.map((row) => ({
                username: row.username,
                outcome: row.successful ? 'Signed in' : 'Failed',
                time: formatDate(row.created_at),
              }))}
            />
          </section>
        </>
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Edit user' : 'Create user'}
          onClose={() => setEditing(null)}
        >
          <form
            className="studio-form"
            onSubmit={(e) => {
              e.preventDefault();
              modify('saveUser', editing);
            }}
          >
            {[
              ['fullName', 'Full name', 'text', 100],
              ['username', 'Username', 'text', 30],
              ['email', 'Email', 'email', 254],
            ].map(([key, label, type, max]) => (
              <Field label={label} key={key}>
                <input
                  required
                  type={type}
                  maxLength={max}
                  value={editing[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
              </Field>
            ))}
            <Field label="Role">
              <select
                value={editing.role}
                onChange={(e) => update('role', e.target.value)}
              >
                {Object.entries(roles)
                  .filter(
                    ([key]) =>
                      key !== 'super_admin' &&
                      (key !== 'administrator' || user.role === 'super_admin'),
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={editing.id ? 'New password (optional)' : 'Password'}>
              <input
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                required={!editing.id}
                value={editing.password}
                onChange={(e) => update('password', e.target.value)}
              />
            </Field>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => update('active', e.target.checked)}
              />{' '}
              Account active
            </label>
            <ErrorText text={error} />
            <div className="studio-actions studio-wide">
              <Action primary type="submit" disabled={busy}>
                Save user
              </Action>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Notifications() {
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const query = useQuery('notifications', undefined, revision, 8000);
  return (
    <div className="studio-page">
      <PageHeading title="Notifications" />
      <QueryState query={query} />
      <ErrorText text={error} />
      {query.data && (
        <section className="studio-card">
          {!query.data.rows.length && (
            <p className="studio-empty">You have no notifications yet.</p>
          )}
          {query.data.rows.map((row) => (
            <article className="studio-record" key={row.id}>
              <div>
                <h2>{row.kind.replaceAll('.', ' ')}</h2>
                <p>{row.message}</p>
                <p>{formatDate(row.created_at)}</p>
              </div>
              {!row.read && (
                <Action
                  onClick={async () => {
                    try {
                      await call('readNotification', row.id);
                      setRevision(revision + 1);
                    } catch (cause) {
                      setError(cause.message);
                    }
                  }}
                >
                  Mark as read
                </Action>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export function Activity() {
  const query = useQuery('activity');
  return (
    <div className="studio-page">
      <PageHeading title="Activity logs" />
      <QueryState query={query} />
      {query.data && (
        <section className="studio-card">
          <DataTable
            rows={query.data.rows.map(
              ({ actor, action, entity_type, description, created_at }) => ({
                actor,
                action,
                entity_type,
                description,
                time: formatDate(created_at),
              }),
            )}
          />
        </section>
      )}
    </div>
  );
}

export function Settings({ admin, user, onSignOut, theme, toggleTheme }) {
  return (
    <div className="studio-page">
      <PageHeading title="Settings" />
      <section className="studio-card studio-record">
        <div>
          <h2>Appearance</h2>
          <p>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</p>
        </div>
        <Action onClick={toggleTheme}>Switch theme</Action>
      </section>
      <AccountSecurity onSignOut={onSignOut} />
      {admin && <SystemSettings user={user} onSignOut={onSignOut} />}
    </div>
  );
}

function AccountSecurity({ onSignOut }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function recover() {
    if (
      !window.confirm(
        'Generate a new recovery code? This replaces any previous code.',
      )
    )
      return;
    try {
      const result = await call('newRecoveryCode');
      setCode(result.code);
    } catch (cause) {
      setError(cause.message);
    }
  }
  async function change(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await call('changePassword', { current, password });
      await onSignOut();
      toast('Password changed. Sign in again.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="studio-card">
      <h2>Account security</h2>
      <form className="studio-form" onSubmit={change}>
        <Field label="Current password">
          <input
            required
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <input
            required
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            required
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div className="studio-actions studio-wide">
          <Action primary type="submit" disabled={busy}>
            Change password
          </Action>
          <Action onClick={recover}>Generate recovery code</Action>
        </div>
      </form>
      {code && (
        <p className="studio-recovery">
          <strong>Save this one-time recovery code somewhere secure.</strong>{' '}
          <code>{code}</code>
        </p>
      )}
      <ErrorText text={error} />
    </section>
  );
}

function SystemSettings({ user, onSignOut }) {
  const [revision, setRevision] = useState(0);
  const query = useQuery('settings', undefined, revision);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (query.data) setForm(query.data.settings);
  }, [query.data]);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function run(method, input, label) {
    setBusy(true);
    setError('');
    try {
      const result = await call(method, input);
      if (result.ok) {
        if (method === 'restore') await onSignOut();
        else if (method !== 'checkPublic') setRevision(revision + 1);
        if (label) toast(label);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <QueryState query={query} />
      <ErrorText text={error} />
      {form && (
        <section className="studio-card">
          <h2>Sending and public service</h2>
          <form
            className="studio-form"
            onSubmit={(e) => {
              e.preventDefault();
              run('saveSettings', form, 'Settings saved.');
            }}
          >
            <Field label="Business address" wide>
              <textarea
                value={form.businessAddress}
                maxLength={500}
                onChange={(e) => update('businessAddress', e.target.value)}
              />
            </Field>
            <Field label="Public HTTPS origin" wide>
              <input
                type="url"
                placeholder="https://mail.example.com"
                value={form.publicUrl}
                onChange={(e) => update('publicUrl', e.target.value)}
              />
            </Field>
            <Field label="Seconds between submissions">
              <input
                type="number"
                required
                min={1}
                max={3600}
                value={form.intervalSeconds}
                onChange={(e) => update('intervalSeconds', e.target.value)}
              />
            </Field>
            <Field label="Hourly attempts per SMTP account">
              <input
                type="number"
                required
                min={1}
                max={10000}
                value={form.hourlyLimit}
                onChange={(e) => update('hourlyLimit', e.target.value)}
              />
            </Field>
            {[
              ['trackOpen', 'Track opens'],
              ['trackClick', 'Track clicks'],
              ['desktopNotifications', 'Desktop notifications'],
              ['autoBackup', 'Daily automatic backups'],
            ].map(([key, label]) => (
              <label className="studio-check" key={key}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => update(key, e.target.checked)}
                />{' '}
                {label}
              </label>
            ))}
            <div className="studio-actions studio-wide">
              <Action primary type="submit" disabled={busy}>
                Save settings
              </Action>
              <Action
                disabled={busy}
                onClick={() =>
                  run(
                    'checkPublic',
                    undefined,
                    'Public service connected to this workspace.',
                  )
                }
              >
                Test public service
              </Action>
            </div>
          </form>
        </section>
      )}
      {query.data && (
        <section className="studio-card">
          <h2>Database and backups</h2>
          <p className="studio-muted studio-path">{query.data.path}</p>
          <p className="studio-muted studio-path">
            Backup folder{' '}
            {query.data.settings.backupFolder ||
              'Choose a folder for automatic backups.'}
          </p>
          <div className="studio-actions">
            <Action disabled={busy} onClick={() => run('chooseBackupFolder')}>
              Choose folder
            </Action>
            <Action
              disabled={busy}
              primary
              onClick={() => run('backup', undefined, 'Backup created.')}
            >
              Back up now
            </Action>
            {user.role === 'super_admin' && (
              <Action
                danger
                disabled={busy}
                onClick={() => run('restore', undefined, 'Database restored.')}
              >
                Restore database
              </Action>
            )}
          </div>
          <DataTable
            rows={query.data.backups}
            omit={['id']}
            empty="No backups recorded."
          />
        </section>
      )}
    </>
  );
}
