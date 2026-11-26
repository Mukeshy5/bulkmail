import { useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LayoutTemplate,
  List,
  LogOut,
  Mail,
  MailMinus,
  Megaphone,
  Moon,
  Search,
  Send,
  Settings2,
  ShieldBan,
  Sun,
  Users as UsersIcon,
  WandSparkles,
  Waypoints,
  X,
} from 'lucide-react';
import Contacts from './Contacts.jsx';
import ContactLists from './ContactLists.jsx';
import Campaigns from './Campaigns.jsx';
import EmailTemplates from './EmailTemplates.jsx';
import EmailBuilder from './EmailBuilder.jsx';
import SmtpAccounts from './SmtpAccounts.jsx';
import Analytics, { Reports } from './Analytics.jsx';
import { Segments, SignupForms, Suppression } from './AudiencePages.jsx';
import { Activity, Notifications, Settings, Users } from './AdminPages.jsx';
import { Modal, useToast } from './ui.jsx';
import { Action, call, useQuery } from './workspace-ui.jsx';

const groups = [
  [
    'Workspace',
    [
      ['dashboard', 'Dashboard', LayoutDashboard],
      ['campaigns', 'Campaigns', Megaphone],
      ['schedule', 'Calendar', CalendarDays],
      ['contacts', 'Contacts', UsersIcon],
      ['lists', 'Contact lists', List],
      ['segments', 'Segments', Waypoints],
    ],
  ],
  [
    'Content & delivery',
    [
      ['templates', 'Email templates', LayoutTemplate],
      ['builder', 'Email builder', WandSparkles],
      ['forms', 'Signup forms', ClipboardList],
      ['smtp', 'SMTP accounts', Send],
      ['queue', 'Sending queue', Mail],
    ],
  ],
  [
    'Reporting',
    [
      ['analytics', 'Campaign analytics', BarChart3],
      ['reports', 'Reports', FileSpreadsheet],
      ['unsubscribes', 'Unsubscribes', MailMinus],
      ['bounces', 'Bounces', MailMinus],
      ['complaints', 'Complaints', ShieldBan],
      ['suppression', 'Suppression list', ShieldBan],
    ],
  ],
  [
    'Administration',
    [
      ['notifications', 'Notifications', Bell],
      ['activity', 'Activity logs', ActivityIcon, true],
      ['users', 'Users', UsersIcon, true],
      ['settings', 'Settings', Settings2],
    ],
  ],
];

