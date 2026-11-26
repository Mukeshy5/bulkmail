import { escapeHtml, formatDate, showToast, statusBadge } from './ui.js';

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
];

function suggestedHeader(field, headers) {
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
  };
  return (
    headers.find((header) =>
      aliases[field].includes(header.toLowerCase().replace(/[^a-z]/g, '')),
    ) || ''
  );
}

function renderContactForm(contact = null) {
  const editing = Boolean(contact);
  const value = (field) => escapeHtml(contact?.[field] ?? '');
  const status = contact?.subscriptionStatus || 'pending';
  const consentDate = contact?.consentAt
    ? new Date(contact.consentAt).toISOString().slice(0, 10)
    : '';
  const statusOptionsHtml = statusOptions
    .map(
      ([key, label]) =>
        `<option value="${key}" ${status === key ? 'selected' : ''}>${label}</option>`,
    )
    .join('');

  return `
      <form id="contact-form" class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-indigo-600">Contact record</p><h2 class="mt-1 text-xl font-semibold">${editing ? 'Edit contact' : 'Add contact'}</h2></div><button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" type="button" data-close-contact aria-label="Close">✕</button></div>
        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <label class="text-sm font-medium text-slate-700 sm:col-span-2">Full name<input name="fullName" required maxlength="150" value="${value('fullName')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">First name<input name="firstName" maxlength="75" value="${value('firstName')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Last name<input name="lastName" maxlength="75" value="${value('lastName')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700 sm:col-span-2">Email address<input name="email" type="email" required maxlength="254" value="${value('email')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Company<input name="company" maxlength="150" value="${value('company')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Phone<input name="phone" type="tel" maxlength="50" value="${value('phone')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Country<input name="country" maxlength="100" value="${value('country')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">City<input name="city" maxlength="100" value="${value('city')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Category<input name="category" maxlength="100" value="${value('category')}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700">Tags <span class="font-normal text-slate-400">(comma-separated)</span><input name="tags" value="${escapeHtml((contact?.tags || []).join(', '))}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          <label class="text-sm font-medium text-slate-700 sm:col-span-2">Subscription status<select name="subscriptionStatus" class="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">${statusOptionsHtml}</select></label>
          <div id="consent-fields" class="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <label class="text-sm font-medium text-slate-700">Consent source<input name="consentSource" maxlength="255" value="${value('consentSource')}" placeholder="e.g. Website signup form" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
            <label class="text-sm font-medium text-slate-700">Consent date<input name="consentAt" type="date" value="${consentDate}" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
          </div>
        </div>
        <p id="contact-form-error" class="mt-4 min-h-5 text-sm text-rose-600" role="alert"></p>
        <div class="mt-5 flex justify-end gap-3"><button class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-close-contact>Cancel</button><button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500" type="submit">${editing ? 'Save changes' : 'Add contact'}</button></div>
      </form>
  `;
}

function renderImportDialog() {
  return `
    <dialog id="import-modal" class="w-[min(54rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <div class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-indigo-600">CSV / Excel import</p><h2 class="mt-1 text-xl font-semibold">Import contacts</h2><p class="mt-1 text-sm text-slate-500">Imported contacts are set to Pending consent until permission is recorded.</p></div><button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" type="button" data-close-import aria-label="Close">✕</button></div>
        <label class="mt-6 block text-sm font-medium text-slate-700">Choose a CSV or XLSX file<input id="import-file" type="file" accept=".csv,.xlsx" class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" /></label>
        <p id="import-message" class="mt-3 min-h-5 text-sm text-slate-500" role="status" aria-live="polite"></p>
        <div id="import-preview" class="mt-3 max-h-[45vh] overflow-auto"></div>
        <div class="mt-5 flex justify-end gap-3"><button class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-close-import>Close</button><button id="import-submit" class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled>Import contacts</button></div>
      </div>
    </dialog>
  `;
}

