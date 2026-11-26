import { renderContactListsPage } from './contact-lists.js';
import { renderContactsPage } from './contacts.js';
import { renderDashboard } from './dashboard.js';
import { escapeHtml, showToast } from './ui.js';

const pageTitles = {
  dashboard: 'Dashboard',
  contacts: 'Contacts',
  lists: 'Contact lists',
};

const navigation = [
  ['dashboard', 'Overview', '▦'],
  ['contacts', 'Contacts', '✉'],
  ['lists', 'Contact lists', '◫'],
];

const contactEditorRoles = new Set([
  'super_admin',
  'administrator',
  'marketing_manager',
  'campaign_operator',
]);

export function mountWorkspace(root, user, authApi) {
  const api = window.bulkMail;
  const canEdit = contactEditorRoles.has(user.role);
  let refreshCurrentPage;

  root.innerHTML = `
    <div class="workspace-root min-h-screen bg-slate-50 text-slate-900">
      <div class="flex min-h-screen">
        <aside class="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div class="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white">✉</div>
            <div><p class="font-semibold tracking-tight text-slate-900">Bulk Mail</p><p class="text-xs text-slate-500">Campaign workspace</p></div>
          </div>
          <nav class="space-y-1 px-3 py-5" aria-label="Main navigation">
            ${navigation.map(([route, label, icon]) => `<button type="button" data-route="${route}" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"><span aria-hidden="true" class="w-5 text-center text-base">${icon}</span>${label}</button>`).join('')}
          </nav>
          <div class="mt-auto border-t border-slate-100 p-4"><div class="rounded-xl bg-slate-50 p-3"><p class="text-xs font-medium uppercase tracking-wide text-slate-400">Local data</p><p class="mt-1 text-sm font-medium text-slate-700">Stored on this device</p></div></div>
        </aside>
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
            <div><p class="text-xs font-medium uppercase tracking-[0.14em] text-indigo-600">Bulk Mail Sender</p><h1 id="page-title" class="mt-1 text-lg font-semibold text-slate-900">Dashboard</h1></div>
            <div class="flex items-center gap-3">
              <div class="hidden text-right sm:block"><p class="text-sm font-medium text-slate-800">${escapeHtml(user.fullName)}</p><p class="text-xs capitalize text-slate-500">${escapeHtml(user.role.replaceAll('_', ' '))}</p></div>
              <button id="workspace-logout" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50" type="button">Sign out</button>
            </div>
          </header>
          <nav class="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden" aria-label="Main navigation">
            ${navigation.map(([route, label]) => `<button type="button" data-route="${route}" class="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium">${label}</button>`).join('')}
          </nav>
          <main id="page-content" class="flex-1 p-4 sm:p-7 lg:p-9"></main>
        </div>
      </div>
      <div id="toast-container" hidden role="status" aria-live="polite"></div>
    </div>
  `;

  const pageContent = root.querySelector('#page-content');

  async function navigate(page, action) {
    root.querySelector('#page-title').textContent = pageTitles[page];
    root.querySelectorAll('[data-route]').forEach((button) => {
      const active = button.dataset.route === page;
      button.className = active
        ? 'flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-sm font-semibold text-indigo-700 transition'
        : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900';
      if (button.closest('nav')?.classList.contains('lg:hidden')) {
        button.className = active
          ? 'whitespace-nowrap rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700'
          : 'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50';
      }
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    pageContent.innerHTML =
      '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading saved data…</div>';
    try {
      if (page === 'dashboard') {
        await renderDashboard(pageContent, api, {
          canEdit,
          addContact: () => navigate('contacts', 'add'),
          createList: () => navigate('lists', 'create'),
          openContacts: () => navigate('contacts'),
        });
        refreshCurrentPage = () => navigate('dashboard');
      } else if (page === 'contacts') {
        await renderContactsPage(pageContent, api, {
          canEdit,
          initialAction: action,
        });
        refreshCurrentPage = () => navigate('contacts');
      } else if (page === 'lists') {
        await renderContactListsPage(pageContent, api, {
          canEdit,
          initialAction: action,
        });
        refreshCurrentPage = () => navigate('lists');
      }
    } catch (error) {
      pageContent.innerHTML = `<section class="rounded-2xl border border-rose-200 bg-white p-6"><h2 class="font-semibold text-rose-700">Could not load ${escapeHtml(pageTitles[page])}</h2><p class="mt-2 text-sm text-slate-600">${escapeHtml(error instanceof Error ? error.message : 'Unexpected error')}</p><button id="retry-page" class="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button">Try again</button></section>`;
      pageContent
        .querySelector('#retry-page')
        .addEventListener('click', () => navigate(page));
    }
  }

  root.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.route));
  });
  root
    .querySelector('#workspace-logout')
    .addEventListener('click', async () => {
      try {
        const result = await authApi.logout();
        if (!result.ok) {
          showToast(root, 'Could not sign out. Please try again.', 'error');
          return;
        }
        window.location.reload();
      } catch (error) {
        showToast(
          root,
          error instanceof Error ? error.message : 'Could not sign out.',
          'error',
        );
      }
    });

  navigate('dashboard');
  return {
    refresh: () => refreshCurrentPage?.(),
    navigate,
  };
}
