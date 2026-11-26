import { useEffect, useState } from 'react';
import { ErrorPanel, Modal, PageHeading, useToast } from './ui.jsx';

const memberPageSize = 50;

export default function ContactLists({ canEdit, initialAction }) {
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editingList, setEditingList] = useState(undefined);
  const [memberList, setMemberList] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [appliedMemberSearch, setAppliedMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [memberContacts, setMemberContacts] = useState([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.bulkMail.contactLists
      .list(appliedSearch)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setLists(result.lists);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load contact lists.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedSearch, reload]);

  useEffect(() => {
    if (initialAction === 'create' && canEdit) setEditingList(null);
  }, [initialAction, canEdit]);

  useEffect(() => {
    if (!memberList) return undefined;
    let active = true;
    setMemberLoading(true);
    setMemberError('');
    window.bulkMail.contacts
      .list({
        search: appliedMemberSearch,
        page: memberPage,
        pageSize: memberPageSize,
      })
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setMemberContacts(result.contacts);
          setMemberTotal(result.total);
        }
      })
      .catch((cause) => {
        if (active) {
          setMemberError(
            cause instanceof Error ? cause.message : 'Could not load contacts.',
          );
        }
      })
      .finally(() => {
        if (active) setMemberLoading(false);
      });
    return () => {
      active = false;
    };
  }, [memberList, appliedMemberSearch, memberPage]);

  async function openMembers(list) {
    try {
      const result = await window.bulkMail.contactLists.getMembers(list.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      setSelectedIds(new Set(result.contacts.map((contact) => contact.id)));
      setMemberSearch('');
      setAppliedMemberSearch('');
      setMemberPage(1);
      setMemberError('');
      setMemberList(list);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not load list members.',
        'error',
      );
    }
  }

  async function deleteList(list) {
    if (!window.confirm(`Delete "${list.name}"? Contacts will remain saved.`)) {
      return;
    }
    try {
      const result = await window.bulkMail.contactLists.delete(list.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Contact list deleted.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not delete this list.',
        'error',
      );
    }
  }

  async function saveMembers() {
    if (!memberList || !canEdit) return;
    try {
      const result = await window.bulkMail.contactLists.replaceMembers(
        memberList.id,
        [...selectedIds],
      );
      if (!result.ok) {
        setMemberError(result.error);
        return;
      }
      setMemberList(null);
      showToast(`${result.memberCount} contacts saved to the list.`);
      setReload((value) => value + 1);
    } catch (cause) {
      setMemberError(
        cause instanceof Error ? cause.message : 'Could not save list members.',
      );
    }
  }

  function applyListSearch(event) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  function applyMemberSearch(event) {
    event.preventDefault();
    setAppliedMemberSearch(memberSearch.trim());
    setMemberPage(1);
  }

  function toggleMember(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error && !lists.length) {
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
        title="Contact lists"
        description="A contact can belong to multiple lists; each list prevents duplicate membership."
        actions={
          canEdit && (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              type="button"
              onClick={() => setEditingList(null)}
            >
              + Create list
            </button>
          )
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"
          onSubmit={applyListSearch}
        >
          <label className="min-w-[220px] flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search lists
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              placeholder="List name or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="submit"
          >
            Search
          </button>
        </form>

        {error && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">List</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Subscribed</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-slate-500"
                    colSpan="5"
                  >
                    Loading contact lists…
                  </td>
                </tr>
              ) : lists.length ? (
                lists.map((list) => (
                  <tr
                    className="border-t border-slate-100 hover:bg-slate-50/70"
                    key={list.id}
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">{list.name}</p>
                      <p className="mt-1 max-w-md truncate text-xs text-slate-500">
                        {list.description || 'No description'}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {list.contactCount}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-medium text-emerald-700">
                        {list.subscribedCount}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">
                        eligible subscriber records
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {new Date(list.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                          type="button"
                          onClick={() => openMembers(list)}
                        >
                          Manage members
                        </button>
                        {canEdit && (
                          <>
                            <button
                              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              type="button"
                              onClick={() => setEditingList(list)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              type="button"
                              onClick={() => deleteList(list)}
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
                    colSpan="5"
                  >
                    <p className="font-medium text-slate-700">
                      No contact lists found
                    </p>
                    <p className="mt-1">
                      Create a list to organize contacts into audiences.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingList !== undefined && canEdit && (
        <ListEditor
          list={editingList}
          onClose={() => setEditingList(undefined)}
          onSaved={() => {
            setEditingList(undefined);
            showToast(
              editingList ? 'Contact list updated.' : 'Contact list created.',
            );
            setReload((value) => value + 1);
          }}
        />
      )}

      {memberList && (
        <Modal
          title={`Manage ${memberList.name}`}
          eyebrow="Contact list"
          onClose={() => setMemberList(null)}
          size="max-w-3xl"
        >
          <p className="mt-1 text-sm text-slate-500">
            {canEdit
              ? `${selectedIds.size} selected contacts`
              : `${selectedIds.size} list members`}
          </p>
          <form className="mt-5 flex gap-2" onSubmit={applyMemberSearch}>
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              placeholder="Search contacts by name, email or company"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
            />
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="submit"
            >
              Search
            </button>
          </form>
          {memberError && (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              {memberError}
            </p>
          )}
          <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200">
            {memberLoading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Loading contacts…
              </p>
            ) : memberContacts.length ? (
              memberContacts.map((contact) => (
                <label
                  className={`flex items-center gap-3 border-t border-slate-100 px-4 py-3 ${canEdit ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  key={contact.id}
                >
                  {canEdit && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleMember(contact.id)}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {contact.fullName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {contact.email}
                    </span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {contact.subscriptionStatus}
                  </span>
                </label>
              ))
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No contacts match this search.
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {memberTotal} matching contacts · page {memberPage} of{' '}
              {Math.max(1, Math.ceil(memberTotal / memberPageSize))}
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"
                type="button"
                disabled={memberPage <= 1 || memberLoading}
                onClick={() => setMemberPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                className="rounded-md border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"
                type="button"
                disabled={
                  memberPage * memberPageSize >= memberTotal || memberLoading
                }
                onClick={() => setMemberPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => setMemberList(null)}
            >
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                type="button"
                disabled={memberLoading}
                onClick={saveMembers}
              >
                Save members
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ListEditor({ list, onClose, onSaved }) {
  const [name, setName] = useState(list?.name || '');
  const [description, setDescription] = useState(list?.description || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const data = { name, description };
      const result = list
        ? await window.bulkMail.contactLists.update(list.id, data)
        : await window.bulkMail.contactLists.create(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this list.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  return (
    <Modal
      title={list ? 'Rename list' : 'Create contact list'}
      eyebrow="Audience group"
      onClose={onClose}
      size="max-w-lg"
    >
      <form className="mt-5" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          List name
          <input
            className={inputClass}
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Description{' '}
          <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={inputClass}
            rows={3}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
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
            {busy ? 'Saving…' : list ? 'Save list' : 'Create list'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
