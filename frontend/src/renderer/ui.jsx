import { createContext, useContext } from 'react';

export const ToastContext = createContext(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Logo({ compact = false }) {
  return (
    <div
      className={`flex items-center gap-3 ${compact ? '' : 'text-white'}`}
      aria-label="Bulk Mail Sender"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-950/20">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-6 w-6"
        >
          <path
            d="M3.75 6.75h16.5v10.5H3.75z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="m4.5 7.5 7.5 6 7.5-6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {compact && (
        <div>
          <p className="font-semibold tracking-tight text-slate-900">
            Bulk Mail
          </p>
          <p className="text-xs text-slate-500">Campaign workspace</p>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    subscribed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    unsubscribed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    bounced: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    blocked: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  };
  const label = status
    ? `${status[0].toUpperCase()}${status.slice(1)}`
    : 'Unknown';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.pending}`}
    >
      {label}
    </span>
  );
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  size = 'max-w-2xl',
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        className={`my-auto w-full ${size} rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <p className="text-sm font-medium text-indigo-600">{eyebrow}</p>
            )}
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          </div>
          <button
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-indigo-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function ErrorPanel({ message, onRetry }) {
  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-6">
      <h2 className="font-semibold text-rose-700">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          type="button"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </section>
  );
}
