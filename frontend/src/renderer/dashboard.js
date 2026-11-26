import { escapeHtml, formatDate } from './ui.js';

const statusNames = {
  pending: 'Pending consent',
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  blocked: 'Blocked',
};

export async function renderDashboard(root, api, handlers) {
  const result = await api.contacts.dashboard();
  if (!result.ok) throw new Error(result.error);

  const distribution = Object.fromEntries(
    result.statusDistribution.map(({ status, count }) => [status, count]),
  );
  const statusRows = Object.entries(statusNames)
    .map(([status, name]) => {
      const count = distribution[status] || 0;
      const percentage = result.contacts.total
        ? Math.round((count / result.contacts.total) * 100)
        : 0;
      return `
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-600">${escapeHtml(name)}</span>
            <span class="font-medium text-slate-800">${count}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-indigo-500 transition-all" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
  const activityRows = result.recentActivity.length
    ? result.recentActivity
        .map(
          (activity) => `
            <li class="flex items-start justify-between gap-4 py-3">
              <div><p class="text-sm font-medium text-slate-700">${escapeHtml(activity.description)}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(activity.action.replaceAll('.', ' '))}</p></div>
              <time class="shrink-0 text-xs text-slate-400">${escapeHtml(formatDate(activity.createdAt))}</time>
            </li>
          `,
        )
        .join('')
    : '<li class="py-8 text-center text-sm text-slate-400">No activity yet. Add a contact or create a list to get started.</li>';

  root.innerHTML = `
    <div class="space-y-7">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div><p class="text-sm font-medium text-indigo-600">Workspace overview</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1><p class="mt-1 text-sm text-slate-500">A live view of your saved contacts and lists.</p></div>
        ${handlers.canEdit ? '<div class="flex flex-wrap gap-2"><button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500" type="button" data-quick-action="contact">Add contact</button><button class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" type="button" data-quick-action="list">Create list</button></div>' : ''}
      </div>
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p class="text-sm font-medium text-slate-500">Total contacts</p><p class="mt-3 text-3xl font-semibold text-slate-900">${result.contacts.total}</p><p class="mt-2 text-xs text-slate-400">Persisted on this device</p></article>
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p class="text-sm font-medium text-slate-500">Active subscribers</p><p class="mt-3 text-3xl font-semibold text-emerald-700">${result.contacts.subscribed}</p><p class="mt-2 text-xs text-slate-400">With recorded consent</p></article>
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p class="text-sm font-medium text-slate-500">Contact lists</p><p class="mt-3 text-3xl font-semibold text-slate-900">${result.contactLists}</p><p class="mt-2 text-xs text-slate-400">Saved audience groups</p></article>
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p class="text-sm font-medium text-slate-500">Suppressed addresses</p><p class="mt-3 text-3xl font-semibold text-rose-700">${result.suppressedAddresses}</p><p class="mt-2 text-xs text-slate-400">Excluded from marketing</p></article>
      </section>
      <section class="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><h2 class="font-semibold text-slate-900">Contact status</h2><p class="mt-1 text-sm text-slate-500">Counts reflect stored contact records.</p></div>
          <div class="mt-6 space-y-5">${statusRows}</div>
        </article>
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center justify-between gap-4"><div><h2 class="font-semibold text-slate-900">Recent activity</h2><p class="mt-1 text-sm text-slate-500">Actions recorded in your local database.</p></div><button class="text-sm font-semibold text-indigo-600 hover:text-indigo-500" type="button" data-route="contacts">View contacts</button></div>
          <ul class="mt-4 divide-y divide-slate-100">${activityRows}</ul>
        </article>
      </section>
      <p class="text-xs leading-5 text-slate-400">Campaign metrics will appear when campaign and delivery records are available; no sample statistics are shown.</p>
    </div>
  `;

  root
    .querySelector('[data-quick-action="contact"]')
    ?.addEventListener('click', handlers.addContact);
  root
    .querySelector('[data-quick-action="list"]')
    ?.addEventListener('click', handlers.createList);
  root
    .querySelector('[data-route="contacts"]')
    ?.addEventListener('click', handlers.openContacts);
}