export default function Workspace({ user, onSignOut }) {
  const [page, setPage] = useState('dashboard');
  const [action, setAction] = useState(null);
  const [key, setKey] = useState(0);
  const [theme, setTheme] = useState('light');
  const [help, setHelp] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const toast = useToast();
  const admin = user.permissions.includes('workspace.admin');
  const canSend = user.permissions.includes('campaign.send');
  const canEdit = user.permissions.includes('workspace.edit');
  const nav = groups
    .flatMap((entry) => entry[1])
    .filter((entry) => !entry[3] || admin);
  const notificationQuery = useQuery('notifications', undefined, page, 20000);
  const unread =
    notificationQuery.data?.rows.filter((row) => !row.read).length || 0;

  useEffect(() => {
    let active = true;
    call('preferences')
      .then((result) => {
        if (active) setTheme(result.theme);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function navigate(id, input = null) {
    setMobileMenu(false);
    setPage(id);
    setAction(input);
    setKey((value) => value + 1);
    window.scrollTo(0, 0);
  }

  async function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    try {
      await call('theme', next);
      setTheme(next);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="studio-shell" data-theme={theme}>
      <aside className={'studio-sidebar' + (mobileMenu ? ' open' : '')}>
        <button
          type="button"
          className="studio-brand"
          onClick={() => navigate('dashboard')}
        >
          <span>
            <Mail size={21} />
          </span>
          <div>
            Bulk Mail <b>Pro</b>
            <small>Email marketing</small>
          </div>
        </button>
        <nav aria-label="Workspace navigation">
          {groups.map(([name, links]) => (
            <section key={name}>
              <h2>{name}</h2>
              {links
                .filter((entry) => !entry[3] || admin)
                .map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
            </section>
          ))}
        </nav>
        <button
          className="studio-sidebar-settings"
          type="button"
          onClick={() => navigate('settings')}
        >
          <span>{user.fullName.slice(0, 1).toUpperCase()}</span>
          <div>
            {user.fullName}
            <small>{user.role.replaceAll('_', ' ')}</small>
          </div>
        </button>
      </aside>
      <div className="studio-workspace">
        <header className="studio-topbar">
          <div className="studio-top-left">
            <button
              type="button"
              className="studio-mobile-toggle"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Toggle navigation"
            >
              <List size={21} />
            </button>
            <span className="studio-breadcrumb">
              {nav.find(([id]) => id === page)?.[1]}
            </span>
          </div>
          <GlobalSearch nav={nav} navigate={navigate} />
          <div className="studio-toolbar">
            <button
              type="button"
              title="Notifications"
              aria-label={'Notifications, ' + unread + ' unread'}
              onClick={() => navigate('notifications')}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <button
              type="button"
              title="Help center"
              aria-label="Help center"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <button
              type="button"
              title="Switch theme"
              aria-label="Switch theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={signOut}
              disabled={signingOut}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="studio-main" key={key}>
          {page === 'dashboard' && (
            <Analytics
              overview
              user={user}
              navigate={navigate}
              canEdit={canEdit}
            />
          )}
          {page === 'contacts' && (
            <Contacts canEdit={canEdit} initialAction={action} />
          )}
          {page === 'lists' && (
            <ContactLists
              canEdit={canEdit}
              initialAction={action}
              navigate={navigate}
            />
          )}
          {page === 'segments' && <Segments canEdit={canEdit} />}
          {page === 'templates' && (
            <EmailTemplates canEdit={canEdit} navigate={navigate} />
          )}
          {page === 'builder' && (
            <EmailBuilder id={action} canEdit={canEdit} navigate={navigate} />
          )}
          {page === 'forms' && <SignupForms canEdit={canEdit} />}
          {['campaigns', 'schedule'].includes(page) && (
            <Campaigns
              canEdit={canEdit}
              canSend={canSend}
              initialAction={action}
              calendar={page === 'schedule'}
              navigate={navigate}
            />
          )}
          {page === 'smtp' && <SmtpAccounts canManage={admin} />}
          {page === 'analytics' && <Analytics navigate={navigate} />}
          {page === 'reports' && <Reports />}
          {['queue', 'unsubscribes', 'bounces', 'complaints'].includes(
            page,
          ) && <Reports locked defaultType={page} />}
          {page === 'suppression' && <Suppression canEdit={canEdit} />}
          {page === 'notifications' && <Notifications />}
          {page === 'activity' && admin && <Activity />}
          {page === 'users' && admin && <Users user={user} />}
          {page === 'settings' && (
            <Settings
              admin={admin}
              user={user}
              onSignOut={onSignOut}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          )}
        </main>
      </div>
      {help && (
        <Modal title="Help center" onClose={() => setHelp(false)}>
          <div className="studio-help">
            <BookOpen size={24} />
            <p>
              Add an SMTP account and test the connection. Set your business
              address and public HTTPS service under Settings, then build an
              audience using contacts with recorded consent.
            </p>
            <p>
              Keep the desktop app open to send scheduled campaigns. The
              separate public service handles signup, unsubscribe, and tracking
              links.
            </p>
            <Action
              onClick={() => {
                setHelp(false);
                navigate('settings');
              }}
            >
              Open settings
            </Action>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GlobalSearch({ nav, navigate }) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(false);
  const [records, setRecords] = useState([]);
  const query = term.trim().toLowerCase();
  useEffect(() => {
    let live = true;
    if (query.length < 2) {
      setRecords([]);
      return;
    }
    const timer = setTimeout(() => {
      Promise.all([
        window.bulkMail.campaigns.list(query),
        window.bulkMail.contacts.list({ search: query, limit: 4 }),
        window.bulkMail.contactLists.list(query),
        window.bulkMail.emailTemplates.list(),
      ])
        .then(([campaigns, contacts, lists, templates]) => {
          if (!live) return;
          setRecords([
            ...(campaigns.campaigns || [])
              .slice(0, 3)
              .map((item) => [item.name, 'campaigns', { openId: item.id }]),
            ...(contacts.contacts || [])
              .slice(0, 3)
              .map((item) => [
                item.fullName,
                'contacts',
                { search: item.email },
              ]),
            ...(lists.lists || [])
              .slice(0, 3)
              .map((item) => [item.name, 'lists', { search: item.name }]),
            ...(templates.templates || [])
              .filter((item) => item.name.toLowerCase().includes(query))
              .slice(0, 3)
              .map((item) => [item.name, 'builder', item.id]),
          ]);
        })
        .catch(() => {
          if (live) setRecords([]);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  const pages = nav
    .filter((item) => item[1].toLowerCase().includes(query))
    .slice(0, 6)
    .map(([id, label]) => [label, id]);
  return (
    <div
      className="studio-global-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setActive(false);
      }}
    >
      <Search aria-hidden="true" size={16} />
      <input
        type="search"
        placeholder="Search workspace"
        aria-label="Search workspace"
        value={term}
        onFocus={() => setActive(true)}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setActive(false);
        }}
      />
      {term && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setTerm('')}
        >
          <X size={14} />
        </button>
      )}
      {active && query && (
        <div className="studio-search-results">
          {[...pages, ...records].map(([label, page, action]) => (
            <button
              type="button"
              key={page + label}
              onClick={() => {
                navigate(page, action);
                setTerm('');
                setActive(false);
              }}
            >
              {label}
              <small>{nav.find(([id]) => id === page)?.[1]}</small>
            </button>
          ))}
          {!pages.length && !records.length && <p>No matches</p>}
        </div>
      )}
    </div>
  );
}