export async function renderContactsPage(
  root,
  api,
  { canEdit, initialAction },
) {
  let state = {
    search: '',
    status: 'all',
    sortBy: 'added',
    sortOrder: 'desc',
    page: 1,
  };
  let selectedIds = new Set();
  let pendingImport = null;
  let importPreview = null;

  async function render() {
    const result = await api.contacts.list({
      ...state,
      pageSize: 50,
    });
    if (!result.ok) throw new Error(result.error);

    const rows = result.contacts.length
      ? result.contacts
          .map(
            (contact) => `
              <tr class="border-t border-slate-100 hover:bg-slate-50/70">
                ${
                  canEdit
                    ? `<td class="px-4 py-3"><input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-contact-select="${escapeHtml(contact.id)}" ${selectedIds.has(contact.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(contact.fullName)}" /></td>`
                    : ''
                }
                <td class="px-4 py-3"><div class="font-medium text-slate-900">${escapeHtml(contact.fullName)}</div><div class="mt-0.5 text-xs text-slate-500">${escapeHtml(contact.email)}</div></td>
                <td class="px-4 py-3 text-slate-600">${escapeHtml(contact.company || '—')}</td>
                <td class="px-4 py-3 text-slate-600">${escapeHtml(contact.city || contact.country || '—')}</td>
                <td class="px-4 py-3">${statusBadge(contact.subscriptionStatus)}</td>
                <td class="px-4 py-3"><div class="flex flex-wrap gap-1">${contact.tags.map((tag) => `<span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">${escapeHtml(tag)}</span>`).join('') || '<span class="text-slate-400">—</span>'}</div></td>
                <td class="px-4 py-3 text-right"><div class="flex justify-end gap-2"><button class="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50" type="button" data-view-contact="${escapeHtml(contact.id)}">View</button>${canEdit ? `<button class="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100" type="button" data-edit-contact="${escapeHtml(contact.id)}">Edit</button><button class="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" type="button" data-delete-contact="${escapeHtml(contact.id)}">Delete</button>` : ''}</div></td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td class="px-4 py-14 text-center text-sm text-slate-500" colspan="${canEdit ? 7 : 6}"><p class="font-medium text-slate-700">No contacts found</p><p class="mt-1">Try another search or add your first contact.</p></td></tr>`;

    root.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div><p class="text-sm font-medium text-indigo-600">Audience</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Contacts</h1><p class="mt-1 text-sm text-slate-500">${result.total} saved contacts</p></div>
          <div class="flex flex-wrap gap-2">${canEdit ? '<button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-import-contacts>Import CSV / XLSX</button><button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500" type="button" data-add-contact>+ Add contact</button>' : ''}<button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-export-contacts>Export CSV</button></div>
        </div>
        <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <form id="contact-filters" class="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
            <label class="min-w-[220px] flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Search contacts<input name="search" value="${escapeHtml(state.search)}" placeholder="Name, email, company or city" class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscription<select name="status" class="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"><option value="all" ${state.status === 'all' ? 'selected' : ''}>All statuses</option>${statusOptions.map(([value, label]) => `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Apply filters</button>
          </form>
          ${
            canEdit
              ? `<div id="bulk-actions" class="hidden items-center gap-3 border-b border-slate-100 bg-indigo-50/60 px-4 py-3"><span id="selected-count" class="text-sm font-medium text-indigo-900"></span><button class="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50" type="button" data-bulk-tag>Assign tags</button><button class="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50" type="button" data-bulk-delete>Delete selected</button></div>`
              : ''
          }
          <div class="overflow-x-auto">
            <table class="w-full min-w-[860px] text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>${canEdit ? '<th class="w-10 px-4 py-3"><input type="checkbox" data-select-page class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" aria-label="Select page" /></th>' : ''}<th class="px-4 py-3"><button class="font-semibold hover:text-slate-800" type="button" data-sort="name">Name / email</button></th><th class="px-4 py-3"><button class="font-semibold hover:text-slate-800" type="button" data-sort="company">Company</button></th><th class="px-4 py-3">Location</th><th class="px-4 py-3"><button class="font-semibold hover:text-slate-800" type="button" data-sort="status">Status</button></th><th class="px-4 py-3">Tags</th><th class="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500"><span>Page ${result.page} of ${Math.max(1, Math.ceil(result.total / result.pageSize))}</span><div class="flex gap-2"><button class="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" type="button" data-page="previous" ${result.page <= 1 ? 'disabled' : ''}>Previous</button><button class="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" type="button" data-page="next" ${result.page * result.pageSize >= result.total ? 'disabled' : ''}>Next</button></div></div>
        </section>
        ${canEdit ? `<dialog id="contact-modal" class="w-[min(42rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">${renderContactForm()}</dialog>${renderImportDialog()}` : ''}
        <dialog id="contact-details" class="w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"></dialog>
      </div>
    `;

    bindPageEvents(result.contacts);
    if (canEdit) bindImportDialog();
    if (initialAction === 'add' && canEdit) openContactForm();
    if (initialAction === 'import' && canEdit) {
      root.querySelector('#import-modal').showModal();
    }
  }

  function updateBulkSelection() {
    const toolbar = root.querySelector('#bulk-actions');
    if (!toolbar) return;
    toolbar.classList.toggle('hidden', selectedIds.size === 0);
    toolbar.classList.toggle('flex', selectedIds.size > 0);
    root.querySelector('#selected-count').textContent =
      `${selectedIds.size} selected`;
  }

  function showContactDetails(contact) {
    const dialog = root.querySelector('#contact-details');
    dialog.innerHTML = `
      <div class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-indigo-600">Contact details</p><h2 class="mt-1 text-xl font-semibold">${escapeHtml(contact.fullName)}</h2></div><button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100" type="button" data-close-details aria-label="Close">✕</button></div>
        <dl class="mt-6 grid gap-4 sm:grid-cols-2">${[
          ['Email', contact.email],
          ['First name', contact.firstName],
          ['Last name', contact.lastName],
          ['Company', contact.company],
          ['Phone', contact.phone],
          ['Country', contact.country],
          ['City', contact.city],
          ['Category', contact.category],
          ['Tags', contact.tags.join(', ')],
          ['Status', contact.subscriptionStatus],
          ['Consent source', contact.consentSource],
          ['Consent recorded', formatDate(contact.consentAt)],
          ['Date added', formatDate(contact.createdAt)],
          ['Last updated', formatDate(contact.updatedAt)],
        ]
          .map(
            ([label, value]) =>
              `<div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">${escapeHtml(label)}</dt><dd class="mt-1 break-words text-sm text-slate-800">${escapeHtml(value || '—')}</dd></div>`,
          )
          .join('')}</dl>
        <div class="mt-7 flex justify-end"><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-close-details>Close</button></div>
      </div>
    `;
    dialog.querySelectorAll('[data-close-details]').forEach((button) => {
      button.addEventListener('click', () => dialog.close());
    });
    dialog.showModal();
  }

  function updateConsentRequired() {
    const select = root.querySelector(
      '#contact-form [name="subscriptionStatus"]',
    );
    const consent = root.querySelector('#consent-fields');
    if (!select || !consent) return;
    const required = select.value === 'subscribed';
    consent.hidden = !required;
    consent.querySelector('[name="consentSource"]').required = required;
    consent.querySelector('[name="consentAt"]').required = required;
  }

  function openContactForm(contact = null) {
    const modal = root.querySelector('#contact-modal');
    modal.innerHTML = renderContactForm(contact);
    const form = modal.querySelector('#contact-form');
    if (!form) {
      showToast(root, 'Could not open the contact form.', 'error');
      return;
    }

    updateConsentRequired();
    form
      .querySelector('[name="subscriptionStatus"]')
      .addEventListener('change', updateConsentRequired);
    modal.querySelectorAll('[data-close-contact]').forEach((button) => {
      button.addEventListener('click', () => modal.close());
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const values = Object.fromEntries(new FormData(form).entries());
      try {
        const result = contact
          ? await api.contacts.update(contact.id, values)
          : await api.contacts.create(values);
        if (!result.ok) {
          form.querySelector('#contact-form-error').textContent = result.error;
          return;
        }
        modal.close();
        showToast(root, contact ? 'Contact updated.' : 'Contact added.');
        await render();
      } catch (error) {
        form.querySelector('#contact-form-error').textContent =
          error instanceof Error
            ? error.message
            : 'Could not save this contact.';
      }
    });
    modal.showModal();
  }

  function buildMappingOptions(headers, field) {
    const options = [
      '<option value="">Do not map</option>',
      ...headers.map(
        (header) =>
          `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`,
      ),
    ];
    const suggestion = suggestedHeader(field, headers);
    return `<select data-import-field="${field}" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">${options.join('')}</select>`.replace(
      `value="${escapeHtml(suggestion)}"`,
      `value="${escapeHtml(suggestion)}" selected`,
    );
  }

  function renderPreview(preview) {
    const mapping = importFields
      .map(
        ([field, label]) => `
          <label class="text-xs font-semibold text-slate-600">${label}${field === 'email' ? ' *' : ''}
            ${buildMappingOptions(preview.headers, field)}
          </label>
        `,
      )
      .join('');
    const previewRows = preview.previewRows
      .map(
        (row) =>
          `<tr class="border-t border-slate-100">${preview.headers.map((header) => `<td class="max-w-48 truncate px-3 py-2 text-slate-600">${escapeHtml(row[header])}</td>`).join('')}</tr>`,
      )
      .join('');

    root.querySelector('#import-preview').innerHTML = `
      <p class="text-sm font-medium text-slate-700">${preview.totalRows} data rows found. Preview the first ${preview.previewRows.length} before importing.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">${mapping}</div>
      <div class="mt-4 overflow-x-auto rounded-lg border border-slate-200"><table class="w-full min-w-max text-left text-xs"><thead class="bg-slate-50"><tr>${preview.headers.map((header) => `<th class="px-3 py-2 font-semibold text-slate-500">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${previewRows}</tbody></table></div>
    `;
    root.querySelector('#import-submit').disabled = false;
  }

  function bindImportDialog() {
    const modal = root.querySelector('#import-modal');
    if (!modal) return;
    const message = modal.querySelector('#import-message');
    const fileInput = modal.querySelector('#import-file');

    modal.querySelectorAll('[data-close-import]').forEach((button) => {
      button.addEventListener('click', () => modal.close());
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      pendingImport = null;
      importPreview = null;
      modal.querySelector('#import-preview').innerHTML = '';
      modal.querySelector('#import-submit').disabled = true;
      if (!file) return;

      message.textContent = 'Reading file and checking its columns…';
      try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        const input = { fileName: file.name, fileData };
        const result = await api.contacts.previewImport(input);
        if (!result.ok) {
          message.textContent = result.error;
          return;
        }
        pendingImport = input;
        importPreview = result;
        message.textContent = `${result.filename} is ready for column mapping.`;
        renderPreview(result);
      } catch (error) {
        message.textContent =
          error instanceof Error ? error.message : 'Could not read the file.';
      }
    });

    modal
      .querySelector('#import-submit')
      .addEventListener('click', async () => {
        if (!pendingImport || !importPreview) return;
        const mapping = Object.fromEntries(
          [...modal.querySelectorAll('[data-import-field]')].map((select) => [
            select.dataset.importField,
            select.value,
          ]),
        );
        const button = modal.querySelector('#import-submit');
        button.disabled = true;
        message.textContent = 'Validating and importing contacts…';
        try {
          const result = await api.contacts.import({
            ...pendingImport,
            mapping,
          });
          if (!result.ok) {
            message.textContent = result.error;
            button.disabled = false;
            return;
          }
          const report = result.report;
          await render();
          showToast(
            root,
            `Import: ${report.imported} added, ${report.duplicates} duplicates, ${report.invalid} invalid, ${report.suppressed} suppressed.`,
          );
        } catch (error) {
          message.textContent =
            error instanceof Error ? error.message : 'The import failed.';
          button.disabled = false;
        }
      });
  }

  function bindPageEvents(contacts) {
    root.querySelector('[data-add-contact]')?.addEventListener('click', () => {
      openContactForm();
    });
    root
      .querySelector('[data-import-contacts]')
      ?.addEventListener('click', () => {
        const modal = root.querySelector('#import-modal');
        modal.showModal();
      });
    root
      .querySelector('[data-export-contacts]')
      ?.addEventListener('click', async () => {
        try {
          const result = await api.contacts.exportCsv({
            search: state.search,
            status: state.status,
          });
          if (result.cancelled) return;
          if (!result.ok) {
            showToast(root, result.error, 'error');
            return;
          }
          showToast(root, `${result.count} contacts exported.`);
        } catch (error) {
          showToast(
            root,
            error instanceof Error ? error.message : 'Export failed.',
            'error',
          );
        }
      });
    root
      .querySelector('#contact-filters')
      ?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(
          new FormData(event.currentTarget).entries(),
        );
        state = {
          ...state,
          search: values.search,
          status: values.status,
          page: 1,
        };
        await render();
      });
    root.querySelectorAll('[data-sort]').forEach((button) => {
      button.addEventListener('click', async () => {
        const sortBy = button.dataset.sort;
        state = {
          ...state,
          sortBy,
          sortOrder:
            state.sortBy === sortBy && state.sortOrder === 'asc'
              ? 'desc'
              : 'asc',
          page: 1,
        };
        await render();
      });
    });
    root.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.page += button.dataset.page === 'next' ? 1 : -1;
        await render();
      });
    });
    root.querySelectorAll('[data-view-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await api.contacts.get(button.dataset.viewContact);
        if (result.ok) showContactDetails(result.contact);
        else showToast(root, result.error, 'error');
      });
    });
    root.querySelectorAll('[data-edit-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        const contact = contacts.find(
          (item) => item.id === button.dataset.editContact,
        );
        if (contact) openContactForm(contact);
      });
    });
    root.querySelectorAll('[data-delete-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const contact = contacts.find(
          (item) => item.id === button.dataset.deleteContact,
        );
        if (!contact || !window.confirm(`Delete ${contact.fullName}?`)) return;
        const result = await api.contacts.delete(contact.id);
        if (!result.ok) {
          showToast(root, result.error, 'error');
          return;
        }
        selectedIds.delete(contact.id);
        showToast(root, 'Contact deleted.');
        await render();
      });
    });

    root.querySelectorAll('[data-contact-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedIds.add(checkbox.dataset.contactSelect);
        else selectedIds.delete(checkbox.dataset.contactSelect);
        updateBulkSelection();
      });
    });
    root
      .querySelector('[data-select-page]')
      ?.addEventListener('change', (event) => {
        for (const contact of contacts) {
          if (event.currentTarget.checked) selectedIds.add(contact.id);
          else selectedIds.delete(contact.id);
        }
        root.querySelectorAll('[data-contact-select]').forEach((checkbox) => {
          checkbox.checked = event.currentTarget.checked;
        });
        updateBulkSelection();
      });
    root
      .querySelector('[data-bulk-delete]')
      ?.addEventListener('click', async () => {
        if (
          !selectedIds.size ||
          !window.confirm(`Delete ${selectedIds.size} selected contacts?`)
        )
          return;
        const result = await api.contacts.bulkDelete([...selectedIds]);
        if (!result.ok) {
          showToast(root, result.error, 'error');
          return;
        }
        selectedIds.clear();
        showToast(root, `${result.deleted} contacts deleted.`);
        await render();
      });
    root
      .querySelector('[data-bulk-tag]')
      ?.addEventListener('click', async () => {
        const input = window.prompt('Enter tags separated by commas:');
        if (!input?.trim()) return;
        const result = await api.contacts.bulkAssignTags(
          [...selectedIds],
          input,
        );
        if (!result.ok) {
          showToast(root, result.error, 'error');
          return;
        }
        showToast(root, `Tags assigned to ${result.updated} contacts.`);
        await render();
      });
    updateBulkSelection();
  }

  await render();
}
