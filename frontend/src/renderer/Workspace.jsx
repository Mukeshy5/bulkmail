import { useState } from 'react';
import ContactLists from './ContactLists.jsx';
import Contacts from './Contacts.jsx';
import Dashboard from './Dashboard.jsx';
import Campaigns from './Campaigns.jsx';
import EmailTemplates from './EmailTemplates.jsx';
import SmtpAccounts from './SmtpAccounts.jsx';
import { Logo, useToast } from './ui.jsx';

const editorRoles = new Set([
  'super_admin',
  'administrator',
  'marketing_manager',
  'campaign_operator',
]);

const navigation = [
  { id: 'dashboard', label: 'Overview', icon: '▦' },
  { id: 'contacts', label: 'Contacts', icon: '✉' },
  { id: 'lists', label: 'Contact lists', icon: '◫' },
  { id: 'templates', label: 'Email templates', icon: '▤' },
  { id: 'campaigns', label: 'Campaign drafts', icon: '↗' },
  { id: 'smtp', label: 'SMTP accounts', icon: '⇄' },
];

export default function Workspace({ user, onSignOut }) {
  const [page, setPage] = useState('dashboard');
  const [initialAction, setInitialAction] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const showToast = useToast();
  const canEdit = editorRoles.has(user.role);

  function navigate(nextPage, action = null) {
    setPage(nextPage);
    setInitialAction(action);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not sign out.',
        'error',
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-20 items-center border-b border-slate-100 px-6">
            <Logo compact />
          </div>
          <nav className="space-y-1 px-3 py-5" aria-label="Main navigation">
            {navigation.map((item) => (
              <NavigationButton
                key={item.id}
                item={item}
                active={page === item.id}
                onClick={() => navigate(item.id)}
              />
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-100 p-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Local data
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                Stored on this device
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-600">
                Bulk Mail Sender
              </p>
              <h1 className="mt-1 text-lg font-semibold text-slate-900">
                {navigation.find((item) => item.id === page)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-800">
                  {user.fullName}
                </p>
                <p className="text-xs capitalize text-slate-500">
                  {user.role.replaceAll('_', ' ')}
                </p>
              </div>
              <button
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                type="button"
                onClick={signOut}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </header>

          <nav
            className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden"
            aria-label="Main navigation"
          >
            {navigation.map((item) => (
              <button
                key={item.id}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${page === item.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                type="button"
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main className="flex-1 p-4 sm:p-7 lg:p-9">
            {page === 'dashboard' && (
              <Dashboard
                canEdit={canEdit}
                onAddContact={() => navigate('contacts', 'add')}
                onCreateList={() => navigate('lists', 'create')}
                onOpenContacts={() => navigate('contacts')}
              />
            )}
            {page === 'contacts' && (
              <Contacts canEdit={canEdit} initialAction={initialAction} />
            )}
            {page === 'lists' && (
              <ContactLists canEdit={canEdit} initialAction={initialAction} />
            )}
            {page === 'templates' && (
              <EmailTemplates canEdit={canEdit} initialAction={initialAction} />
            )}
            {page === 'campaigns' && (
              <Campaigns canEdit={canEdit} initialAction={initialAction} />
            )}
            {page === 'smtp' && (
              <SmtpAccounts
                canManage={['super_admin', 'administrator'].includes(user.role)}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function NavigationButton({ item, active, onClick }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span aria-hidden="true" className="w-5 text-center text-base">
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}
