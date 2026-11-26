import { useEffect, useState } from 'react';
import { ErrorPanel, Modal, PageHeading, useToast } from './ui.jsx';

const emptyAccount = {
  name: '',
  host: '',
  port: '587',
  encryption: 'starttls',
  username: '',
  password: '',
  senderName: '',
  senderEmail: '',
  replyToEmail: '',
  isEnabled: true,
  isDefault: false,
};

export default function SmtpAccounts({ canManage }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(undefined);
  const [testingId, setTestingId] = useState(null);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.bulkMail.smtpAccounts
      .list()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setAccounts(result.accounts);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load SMTP accounts.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  async function testConnection(account) {
    setTestingId(account.id);
    try {
      const result = await window.bulkMail.smtpAccounts.test(account.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        setReload((value) => value + 1);
        return;
      }
      showToast(`Connection verified for ${account.name}.`);
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'SMTP test failed.',
        'error',
      );
    } finally {
      setTestingId(null);
    }
  }

  async function setDefault(account) {
    try {
      const result = await window.bulkMail.smtpAccounts.setDefault(account.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`${account.name} is now the default SMTP account.`);
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not set the default.',
        'error',
      );
    }
  }

  async function deleteAccount(account) {
    if (
      !window.confirm(
        `Delete SMTP account "${account.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const result = await window.bulkMail.smtpAccounts.delete(account.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('SMTP account deleted.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not delete the account.',
        'error',
      );
    }
  }

  if (error && !accounts.length) {
    return (
      <ErrorPanel
        message={error}
        onRetry={() => setReload((value) => value + 1)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Delivery settings"
        title="SMTP accounts"
        description="Configure and verify an email provider. Passwords are encrypted by the operating system and never returned to the renderer."
        actions={
          canManage && (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              type="button"
              onClick={() => setEditing(null)}
            >
              + Add SMTP account
            </button>
          )
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Loading SMTP accounts…
          </p>
        ) : accounts.length ? (
          <div className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <article
                className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                key={account.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">
                      {account.name}
                    </h2>
                    {account.isDefault && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        Default
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {account.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {account.senderName} &lt;{account.senderEmail}&gt;
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {account.host}:{account.port} ·{' '}
                    {encryptionLabel(account.encryption)} · {account.username}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      Connection:{' '}
                      <span
                        className={
                          account.connectionStatus === 'connected'
                            ? 'font-medium text-emerald-700'
                            : account.connectionStatus === 'failed'
                              ? 'font-medium text-rose-700'
                              : 'font-medium text-slate-600'
                        }
                      >
                        {account.connectionStatus}
                      </span>
                    </span>
                    {account.lastTestedAt && (
                      <span>
                        Last checked{' '}
                        {new Date(account.lastTestedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    type="button"
                    onClick={() => testConnection(account)}
                    disabled={testingId === account.id}
                  >
                    {testingId === account.id ? 'Testing…' : 'Test connection'}
                  </button>
                  {canManage && (
                    <>
                      {!account.isDefault && account.isEnabled && (
                        <button
                          className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          type="button"
                          onClick={() => setDefault(account)}
                        >
                          Set default
                        </button>
                      )}
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        type="button"
                        onClick={() => setEditing(account)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        type="button"
                        onClick={() => deleteAccount(account)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-xl text-indigo-600">
              ✉
            </div>
            <h2 className="mt-4 font-semibold text-slate-900">
              No SMTP accounts yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Add your organization’s SMTP account to verify a connection.
              Credentials are stored securely on this device.
            </p>
            {canManage && (
              <button
                className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                type="button"
                onClick={() => setEditing(null)}
              >
                Configure SMTP
              </button>
            )}
          </div>
        )}
      </section>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>Provider limits:</strong> Use your SMTP provider’s published
        sending limits and approved sender identities. Testing verifies a
        connection only; it does not send an email.
      </aside>

      {editing !== undefined && canManage && (
        <SmtpAccountForm
          account={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            showToast(
              editing ? 'SMTP account updated.' : 'SMTP account saved.',
            );
            setReload((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

function SmtpAccountForm({ account, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...emptyAccount,
    ...(account
      ? {
          name: account.name,
          host: account.host,
          port: String(account.port),
          encryption: account.encryption,
          username: account.username,
          senderName: account.senderName,
          senderEmail: account.senderEmail,
          replyToEmail: account.replyToEmail,
          isEnabled: account.isEnabled,
          isDefault: account.isDefault,
        }
      : {}),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const input = {
        ...form,
        port: Number(form.port),
      };
      const result = account
        ? await window.bulkMail.smtpAccounts.update(account.id, input)
        : await window.bulkMail.smtpAccounts.create(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this SMTP account.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  return (
    <Modal
      title={account ? 'Edit SMTP account' : 'Add SMTP account'}
      eyebrow="Email delivery"
      onClose={onClose}
      size="max-w-2xl"
    >
      <form className="mt-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Account name
            <input
              className={inputClass}
              name="name"
              maxLength={100}
              required
              value={form.name}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            SMTP host
            <input
              className={inputClass}
              name="host"
              maxLength={255}
              required
              placeholder="smtp.example.com"
              value={form.host}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Port
            <input
              className={inputClass}
              name="port"
              type="number"
              min="1"
              max="65535"
              required
              value={form.port}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Encryption
            <select
              className={`${inputClass} bg-white`}
              name="encryption"
              value={form.encryption}
              onChange={update}
            >
              <option value="starttls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="none">None (not recommended)</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            SMTP username
            <input
              className={inputClass}
              name="username"
              maxLength={254}
              required
              autoComplete="username"
              value={form.username}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {account
              ? 'Replace password (optional)'
              : 'Password / app password'}
            <input
              className={inputClass}
              name="password"
              type="password"
              maxLength={1024}
              required={!account}
              autoComplete="new-password"
              placeholder={
                account ? 'Leave blank to keep the saved password' : ''
              }
              value={form.password}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sender name
            <input
              className={inputClass}
              name="senderName"
              maxLength={150}
              required
              value={form.senderName}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sender email
            <input
              className={inputClass}
              name="senderEmail"
              type="email"
              maxLength={254}
              required
              value={form.senderEmail}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Reply-to email{' '}
            <span className="font-normal text-slate-400">(optional)</span>
            <input
              className={inputClass}
              name="replyToEmail"
              type="email"
              maxLength={254}
              value={form.replyToEmail}
              onChange={update}
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isEnabled"
              checked={form.isEnabled}
              onChange={update}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isDefault"
              checked={form.isDefault}
              onChange={update}
              disabled={!form.isEnabled}
            />
            Set as default account
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The password is encrypted by Windows/macOS secure storage before it is
          written to SQLite. It is never sent back to this form.
        </p>
        <p className="mt-3 min-h-5 text-sm text-rose-600" role="alert">
          {error}
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving…' : account ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function encryptionLabel(encryption) {
  return {
    ssl: 'SSL/TLS',
    starttls: 'STARTTLS',
    none: 'No encryption',
  }[encryption];
}
