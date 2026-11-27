import { useEffect, useMemo, useState } from 'react';
import {
  ErrorPanel,
  Modal,
  PageHeading,
  StatusBadge,
  useToast,
  formatDate,
} from './ui.jsx';
import { Action, ErrorText, Field } from './workspace-ui.jsx';

const pageSize = 50;
const statusOptions = [
  ['pending', 'Pending consent'],
  ['subscribed', 'Subscribed'],
  ['unsubscribed', 'Unsubscribed'],
  ['bounced', 'Bounced'],
  ['blocked', 'Blocked'],
];
const importFields = [
  ['fullName', 'Full Name'],
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['email', 'Email'],
  ['company', 'Company'],
  ['phone', 'Phone'],
  ['country', 'Country'],
  ['city', 'City'],
  ['category', 'Category'],
  ['tags', 'Tags'],
  ['address', 'Address'],
  ['source', 'Contact Source'],
  ['customFields', 'Custom Fields (JSON)'],
  ['consentSource', 'Consent Source'],
  ['consentAt', 'Consent Date'],
  ['consentEvidence', 'Consent Evidence'],
];

export default function Contacts({ canEdit, initialAction }) {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialAction?.search || '');
  const [appliedSearch, setAppliedSearch] = useState(
    initialAction?.search || '',
  );
  const [listId, setListId] = useState(initialAction?.listId || '');
  const [lists, setLists] = useState([]);
  const [transfer, setTransfer] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [status, setStatus] = useState('all');
  const [appliedStatus, setAppliedStatus] = useState('all');
  const [sortBy, setSortBy] = useState('added');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [contactToEdit, setContactToEdit] = useState(null);
  const [details, setDetails] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.bulkMail.contacts
      .list({
        search: appliedSearch,
        status: appliedStatus,
        sortBy,
        sortOrder,
        page,
        pageSize,
        listId,
      })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setContacts(result.contacts);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : 'Could not load contacts.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedSearch, appliedStatus, sortBy, sortOrder, page, reload, listId]);

  useEffect(() => {
    let active = true;
    window.bulkMail.contactLists
      .list('')
      .then((result) => {
        if (active && result.ok) setLists(result.lists);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    if (initialAction === 'add') setContactToEdit({});
    if (initialAction === 'import' || initialAction?.import)
      setShowImport(true);
  }, [canEdit, initialAction]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const allPageSelected = useMemo(
    () =>
      contacts.length > 0 && contacts.every((item) => selectedIds.has(item.id)),
    [contacts, selectedIds],
  );

  function applyFilters(event) {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setAppliedStatus(status);
    setPage(1);
  }

  function toggleSort(key) {
    setPage(1);
    if (sortBy === key) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  }

  function toggleContact(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      contacts.forEach((contact) => {
        if (checked) next.add(contact.id);
        else next.delete(contact.id);
      });
      return next;
    });
  }

  async function exportContacts() {
    try {
      const result = await window.bulkMail.contacts.exportCsv({
        search: appliedSearch,
        status: appliedStatus,
        listId,
      });
      if (result.cancelled) return;
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`${result.count} contacts exported.`);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Export failed.',
        'error',
      );
    }
  }

  async function deleteContact(contact) {
    if (!window.confirm(`Delete ${contact.fullName}?`)) return;
    try {
      const result = await window.bulkMail.contacts.delete(contact.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(contact.id);
        return next;
      });
      showToast('Contact deleted.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Delete failed.',
        'error',
      );
    }
  }

  async function bulkDelete() {
    if (
      !selectedIds.size ||
      !window.confirm(`Delete ${selectedIds.size} selected contacts?`)
    ) {
      return;
    }
    try {
      const result = await window.bulkMail.contacts.bulkDelete([
        ...selectedIds,
      ]);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setSelectedIds(new Set());
      showToast(`${result.deleted} contacts deleted.`);
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Bulk delete failed.',
        'error',
      );
    }
  }

  async function bulkTag() {
    const tags = window.prompt('Enter tags separated by commas:');
    if (!tags?.trim()) return;
    try {
      const result = await window.bulkMail.contacts.bulkAssignTags(
        [...selectedIds],
        tags,
      );
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`Tags assigned to ${result.updated} contacts.`);
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Tag assignment failed.',
        'error',
      );
    }
  }

  async function viewContact(id) {
    try {
      const result = await window.bulkMail.contacts.get(id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setDetails(result.contact);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not load contact.',
        'error',
      );
    }
  }

  if (error && !contacts.length) {
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
        eyebrow="Audience"
        title="Contacts"
        description={`${total} saved contacts`}
        actions={
          <>
            {canEdit && (
              <>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => setShowImport(true)}
                >
                  Import contacts
                </button>
                <button
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  type="button"
                  onClick={() => setContactToEdit({})}
                >
                  + Add contact
                </button>
              </>
            )}
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={exportContacts}
            >
              Export CSV
            </button>
          </>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"
          onSubmit={applyFilters}
        >
          <label className="min-w-[220px] flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search contacts
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              placeholder="Name, email, company or city"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Subscription
            <select
              className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Field label="Contact list">
            <select
              value={listId}
              onChange={(event) => {
                setListId(event.target.value);
                setPage(1);
                setSelectedIds(new Set());
              }}
            >
              <option value="">All lists</option>
              {lists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="submit"
          >
            Apply filters
          </button>
        </form>

        {canEdit && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-indigo-50/60 px-4 py-3">
            <span className="text-sm font-medium text-indigo-900">
              {selectedIds.size} selected
            </span>
            <Action onClick={() => setTransfer(true)} disabled={!lists.length}>
              {listId ? 'Copy or move to list' : 'Copy to list'}
            </Action>
            <Field label="Update subscription status">
              <select
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value)}
              >
                <option value="">Select status</option>
                {statusOptions
                  .filter(([state]) => state !== 'bounced')
                  .map(([state, label]) => (
                    <option key={state} value={state}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            <Action
              disabled={!bulkStatus}
              onClick={async () => {
                if (
                  !window.confirm(
                    'Update the subscription status for ' +
                      selectedIds.size +
                      ' contacts?',
                  )
                )
                  return;
                try {
                  const result = await window.bulkMail.contacts.bulkStatus({
                    ids: [...selectedIds],
                    status: bulkStatus,
                  });
                  if (!result.ok) throw new Error(result.error);
                  showToast(
                    result.changed +
                      ' updated · ' +
                      result.skipped +
                      ' ineligible or missing.',
                  );
                  setSelectedIds(new Set());
                  setBulkStatus('');
                  setReload((value) => value + 1);
                } catch (cause) {
                  showToast(cause.message, 'error');
                }
              }}
            >
              Update selected
            </Action>
            <button
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
              type="button"
              onClick={bulkTag}
            >
              Assign tags
            </button>
            <button
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
              type="button"
              onClick={bulkDelete}
            >
              Delete selected
            </button>
          </div>
        )}

        {error && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {canEdit && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select page"
                      checked={allPageSelected}
                      onChange={(event) =>
                        togglePageSelection(event.target.checked)
                      }
                    />
                  </th>
                )}
                <SortHeader
                  label="Name / email"
                  value="name"
                  active={sortBy === 'name'}
                  direction={sortOrder}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Company"
                  value="company"
                  active={sortBy === 'company'}
                  direction={sortOrder}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3">Location</th>
                <SortHeader
                  label="Status"
                  value="status"
                  active={sortBy === 'status'}
                  direction={sortOrder}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-slate-500"
                    colSpan={canEdit ? 7 : 6}
                  >
                    Loading contacts…
                  </td>
                </tr>
              ) : contacts.length ? (
                contacts.map((contact) => (
                  <tr
                    className="border-t border-slate-100 hover:bg-slate-50/70"
                    key={contact.id}
                  >
                    {canEdit && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedIds.has(contact.id)}
                          aria-label={`Select ${contact.fullName}`}
                          onChange={() => toggleContact(contact.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {contact.fullName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {contact.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.company || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.city || contact.country || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={contact.subscriptionStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.length ? (
                          contact.tags.map((tag) => (
                            <span
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                          type="button"
                          onClick={() => viewContact(contact.id)}
                        >
                          View
                        </button>
                        {canEdit && (
                          <>
                            <button
                              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              type="button"
                              onClick={() => setContactToEdit(contact)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              type="button"
                              onClick={() => deleteContact(contact)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-14 text-center text-sm text-slate-500"
                    colSpan={canEdit ? 7 : 6}
                  >
                    <p className="font-medium text-slate-700">
                      No contacts found
                    </p>
                    <p className="mt-1">
                      Try another search or add your first contact.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
              type="button"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {contactToEdit && canEdit && (
        <ContactEditor
          contact={contactToEdit.id ? contactToEdit : null}
          onClose={() => setContactToEdit(null)}
          onSaved={() => {
            setContactToEdit(null);
            showToast(contactToEdit.id ? 'Contact updated.' : 'Contact added.');
            setReload((value) => value + 1);
          }}
        />
      )}
      {details && (
        <ContactDetails contact={details} onClose={() => setDetails(null)} />
      )}
      {showImport && canEdit && (
        <ImportContacts
          listId={listId}
          onClose={() => setShowImport(false)}
          onImported={(report) => {
            showToast(
              `Import: ${report.imported} added, ${report.duplicates} duplicates, ${report.invalid} invalid, ${report.suppressed} suppressed.`,
            );
            setReload((value) => value + 1);
          }}
        />
      )}
      {transfer && (
        <TransferContacts
          ids={[...selectedIds]}
          source={listId}
          lists={lists}
          onClose={() => setTransfer(false)}
          onSaved={() => {
            setTransfer(false);
            setSelectedIds(new Set());
            setReload(reload + 1);
            showToast('List membership updated.');
          }}
        />
      )}
    </div>
  );
}

function TransferContacts({ ids, source, lists, onClose, onSaved }) {
  const [destination, setDestination] = useState('');
  const [move, setMove] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Transfer contacts" onClose={onClose}>
      <form
        className="studio-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          setBusy(true);
          try {
            const result = await window.bulkMail.contactLists.transfer({
              ids,
              destination,
              source,
              move,
            });
            if (!result.ok) throw new Error(result.error);
            onSaved();
          } catch (cause) {
            setError(cause.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Destination list">
          <select
            required
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">Select a list</option>
            {lists
              .filter((row) => row.id !== source)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </Field>
        {source && (
          <label className="studio-check">
            <input
              type="checkbox"
              checked={move}
              onChange={(event) => setMove(event.target.checked)}
            />
            Remove from the current list after copying
          </label>
        )}
        <ErrorText text={error} />
        <div className="studio-actions studio-wide">
          <Action primary type="submit" disabled={busy}>
            {move ? 'Move' : 'Copy'} {ids.length} contacts
          </Action>
        </div>
      </form>
    </Modal>
  );
}

function SortHeader({ label, value, active, direction, onSort }) {
  return (
    <th className="px-4 py-3">
      <button
        className="font-semibold hover:text-slate-800"
        type="button"
        onClick={() => onSort(value)}
      >
        {label}
        {active && (
          <span className="ml-1">{direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
    </th>
  );
}

function ContactEditor({ contact, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    fullName: contact?.fullName || '',
    email: contact?.email || '',
    company: contact?.company || '',
    phone: contact?.phone || '',
    country: contact?.country || '',
    city: contact?.city || '',
    category: contact?.category || '',
    source: contact?.source || '',
    address: contact?.address || '',
    consentEvidence: contact?.consentEvidence || '',
    customFields: contact?.customFields
      ? JSON.stringify(contact.customFields)
      : '',
    tags: contact?.tags || [],
    subscriptionStatus: contact?.subscriptionStatus || 'pending',
    consentSource: contact?.consentSource || '',
    consentAt: contact?.consentAt
      ? new Date(contact.consentAt).toISOString().slice(0, 10)
      : '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const result = contact
        ? await window.bulkMail.contacts.update(contact.id, form)
        : await window.bulkMail.contacts.create(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save contact.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  return (
    <Modal
      title={contact ? 'Edit contact' : 'Add contact'}
      eyebrow="Contact record"
      onClose={onClose}
      size="max-w-2xl"
    >
      <form className="mt-6" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Name
            <input
              className={inputClass}
              name="fullName"
              maxLength={150}
              required
              value={form.fullName}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email address
            <input
              className={inputClass}
              name="email"
              type="email"
              maxLength={254}
              required
              placeholder="name@example.com"
              value={form.email}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Company name
            <input
              className={inputClass}
              name="company"
              maxLength={150}
              required
              value={form.company}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone number
            <input
              className={inputClass}
              name="phone"
              type="tel"
              maxLength={50}
              required
              value={form.phone}
              onChange={update}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          New contacts default to Pending consent. Subscription and consent
          records are preserved when editing a contact.
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
            {busy ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ContactDetails({ contact, onClose }) {
  const details = [
    ['Email', contact.email],
    ['First name', contact.firstName],
    ['Last name', contact.lastName],
    ['Company', contact.company],
    ['Phone', contact.phone],
    ['Country', contact.country],
    ['City', contact.city],
    ['Category', contact.category],
    ['Contact source', contact.source],
    ['Address', contact.address],
    [
      'Custom fields',
      Object.entries(contact.customFields || {})
        .map(([key, value]) => key + ' = ' + value)
        .join(', '),
    ],
    ['Tags', contact.tags.join(', ')],
    ['Status', contact.subscriptionStatus],
    ['Consent source', contact.consentSource],
    ['Consent evidence', contact.consentEvidence],
    ['Consent recorded', formatDate(contact.consentAt)],
    ['Date added', formatDate(contact.createdAt)],
    ['Last updated', formatDate(contact.updatedAt)],
  ];

  return (
    <Modal
      title={contact.fullName}
      eyebrow="Contact details"
      onClose={onClose}
      size="max-w-xl"
    >
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </dt>
            <dd className="mt-1 break-words text-sm text-slate-800">
              {value || '—'}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-7 flex justify-end">
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function ImportContacts({ onClose, onImported, listId }) {
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileData, setFileData] = useState(null);
  const [manual, setManual] = useState('');
  const [summary, setSummary] = useState(null);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    await chooseInput({
      fileName: file.name,
      fileData: new Uint8Array(await file.arrayBuffer()),
    });
  }

  async function chooseInput(input) {
    setPreview(null);
    setFileData(null);
    setMapping({});
    setSummary(null);

    setBusy(true);
    setMessage('Reading file and checking its columns…');
    try {
      const result = await window.bulkMail.contacts.previewImport(input);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setFileData(input);
      setPreview(result);
      setMapping(
        Object.fromEntries(
          importFields.map(([field]) => [
            field,
            suggestHeader(field, result.headers),
          ]),
        ),
      );
      setMessage(`${result.filename} is ready for column mapping.`);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not read the file.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    if (!fileData || !preview) return;
    setBusy(true);
    setMessage('Validating and importing contacts…');
    try {
      const result = await window.bulkMail.contacts.import({
        ...fileData,
        mapping,
        listId,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSummary(result.report);
      setPreview(null);
      setMessage('');
      onImported(result.report);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Import contacts"
      eyebrow="CSV / Excel import"
      onClose={onClose}
      size="max-w-4xl"
    >
      <p className="mt-1 text-sm text-slate-500">
        Imported contacts are set to Pending consent until permission is
        recorded.
      </p>
      <label className="mt-5 block text-sm font-medium text-slate-700">
        Choose a CSV or XLSX file
        <input
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          type="file"
          accept=".csv,.xlsx"
          onChange={chooseFile}
        />
      </label>
      <div className="mt-4 space-y-2">
        <Field label="Or paste CSV with column headings">
          <textarea
            rows={3}
            placeholder="Full Name,Email"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
        </Field>
        <Action
          disabled={busy || !manual.trim()}
          onClick={() =>
            chooseInput({
              fileName: 'manual.csv',
              fileData: new TextEncoder().encode(manual),
            })
          }
        >
          Preview pasted CSV
        </Action>
      </div>
      <p className="mt-3 min-h-5 text-sm text-slate-500" role="status">
        {message}
      </p>
      {summary && (
        <section className="studio-card">
          <h2>Import summary</h2>
          <p>
            {summary.imported} added as pending · {summary.duplicates}{' '}
            duplicates · {summary.invalid} invalid · {summary.suppressed}{' '}
            suppressed
          </p>
          {summary.issues.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {summary.issues.map((issue) => (
                <li key={issue.row}>
                  Row {issue.row} · {issue.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {preview && (
        <>
          <p className="mt-2 text-sm font-medium text-slate-700">
            {preview.totalRows} data rows found. Preview the first{' '}
            {preview.previewRows.length}.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {importFields.map(([field, label]) => (
              <label
                className="text-xs font-semibold text-slate-600"
                key={field}
              >
                {label}
                {field === 'email' || field === 'fullName' ? ' *' : ''}
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
                  value={mapping[field] || ''}
                  onChange={(event) =>
                    setMapping({ ...mapping, [field]: event.target.value })
                  }
                >
                  <option value="">Do not map</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-max text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {preview.headers.map((header) => (
                    <th
                      className="px-3 py-2 font-semibold text-slate-500"
                      key={header}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row, index) => (
                  <tr className="border-t border-slate-100" key={index}>
                    {preview.headers.map((header) => (
                      <td
                        className="max-w-48 truncate px-3 py-2 text-slate-600"
                        key={header}
                      >
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <button
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
        <button
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!preview || busy}
          onClick={importFile}
        >
          {busy ? 'Working…' : 'Import contacts'}
        </button>
      </div>
    </Modal>
  );
}

function suggestHeader(field, headers) {
  const aliases = {
    fullName: ['fullname', 'name', 'contactname'],
    firstName: ['firstname', 'givenname'],
    lastName: ['lastname', 'surname', 'familyname'],
    email: ['email', 'emailaddress', 'emailid'],
    company: ['company', 'companyname', 'organisation', 'organization'],
    phone: ['phone', 'phonenumber', 'mobile', 'telephone'],
    country: ['country'],
    city: ['city'],
    category: ['category'],
    tags: ['tags', 'tag'],
    address: ['address', 'streetaddress'],
    source: ['source', 'contactsource'],
    customFields: ['customfields', 'customfieldsjson'],
    consentSource: ['consentsource'],
    consentAt: ['consentdate', 'consentat'],
    consentEvidence: ['consentevidence'],
  };
  return (
    headers.find((header) =>
      aliases[field].includes(header.toLowerCase().replace(/[^a-z]/g, '')),
    ) || ''
  );
}
