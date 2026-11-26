import { useEffect, useState } from 'react';
import { ErrorPanel, formatDate, PageHeading } from './ui.jsx';

const statusNames = {
  pending: 'Pending consent',
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  blocked: 'Blocked',
};

export default function Dashboard({
  canEdit,
  onAddContact,
  onCreateList,
  onOpenContacts,
}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    window.bulkMail.contacts
      .dashboard()
      .then((response) => {
        if (!response.ok) throw new Error(response.error);
        if (active) {
          setResult(response);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load dashboard data.',
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading saved data…
      </div>
    );
  }
  if (error) {
    return (
      <ErrorPanel
        message={error}
        onRetry={() => setReload((value) => value + 1)}
      />
    );
  }
  if (!result) return null;

  const distribution = Object.fromEntries(
    result.statusDistribution.map(({ status, count }) => [status, count]),
  );
  const cards = [
    ['Total contacts', result.contacts.total, 'Persisted on this device'],
    ['Active subscribers', result.contacts.subscribed, 'With recorded consent'],
    ['Contact lists', result.contactLists, 'Saved audience groups'],
    [
      'Suppressed addresses',
      result.suppressedAddresses,
      'Excluded from marketing',
    ],
  ];

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Workspace overview"
        title="Dashboard"
        description="A live view of your saved contacts and lists."
        actions={
          canEdit && (
            <>
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                type="button"
                onClick={onAddContact}
              >
                Add contact
              </button>
              <button
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={onCreateList}
              >
                Create list
              </button>
            </>
          )
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {value}
            </p>
            <p className="mt-2 text-xs text-slate-400">{hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Contact status</h2>
          <p className="mt-1 text-sm text-slate-500">
            Counts reflect stored contact records.
          </p>
          <div className="mt-6 space-y-5">
            {Object.entries(statusNames).map(([status, name]) => {
              const count = distribution[status] || 0;
              const percentage = result.contacts.total
                ? Math.round((count / result.contacts.total) * 100)
                : 0;
              return (
                <div className="space-y-2" key={status}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{name}</span>
                    <span className="font-medium text-slate-800">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Recent activity</h2>
              <p className="mt-1 text-sm text-slate-500">
                Actions recorded in your local database.
              </p>
            </div>
            <button
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
              type="button"
              onClick={onOpenContacts}
            >
              View contacts
            </button>
          </div>
          {result.recentActivity.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {result.recentActivity.map((activity, index) => (
                <li
                  className="flex items-start justify-between gap-4 py-3"
                  key={`${activity.createdAt}-${index}`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {activity.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {activity.action.replaceAll('.', ' ')}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">
                    {formatDate(activity.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              No activity yet. Add a contact or create a list to get started.
            </p>
          )}
        </article>
      </section>
      <p className="text-xs leading-5 text-slate-400">
        Campaign metrics will appear when campaign and delivery records are
        available; no sample statistics are shown.
      </p>
    </div>
  );
}
