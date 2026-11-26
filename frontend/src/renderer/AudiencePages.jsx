import { useEffect, useState } from 'react';
import { Modal, PageHeading, useToast } from './ui.jsx';
import {
  Action,
  call,
  DataTable,
  ErrorText,
  Field,
  QueryState,
  useQuery,
} from './workspace-ui.jsx';

const conditions = {
  contains: 'Contains',
  not_contains: 'Does not contain',
  eq: 'Equals',
  neq: 'Does not equal',
  gt: 'Greater than',
  lt: 'Less than',
};
const segmentFields = {
  country: 'Country',
  city: 'City',
  company: 'Company',
  tags: 'Tag',
  consent_at: 'Subscription date',
  source: 'Contact source',
  category: 'Category',
  list: 'List name',
  opens: 'Recorded opens',
  clicks: 'Recorded clicks',
  custom: 'Custom field',
};
const defaultSegment = {
  name: '',
  mode: 'and',
  rules: [{ field: 'country', operator: 'eq', value: '' }],
};

export function Segments({ canEdit }) {
  const [revision, setRevision] = useState(0);
  const query = useQuery('segments', undefined, revision);
  const [editing, setEditing] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) =>
    setEditing((current) => ({ ...current, [key]: value }));
  const changeRule = (index, key, value) =>
    update(
      'rules',
      editing.rules.map((rule, position) =>
        position === index ? { ...rule, [key]: value } : rule,
      ),
    );
  const close = () => {
    setError('');
    setEditing(null);
  };

  async function modify(method, input) {
    setBusy(true);
    setError('');
    try {
      const result = await call(method, input);
      if (method === 'segmentCount')
        setCounts((current) => ({ ...current, [input]: result.count }));
      else {
        close();
        setRevision(revision + 1);
        setCounts({});
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-page">
      <PageHeading
        title="Segments"
        description="Build dynamic audiences from subscriber attributes and engagement."
        actions={
          canEdit && (
            <Action
              primary
              onClick={() => {
                setError('');
                setEditing(defaultSegment);
              }}
            >
              New segment
            </Action>
          )
        }
      />
      <QueryState query={query} />
      {!editing && <ErrorText text={error} />}
      {query.data && (
        <section className="studio-card">
          {!query.data.segments.length && (
            <p className="studio-empty">No saved segments.</p>
          )}
          {query.data.segments.map((row) => (
            <article key={row.id} className="studio-record">
              <div>
                <h2>{row.name}</h2>
                <p>
                  {row.rules.length} rules ·{' '}
                  {row.mode === 'and' ? 'Match all' : 'Match any'}
                  {counts[row.id] !== undefined &&
                    ' · ' + counts[row.id] + ' eligible subscribers'}
                </p>
              </div>
              <div className="studio-actions">
                <Action
                  disabled={busy}
                  onClick={() => modify('segmentCount', row.id)}
                >
                  Count subscribers
                </Action>
                {canEdit && (
                  <>
                    <Action
                      onClick={() => {
                        setError('');
                        setEditing(row);
                      }}
                    >
                      Edit
                    </Action>
                    <Action
                      danger
                      disabled={busy}
                      onClick={() =>
                        window.confirm('Delete this segment?') &&
                        modify('deleteSegment', row.id)
                      }
                    >
                      Delete
                    </Action>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Edit segment' : 'New segment'}
          onClose={close}
          size="max-w-4xl"
        >
          <form
            className="studio-form"
            onSubmit={(e) => {
              e.preventDefault();
              modify('saveSegment', editing);
            }}
          >
            <Field label="Segment name">
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </Field>
            <Field label="Match rules">
              <select
                value={editing.mode}
                onChange={(e) => update('mode', e.target.value)}
              >
                <option value="and">All (AND)</option>
                <option value="or">Any (OR)</option>
              </select>
            </Field>
            <div className="studio-wide studio-rule-list">
              {editing.rules.map((rule, index) => {
                const custom = rule.field.startsWith('custom.');
                return (
                  <div key={index} className="studio-filters">
                    <Field label="Field">
                      <select
                        value={custom ? 'custom' : rule.field}
                        onChange={(e) =>
                          changeRule(
                            index,
                            'field',
                            e.target.value === 'custom'
                              ? 'custom.'
                              : e.target.value,
                          )
                        }
                      >
                        {Object.entries(segmentFields).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {custom && (
                      <Field label="Custom field key">
                        <input
                          required
                          pattern="[A-Za-z0-9_\\-]{1,40}"
                          value={rule.field.slice(7)}
                          onChange={(e) =>
                            changeRule(
                              index,
                              'field',
                              'custom.' + e.target.value,
                            )
                          }
                        />
                      </Field>
                    )}
                    <Field label="Operator">
                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          changeRule(index, 'operator', e.target.value)
                        }
                      >
                        {Object.entries(conditions).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Match value">
                      <input
                        required
                        maxLength={200}
                        type={
                          rule.field === 'consent_at'
                            ? 'date'
                            : ['opens', 'clicks'].includes(rule.field)
                              ? 'number'
                              : 'text'
                        }
                        value={rule.value}
                        onChange={(e) =>
                          changeRule(index, 'value', e.target.value)
                        }
                      />
                    </Field>
                    <Action
                      disabled={editing.rules.length === 1}
                      onClick={() =>
                        update(
                          'rules',
                          editing.rules.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </Action>
                  </div>
                );
              })}
            </div>
            <div className="studio-actions studio-wide">
              <Action
                disabled={editing.rules.length >= 20}
                onClick={() =>
                  update('rules', [...editing.rules, defaultSegment.rules[0]])
                }
              >
                Add rule
              </Action>
              <Action primary type="submit" disabled={busy}>
                Save segment
              </Action>
            </div>
            <ErrorText text={error} />
          </form>
        </Modal>
      )}
    </div>
  );
}

const defaultForm = {
  name: '',
  consent: 'I agree to receive email updates and can unsubscribe at any time.',
  listId: '',
  customFields: [],
  company: false,
  phone: false,
  doubleOptIn: true,
  published: false,
};

export function SignupForms({ canEdit }) {
  const [revision, setRevision] = useState(0);
  const query = useQuery('forms', undefined, revision);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [custom, setCustom] = useState('');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    let active = true;
    window.bulkMail.contactLists
      .list('')
      .then((result) => {
        if (active) setLists(result.lists || []);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (key, value) =>
    setEditing((current) => ({ ...current, [key]: value }));
  const begin = (row) => {
    setEditing(row);
    setCustom(row.customFields.join(', '));
    setError('');
    setPreview(false);
  };

  async function modify(method, input) {
    setError('');
    setBusy(true);
    try {
      await call(method, input);
      if (method !== 'openForm') {
        setEditing(null);
        setRevision(revision + 1);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(row) {
    try {
      await navigator.clipboard.writeText(
        '<iframe src="' +
          row.url +
          '" title="Newsletter signup" width="100%" height="620" loading="lazy"></iframe>',
      );
      toast('Embed code copied.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  return (
    <div className="studio-page">
      <PageHeading
        title="Signup forms"
        description="Publish consent-based forms to collect subscribers directly into your lists."
        actions={
          canEdit && (
            <Action primary onClick={() => begin(defaultForm)}>
              New form
            </Action>
          )
        }
      />
      <QueryState query={query} />
      {!editing && <ErrorText text={error} />}
      {query.data && (
        <section className="studio-card">
          {!query.data.forms.length && (
            <p className="studio-empty">No signup forms yet.</p>
          )}
          {query.data.forms.map((row) => (
            <article className="studio-record" key={row.id}>
              <div>
                <h2>
                  {row.name}{' '}
                  <span className="studio-badge">
                    {row.published ? 'Published' : 'Draft'}
                  </span>
                </h2>
                <p>
                  {row.subscribers} confirmed ·{' '}
                  {row.doubleOptIn ? 'Double opt-in' : 'Single opt-in'}
                </p>
              </div>
              <div className="studio-actions">
                {row.published && row.url && (
                  <>
                    <Action onClick={() => modify('openForm', row.id)}>
                      Open public form
                    </Action>
                    <Action onClick={() => copy(row)}>Copy embed code</Action>
                  </>
                )}
                {canEdit && (
                  <>
                    <Action onClick={() => begin(row)}>Edit</Action>
                    <Action
                      danger
                      onClick={() =>
                        window.confirm('Delete this signup form?') &&
                        modify('deleteForm', row.id)
                      }
                    >
                      Delete
                    </Action>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Edit signup form' : 'New signup form'}
          onClose={() => setEditing(null)}
        >
          <form
            className="studio-form"
            onSubmit={(e) => {
              e.preventDefault();
              modify('saveForm', {
                ...editing,
                customFields: custom
                  .split(',')
                  .map((key) => key.trim())
                  .filter(Boolean),
              });
            }}
          >
            <Field label="Form name">
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </Field>
            <Field label="Contact list">
              <select
                required
                value={editing.listId || ''}
                onChange={(e) => update('listId', e.target.value)}
              >
                <option value="">Select a list</option>
                {lists.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Consent statement" wide>
              <textarea
                required
                maxLength={500}
                value={editing.consent}
                onChange={(e) => update('consent', e.target.value)}
              />
            </Field>
            <Field label="Custom field keys, separated by commas" wide>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </Field>
            {[
              ['company', 'Ask for company'],
              ['phone', 'Ask for phone'],
              ['doubleOptIn', 'Require email confirmation'],
              ['published', 'Publish form'],
            ].map(([key, label]) => (
              <label key={key} className="studio-check">
                <input
                  type="checkbox"
                  checked={editing[key]}
                  onChange={(e) => update(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
            {preview && (
              <section className="studio-card studio-wide">
                <h2>{editing.name || 'Signup form'}</h2>
                <p>
                  Name · Email{editing.company && ' · Company'}
                  {editing.phone && ' · Phone'}
                  {custom && ' · ' + custom}
                </p>
                <p>☐ {editing.consent}</p>
              </section>
            )}
            <ErrorText text={error} />
            <div className="studio-actions studio-wide">
              <Action onClick={() => setPreview(!preview)}>
                {preview ? 'Hide preview' : 'Preview'}
              </Action>
              <Action primary type="submit" disabled={busy}>
                Save form
              </Action>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Suppression({ canEdit }) {
  const [revision, setRevision] = useState(0);
  const query = useQuery('suppressions', undefined, revision);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('blocked');
  const [error, setError] = useState('');
  return (
    <div className="studio-page">
      <PageHeading
        title="Suppression list"
        description="These addresses are excluded whenever a campaign builds or rechecks its audience."
      />
      {canEdit && (
        <form
          className="studio-filters"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              await call('suppress', { email, reason });
              setEmail('');
              setRevision(revision + 1);
            } catch (cause) {
              setError(cause.message);
            }
          }}
        >
          <Field label="Email address">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="blocked">Blocked</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </Field>
          <Action primary type="submit">
            Suppress address
          </Action>
        </form>
      )}
      <ErrorText text={error} />
      <QueryState query={query} />
      {query.data && (
        <section className="studio-card">
          <DataTable rows={query.data.rows} />
        </section>
      )}
    </div>
  );
}
