import { useEffect, useRef, useState } from 'react';
import EmailPreviewFrame from './EmailPreview.jsx';
import { Modal, PageHeading, formatDate, useToast } from './ui.jsx';
import {
  Action,
  call,
  DataTable,
  ErrorText,
  Field,
  localInput,
  QueryState,
  useQuery,
} from './workspace-ui.jsx';

const empty = {
  name: '',
  description: '',
  campaignType: 'marketing',
  listIds: [],
  segmentId: '',
  exclusions: [],
  subject: '',
  senderName: '',
  senderEmail: '',
  replyToEmail: '',
  smtpAccountId: '',
  previewText: '',
  templateId: '',
  customHtml: '',
};
const kinds = [
  'marketing',
  'newsletter',
  'promotion',
  'announcement',
  'customer_update',
  'transactional',
];
const stages = ['Details', 'Audience', 'Sender', 'Design', 'Review', 'Send'];
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timezones = [
  ...new Set([zone, 'UTC', ...Intl.supportedValuesOf('timeZone')]),
];

export default function Campaigns({
  canEdit,
  canSend,
  initialAction,
  calendar = false,
  navigate,
}) {
  const [rows, setRows] = useState(null);
  const [resources, setResources] = useState(null);
  const [draft, setDraft] = useState(() => {
    if (!canEdit) return null;
    if (initialAction === 'create') return {};
    return initialAction?.templateId ? initialAction : null;
  });
  const [selected, setSelected] = useState(null);
  const initialOpenId = useRef(initialAction?.openId);
  const [search, setSearch] = useState(initialAction?.search || '');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const showToast = useToast();
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await window.bulkMail.campaigns.list(search);
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setRows(result.campaigns);
          setError('');
          if (initialOpenId.current) {
            setSelected(
              result.campaigns.find(
                (row) => row.id === initialOpenId.current,
              ) || null,
            );
            initialOpenId.current = null;
          }
        }
      } catch (cause) {
        if (active) setError(cause.message);
      }
    }
    load();
    const interval = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [search, revision]);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.bulkMail.contactLists.list(''),
      call('segments'),
      window.bulkMail.emailTemplates.list(),
      window.bulkMail.smtpAccounts.list(),
    ])
      .then(([lists, segments, templates, smtp]) => {
        if (active)
          setResources({
            lists: lists.lists,
            segments: segments.segments,
            templates: templates.templates,
            smtp: smtp.accounts.filter((account) => account.isEnabled),
          });
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change(row, action) {
    if (
      ['delete', 'cancel'].includes(action) &&
      !window.confirm(
        action === 'delete'
          ? 'Delete this draft?'
          : 'Cancel remaining submissions for this campaign?',
      )
    )
      return;
    try {
      const result =
        action === 'duplicate' || action === 'delete'
          ? await window.bulkMail.campaigns[action](row.id)
          : await call('control', { id: row.id, action });
      if (!result.ok) throw new Error(result.error);
      showToast(
        action === 'duplicate' ? 'Draft duplicated.' : 'Campaign updated.',
      );
      refresh();
    } catch (cause) {
      showToast(cause.message, 'error');
    }
  }

  const visible = (rows || []).filter((row) => !calendar || row.scheduledAt);
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const offset = new Date(month + '-01T12:00:00').getDay();
  const scheduledDate = (row) =>
    localInput(row.scheduledAt, row.timezone || zone).slice(0, 10);
  return (
    <div className="studio-page">
      <PageHeading
        title={calendar ? 'Campaign calendar' : 'Campaigns'}
        description={
          calendar
            ? 'Review campaign times in their scheduled time zones.'
            : 'Create campaigns, review your audience, and monitor delivery progress.'
        }
        actions={
          <>
            <Action
              onClick={() => navigate(calendar ? 'campaigns' : 'schedule')}
            >
              {calendar ? 'All campaigns' : 'Calendar'}
            </Action>
            {canEdit && !calendar && (
              <Action primary onClick={() => setDraft({})}>
                New campaign
              </Action>
            )}
          </>
        }
      />
      <div className="studio-filters">
        <Field label="Search campaigns">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        {calendar && (
          <Field label="Month">
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </Field>
        )}
      </div>
      <ErrorText text={error} />
      {calendar && (
        <section className="studio-card studio-calendar">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => (
            <strong key={name}>{name}</strong>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <div key={'offset-' + index} />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const date = month + '-' + String(index + 1).padStart(2, '0');
            return (
              <div className="studio-calendar-day" key={date}>
                <span>{index + 1}</span>
                {visible
                  .filter((row) => scheduledDate(row) === date)
                  .map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => setSelected(row)}
                    >
                      {localInput(row.scheduledAt, row.timezone).slice(11)}{' '}
                      {row.name}
                    </button>
                  ))}
              </div>
            );
          })}
        </section>
      )}
      <section className="studio-card">
        {!rows && <p className="studio-empty">Loading campaigns…</p>}
        {rows && !visible.length && (
          <p className="studio-empty">No campaigns match this view.</p>
        )}
        {visible.map((row) => (
          <article key={row.id} className="studio-record">
            <div>
              <h2>
                {row.name}{' '}
                <span className={'studio-badge status-' + row.status}>
                  {row.status}
                </span>
              </h2>
              <p>
                {row.subject || 'Subject pending'} · {row.listIds?.length || 0}{' '}
                lists{row.segmentId ? ' · 1 segment' : ''}
              </p>
              {row.scheduledAt && (
                <p>
                  {localInput(row.scheduledAt, row.timezone).replace('T', ' ')}{' '}
                  · {row.timezone}
                </p>
              )}
            </div>
            <div className="studio-actions">
              <Action onClick={() => setSelected(row)}>
                {row.status === 'draft' ? 'Review' : 'Statistics'}
              </Action>
              {canEdit && row.status === 'draft' && (
                <>
                  <Action onClick={() => setDraft(row)}>Edit</Action>
                  <Action danger onClick={() => change(row, 'delete')}>
                    Delete
                  </Action>
                </>
              )}
              {canEdit && (
                <Action onClick={() => change(row, 'duplicate')}>
                  Duplicate
                </Action>
              )}
              {canSend && ['queued', 'sending'].includes(row.status) && (
                <Action onClick={() => change(row, 'pause')}>Pause</Action>
              )}
              {canSend && row.status === 'paused' && (
                <Action onClick={() => change(row, 'resume')}>Resume</Action>
              )}
              {canSend &&
                ['scheduled', 'queued', 'sending', 'paused'].includes(
                  row.status,
                ) && (
                  <Action danger onClick={() => change(row, 'cancel')}>
                    Cancel
                  </Action>
                )}
            </div>
          </article>
        ))}
      </section>
      {draft && resources && (
        <Draft
          draft={draft}
          resources={resources}
          onClose={() => setDraft(null)}
          onSaved={(campaign) => {
            setDraft(null);
            refresh();
            setSelected(campaign);
          }}
        />
      )}
      {selected && resources && (
        <CampaignDetails
          row={selected}
          resources={resources}
          canSend={canSend}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Draft({ draft, resources, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    ...empty,
    ...draft,
    segmentId: draft.segmentId || '',
    templateId: draft.templateId || '',
    smtpAccountId: draft.smtpAccountId || '',
  });
  const [exclusions, setExclusions] = useState(
    (draft.exclusions || []).join('\n'),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const text = (key) => ({
    value: form[key],
    onChange: (e) => set(key, e.target.value),
  });
  const template = resources.templates.find(
    (item) => item.id === form.templateId,
  );

  async function save() {
    setError('');
    if (!form.name.trim()) {
      setStep(0);
      setError('Enter a campaign name.');
      return;
    }
    setBusy(true);
    try {
      const input = {
        ...form,
        exclusions: exclusions.split(/[\s,]+/).filter(Boolean),
      };
      const result = draft.id
        ? await window.bulkMail.campaigns.update(draft.id, input)
        : await window.bulkMail.campaigns.create(input);
      if (!result.ok) throw new Error(result.error);
      onSaved(result.campaign);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={draft.id ? 'Edit campaign' : 'New campaign'}
      onClose={onClose}
      size="max-w-4xl"
    >
      <nav className="studio-steps" aria-label="Campaign setup">
        {stages.map((name, index) => (
          <button
            type="button"
            key={name}
            className={step === index ? 'current' : ''}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => setStep(index)}
          >
            {name}
          </button>
        ))}
      </nav>
      <form
        className="studio-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 4) setStep(step + 1);
          else save();
        }}
      >
        {step === 0 && (
          <>
            <Field label="Campaign name">
              <input required maxLength={150} {...text('name')} />
            </Field>
            <Field label="Campaign type">
              <select {...text('campaignType')}>
                {kinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" wide>
              <textarea maxLength={1000} {...text('description')} />
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <fieldset>
              <legend>Contact lists</legend>
              {resources.lists.length ? (
                resources.lists.map((list) => (
                  <label className="studio-check" key={list.id}>
                    <input
                      type="checkbox"
                      checked={form.listIds.includes(list.id)}
                      onChange={(e) =>
                        set(
                          'listIds',
                          e.target.checked
                            ? [...form.listIds, list.id]
                            : form.listIds.filter((id) => id !== list.id),
                        )
                      }
                    />
                    {list.name}
                  </label>
                ))
              ) : (
                <p className="studio-empty">
                  Create a contact list to use it here.
                </p>
              )}
            </fieldset>
            <Field label="Saved segment">
              <select {...text('segmentId')}>
                <option value="">No segment</option>
                {resources.segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Exclude email addresses" wide>
              <textarea
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                placeholder="One address per line"
              />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="SMTP account">
              <select {...text('smtpAccountId')}>
                <option value="">Use default</option>
                {resources.smtp.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.connectionStatus}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sender name">
              <input maxLength={150} {...text('senderName')} />
            </Field>
            <Field label="Sender email">
              <input type="email" maxLength={254} {...text('senderEmail')} />
            </Field>
            <Field label="Reply-to email">
              <input type="email" maxLength={254} {...text('replyToEmail')} />
            </Field>
            <Field label="Subject" wide>
              <input maxLength={200} {...text('subject')} />
            </Field>
            <Field label="Preview text" wide>
              <input maxLength={250} {...text('previewText')} />
            </Field>
          </>
        )}
        {step === 3 && (
          <>
            <Field label="Email template">
              <select {...text('templateId')}>
                <option value="">Choose a template</option>
                {resources.templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Import HTML">
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file && file.size <= 500000)
                    set('customHtml', await file.text());
                  else if (file) setError('HTML can be up to 500 KB.');
                }}
              />
            </Field>
            <Field label="Custom HTML (overrides template)" wide>
              <textarea rows={7} maxLength={500000} {...text('customHtml')} />
            </Field>
          </>
        )}
        {step >= 4 && (
          <div className="studio-wide">
            <p>
              {form.name || 'Untitled campaign'} · {form.listIds.length}{' '}
              selected lists{form.segmentId && ' · 1 segment'}
            </p>
            <p className="studio-muted">
              Save the draft to check subscriber eligibility and sender
              settings, send a test, or schedule a campaign.
            </p>
            {(form.customHtml || template) && (
              <EmailPreviewFrame
                title="Campaign email preview"
                className="studio-email-frame"
                htmlBody={form.customHtml || template.htmlBody}
              />
            )}
          </div>
        )}
        <ErrorText text={error} />
        <div className="studio-actions studio-wide">
          {step > 0 && <Action onClick={() => setStep(step - 1)}>Back</Action>}
          <Action disabled={busy} onClick={save}>
            Save draft
          </Action>
          <Action primary type="submit" disabled={busy}>
            {step >= 4 ? 'Save & review' : 'Continue'}
          </Action>
        </div>
      </form>
    </Modal>
  );
}

