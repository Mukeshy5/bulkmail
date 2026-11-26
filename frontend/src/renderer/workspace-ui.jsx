import { useEffect, useState } from 'react';

export async function call(method, input) {
  const result = await window.bulkMail.workspace[method](input);
  if (!result.ok && !result.cancelled)
    throw new Error(result.error || 'The operation failed.');
  return result;
}

export function useQuery(method, input, revision = 0, every = 0) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await call(method, input);
        if (active) setState({ data, error: '' });
      } catch (error) {
        if (active)
          setState((current) => ({ ...current, error: error.message }));
      }
    }
    load();
    const timer = every ? setInterval(load, every) : null;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [method, input, revision, every]);
  return state;
}

export function Field({ label, children, wide = false }) {
  return (
    <label className={'studio-field' + (wide ? ' studio-wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Action({
  children,
  primary = false,
  danger = false,
  ...props
}) {
  return (
    <button
      type="button"
      className={
        'studio-button' +
        (primary ? ' studio-primary' : '') +
        (danger ? ' studio-danger' : '')
      }
      {...props}
    >
      {children}
    </button>
  );
}

export function DataTable({
  rows = [],
  omit = [],
  empty = 'No records for this view.',
}) {
  if (!rows.length) return <p className="studio-empty">{empty}</p>;
  const columns = Object.keys(rows[0]).filter((key) => !omit.includes(key));
  return (
    <div className="studio-table-wrap">
      <table className="studio-table">
        <thead>
          <tr>
            {columns.map((key) => (
              <th key={key}>{key.replaceAll('_', ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((key) => (
                <td key={key}>{row[key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueryState({ query }) {
  if (query.error)
    return (
      <p className="studio-error" role="alert">
        {query.error}
      </p>
    );
  if (!query.data) return <p className="studio-empty">Loading…</p>;
  return null;
}

export function ErrorText({ text }) {
  return text ? (
    <p className="studio-error" role="alert">
      {text}
    </p>
  ) : null;
}

export function localInput(date, timezone) {
  if (!date) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(date))
    .replace(' ', 'T');
}
