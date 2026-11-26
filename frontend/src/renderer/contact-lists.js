import { escapeHtml, showToast } from './ui.js';

function listForm(list = null) {
  return `
    <form id="list-form" class="p-6 sm:p-8">
      <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-indigo-600">Audience group</p><h2 class="mt-1 text-xl font-semibold">${list ? 'Rename list' : 'Create contact list'}</h2></div><button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" type="button" data-close-list aria-label="Close">✕</button></div>
      <label class="mt-6 block text-sm font-medium text-slate-700">List name<input name="name" required maxlength="100" value="${escapeHtml(list?.name || '')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
      <label class="mt-4 block text-sm font-medium text-slate-700">Description <span class="font-normal text-slate-400">(optional)</span><textarea name="description" rows="3" maxlength="500" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">${escapeHtml(list?.description || '')}</textarea></label>
      <p id="list-form-error" class="mt-3 min-h-5 text-sm text-rose-600" role="alert"></p>
      <div class="mt-4 flex justify-end gap-3"><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-close-list>Cancel</button><button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500" type="submit">${list ? 'Save list' : 'Create list'}</button></div>
    </form>
  `;
}

export async function renderContactListsPage(
  root,
  api,
  { canEdit, initialAction },
) {
  let search = '';
  let lists = [];

  async function render() {
    const result = await api.contactLists.list(search);
    if (!result.ok) throw new Error(result.error);
    lists = result.lists;

    const rows = lists.length
      ? lists
          .map(
            (list) => `
              <tr class="border-t border-slate-100 hover:bg-slate-50/70">
                <td class="px-4 py-4"><p class="font-medium text-slate-900">${escapeHtml(list.name)}</p><p class="mt-1 max-w-md truncate text-xs text-slate-500">${escapeHtml(list.description || 'No description')}</p></td>
                <td class="px-4 py-4 text-slate-700">${list.contactCount}</td>
                <td class="px-4 py-4"><span class="font-medium text-emerald-700">${list.subscribedCount}</span><span class="ml-1 text-xs text-slate-400">eligible subscriber records</span></td>
                <td class="px-4 py-4 text-sm text-slate-500">${escapeHtml(new Date(list.updatedAt).toLocaleDateString())}</td>
                <td class="px-4 py-4"><div class="flex flex-wrap justify-end gap-2"><button class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50" type="button" data-manage-members="${escapeHtml(list.id)}">Manage members</button>${canEdit ? `<button class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" type="button" data-edit-list="${escapeHtml(list.id)}">Edit</button><button class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50" type="button" data-delete-list="${escapeHtml(list.id)}">Delete</button>` : ''}</div></td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td class="px-4 py-14 text-center text-sm text-slate-500" colspan="5"><p class="font-medium text-slate-700">No contact lists found</p><p class="mt-1">Create a list to organize contacts into audiences.</p></td></tr>`;

    root.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div><p class="text-sm font-medium text-indigo-600">Audience</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Contact lists</h1><p class="mt-1 text-sm text-slate-500">A contact can belong to multiple lists; each list prevents duplicate membership.</p></div>
          ${canEdit ? '<button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500" type="button" data-create-list>+ Create list</button>' : ''}
        </div>
        <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <form id="list-search" class="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4"><label class="min-w-[220px] flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Search lists<input name="search" value="${escapeHtml(search)}" placeholder="List name or description" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label><button class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Search</button></form>
          <div class="overflow-x-auto"><table class="w-full min-w-[760px] text-left text-sm"><thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-3">List</th><th class="px-4 py-3">Contacts</th><th class="px-4 py-3">Subscribed</th><th class="px-4 py-3">Updated</th><th class="px-4 py-3 text-right">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
        </section>
        ${canEdit ? '<dialog id="list-modal" class="w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"></dialog>' : ''}
        <dialog id="members-modal" class="w-[min(48rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"></dialog>
      </div>
    `;

    bindEvents();
    if (initialAction === 'create' && canEdit) openListForm();
  }

  function openListForm(list = null) {
    const modal = root.querySelector('#list-modal');
    modal.innerHTML = listForm(list);
    modal.querySelectorAll('[data-close-list]').forEach((button) => {
      button.addEventListener('click', () => modal.close());
    });
    modal
      .querySelector('#list-form')
      .addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const input = Object.fromEntries(new FormData(form).entries());
        try {
          const result = list
            ? await api.contactLists.update(list.id, input)
            : await api.contactLists.create(input);
          if (!result.ok) {
            form.querySelector('#list-form-error').textContent = result.error;
            return;
          }
          modal.close();
          showToast(
            root,
            list ? 'Contact list updated.' : 'Contact list created.',
          );
          await render();
        } catch (error) {
          form.querySelector('#list-form-error').textContent =
            error instanceof Error
              ? error.message
              : 'Could not save this list.';
        }
      });
    modal.showModal();
  }

  async function openMembers(list) {
    const membersResult = await api.contactLists.getMembers(list.id);
    if (!membersResult.ok) {
      showToast(root, membersResult.error, 'error');
      return;
    }

    const selectedIds = new Set(
      membersResult.contacts.map((contact) => contact.id),
    );
    const modal = root.querySelector('#members-modal');
    let memberSearch = '';
    let page = 1;
    let total = 0;

    async function renderChoices() {
      const result = await api.contacts.list({
        search: memberSearch,
        page,
        pageSize: 50,
      });
      if (!result.ok) throw new Error(result.error);
      total = result.total;
      const rows = result.contacts.length
        ? result.contacts
            .map(
              (contact) => `
                <label class="flex ${canEdit ? 'cursor-pointer hover:bg-slate-50' : ''} items-center gap-3 border-t border-slate-100 px-4 py-3">
                  ${canEdit ? `<input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-member-id="${escapeHtml(contact.id)}" ${selectedIds.has(contact.id) ? 'checked' : ''} />` : ''}
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-slate-800">${escapeHtml(contact.fullName)}</span><span class="block truncate text-xs text-slate-500">${escapeHtml(contact.email)}</span></span>
                  ${statusBadgeText(contact.subscriptionStatus)}
                </label>
              `,
            )
            .join('')
        : '<p class="px-4 py-8 text-center text-sm text-slate-500">No contacts match this search.</p>';

      modal.innerHTML = `
        <div class="p-6 sm:p-8">
          <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-indigo-600">Contact list</p><h2 class="mt-1 text-xl font-semibold">Manage ${escapeHtml(list.name)}</h2><p class="mt-1 text-sm text-slate-500">${selectedIds.size} selected contacts</p></div><button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" type="button" data-close-members aria-label="Close">✕</button></div>
          <form id="member-search" class="mt-5 flex gap-2"><input name="search" value="${escapeHtml(memberSearch)}" placeholder="Search contacts by name, email or company" class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /><button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Search</button></form>
          <div class="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200">${rows}</div>
          <div class="mt-3 flex items-center justify-between text-xs text-slate-500"><span>${total} matching contacts · page ${page} of ${Math.max(1, Math.ceil(total / 50))}</span><div class="flex gap-2"><button type="button" class="rounded-md border border-slate-200 px-2.5 py-1.5 disabled:opacity-40" data-member-page="previous" ${page <= 1 ? 'disabled' : ''}>Previous</button><button type="button" class="rounded-md border border-slate-200 px-2.5 py-1.5 disabled:opacity-40" data-member-page="next" ${page * 50 >= total ? 'disabled' : ''}>Next</button></div></div>
          <p id="member-error" class="mt-2 min-h-5 text-sm text-rose-600" role="alert"></p>
          <div class="mt-4 flex justify-end gap-3"><button type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" data-close-members>${canEdit ? 'Cancel' : 'Close'}</button>${canEdit ? '<button type="button" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500" data-save-members>Save members</button>' : ''}</div>
        </div>
      `;

      modal.querySelectorAll('[data-close-members]').forEach((button) => {
        button.addEventListener('click', () => modal.close());
      });
      modal
        .querySelector('#member-search')
        .addEventListener('submit', async (event) => {
          event.preventDefault();
          memberSearch = new FormData(event.currentTarget).get('search').trim();
          page = 1;
          await renderChoices();
        });
      modal.querySelectorAll('[data-member-id]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedIds.add(checkbox.dataset.memberId);
          else selectedIds.delete(checkbox.dataset.memberId);
          const count = modal.querySelector('h2 + p');
          count.textContent = `${selectedIds.size} selected contacts`;
        });
      });
      modal.querySelectorAll('[data-member-page]').forEach((button) => {
        button.addEventListener('click', async () => {
          page += button.dataset.memberPage === 'next' ? 1 : -1;
          await renderChoices();
        });
      });
      modal
        .querySelector('[data-save-members]')
        ?.addEventListener('click', async () => {
          const result = await api.contactLists.replaceMembers(list.id, [
            ...selectedIds,
          ]);
          if (!result.ok) {
            modal.querySelector('#member-error').textContent = result.error;
            return;
          }
          modal.close();
          showToast(root, `${result.memberCount} contacts saved to the list.`);
          await render();
        });
    }

    await renderChoices();
    modal.showModal();
  }

  function bindEvents() {
    root.querySelector('[data-create-list]')?.addEventListener('click', () => {
      openListForm();
    });
    root
      .querySelector('#list-search')
      .addEventListener('submit', async (event) => {
        event.preventDefault();
        search = new FormData(event.currentTarget).get('search').trim();
        await render();
      });
    root.querySelectorAll('[data-edit-list]').forEach((button) => {
      button.addEventListener('click', () => {
        const list = lists.find((item) => item.id === button.dataset.editList);
        if (list) openListForm(list);
      });
    });
    root.querySelectorAll('[data-delete-list]').forEach((button) => {
      button.addEventListener('click', async () => {
        const list = lists.find(
          (item) => item.id === button.dataset.deleteList,
        );
        if (
          !list ||
          !window.confirm(`Delete "${list.name}"? Contacts will remain saved.`)
        )
          return;
        const result = await api.contactLists.delete(list.id);
        if (!result.ok) {
          showToast(root, result.error, 'error');
          return;
        }
        showToast(root, 'Contact list deleted.');
        await render();
      });
    });
    root.querySelectorAll('[data-manage-members]').forEach((button) => {
      button.addEventListener('click', async () => {
        const list = lists.find(
          (item) => item.id === button.dataset.manageMembers,
        );
        if (list) await openMembers(list);
      });
    });
  }

  await render();
}

function statusBadgeText(status) {
  const label = status ? status[0].toUpperCase() + status.slice(1) : 'Unknown';
  return `<span class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">${escapeHtml(label)}</span>`;
}