function CampaignDetails({ row, resources, canSend, onClose, onChanged }) {
  const review = useQuery('review', row.id, 0, 3000);
  const metrics = useQuery('metrics', row.id, 0, 3000);
  const [timezone, setTimezone] = useState(
    row.scheduledAt ? row.timezone : zone,
  );
  const [localDate, setLocalDate] = useState(() =>
    localInput(row.scheduledAt, row.timezone || zone),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useToast();
  const template = resources.templates.find(
    (item) => item.id === row.templateId,
  );
  const html = row.customHtml || template?.htmlBody;
  const canPlan = canSend && ['draft', 'scheduled'].includes(row.status);

  async function run(method, input) {
    setBusy(true);
    setError('');
    try {
      const result = await call(method, input);
      if (!result.ok) return;
      if (method === 'sendTest') showToast('SMTP accepted the test email.');
      if (method === 'plan') {
        showToast(input.localDate ? 'Campaign scheduled.' : 'Campaign queued.');
        onChanged();
      }
      if (method === 'exportReport') showToast('Report exported.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={row.name} onClose={onClose} size="max-w-4xl">
      <div className="studio-page" style={{ marginTop: 20 }}>
        <p>
          <strong>Subject</strong>{' '}
          {row.subject || template?.subject || 'Pending'}
        </p>
        {canPlan && (
          <>
            <QueryState query={review} />
            <p>{review.data?.count ?? '—'} eligible subscribers</p>
            {review.data?.issues.map((issue) => (
              <p className="studio-error" key={issue}>
                {issue}
              </p>
            ))}
            <div className="studio-filters">
              <Field label="Scheduled date and time">
                <input
                  type="datetime-local"
                  value={localDate}
                  onChange={(e) => setLocalDate(e.target.value)}
                />
              </Field>
              <Field label="Time zone">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {timezones.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="studio-actions">
              <Action disabled={busy} onClick={() => run('sendTest', row.id)}>
                Send test to my email
              </Action>
              <Action
                disabled={
                  busy ||
                  !localDate ||
                  !review.data ||
                  review.data.issues.length > 0
                }
                onClick={() => run('plan', { id: row.id, localDate, timezone })}
              >
                {row.status === 'scheduled' ? 'Update schedule' : 'Schedule'}
              </Action>
              <Action
                primary
                disabled={busy || !review.data || review.data.issues.length > 0}
                onClick={() =>
                  window.confirm(
                    'Queue this campaign for ' +
                      review.data.count +
                      ' eligible subscribers?',
                  ) && run('plan', { id: row.id })
                }
              >
                Send now
              </Action>
            </div>
          </>
        )}
        <ErrorText text={error} />
        {row.status !== 'draft' && (
          <>
            <QueryState query={metrics} />
            {metrics.data?.data && (
              <CampaignProgress data={metrics.data.data} />
            )}
            <div>
              <Action
                disabled={busy}
                onClick={() =>
                  run('exportReport', {
                    type: 'campaigns',
                    campaignId: row.id,
                    format: 'csv',
                  })
                }
              >
                Export campaign report
              </Action>
            </div>
          </>
        )}
        {html && (
          <EmailPreviewFrame
            title="Email preview"
            className="studio-email-frame"
            htmlBody={html}
          />
        )}
      </div>
    </Modal>
  );
}

function CampaignProgress({ data }) {
  const processed = data.total - data.remaining;
  return (
    <section className="studio-card">
      <h2>Queue progress</h2>
      <p>
        {processed} of {data.total} processed · {data.states.submitted || 0}{' '}
        submitted · {data.states.failed || 0} failed · {data.remaining}{' '}
        remaining
      </p>
      <progress
        aria-label="Sending progress"
        max={data.total || 1}
        value={processed}
      />
      <p>
        Started {formatDate(data.campaign.started_at)} · Completed{' '}
        {formatDate(data.campaign.completed_at)}
      </p>
      <DataTable
        rows={Object.entries(data.states).map(([state, count]) => ({
          state,
          count,
        }))}
      />
      <DataTable rows={data.events} empty="No tracking events recorded." />
      {data.logs.length > 0 && (
        <details>
          <summary>Submission log</summary>
          <DataTable rows={data.logs} />
        </details>
      )}
    </section>
  );
}
