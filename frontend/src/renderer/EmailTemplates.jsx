import { useEffect, useState } from 'react';
import { ErrorPanel, Modal, PageHeading, useToast } from './ui.jsx';
import EmailPreviewFrame from './EmailPreview.jsx';

const emptyTemplate = {
  name: '',
  description: '',
  subject: '',
  htmlBody:
    '<h1>Hello {{first_name}}</h1>\n<p>Write your email content here.</p>\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  textBody:
    'Hello {{first_name}},\n\nWrite your email content here.\n\nUnsubscribe: {{unsubscribe_url}}',
};

const templateVariables = [
  '{{first_name}}',
  '{{last_name}}',
  '{{full_name}}',
  '{{email}}',
  '{{company}}',
  '{{unsubscribe_url}}',
];

export default function EmailTemplates({ canEdit, initialAction }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(undefined);
  const [previewing, setPreviewing] = useState(null);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.bulkMail.emailTemplates
      .list()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setTemplates(result.templates);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load email templates.',
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

  useEffect(() => {
    if (initialAction === 'create' && canEdit) setEditing(null);
  }, [initialAction, canEdit]);

  async function duplicate(template) {
    try {
      const result = await window.bulkMail.emailTemplates.duplicate(
        template.id,
      );
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Template duplicated.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not duplicate template.',
        'error',
      );
    }
  }

  async function remove(template) {
    if (
      !window.confirm(
        `Delete "${template.name}"? Campaign drafts using it will no longer have a template selected.`,
      )
    ) {
      return;
    }
    try {
      const result = await window.bulkMail.emailTemplates.delete(template.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Template deleted.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not delete template.',
        'error',
      );
    }
  }

  if (error && !templates.length) {
    return (
      <ErrorPanel
        message={error}
        onRetry={() => setReload((value) => value + 1)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Content studio"
        title="Email templates"
        description="Build reusable HTML and plain-text content with recipient variables."
        actions={
          canEdit && (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              type="button"
              onClick={() => setEditing(null)}
            >
              + Create template
            </button>
          )
        }
      />

      <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Preview uses a sandboxed frame with external requests blocked. Add
        <code className="mx-1 rounded bg-white px-1.5 py-0.5">
          {'{{unsubscribe_url}}'}
        </code>
        to marketing templates; a campaign must have a working unsubscribe
        endpoint before delivery is enabled.
      </p>

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading templates…
        </div>
      ) : templates.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article
              className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              key={template.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {template.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {template.isSystem
                      ? 'Built-in template'
                      : 'Custom template'}
                  </p>
                </div>
                {template.isSystem && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    Starter
                  </span>
                )}
              </div>
              <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                {template.description || template.subject || 'No description'}
              </p>
              <p className="mt-3 truncate text-xs text-slate-500">
                Subject: {template.subject || 'Not set'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Updated {new Date(template.updatedAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => setPreviewing(template)}
                >
                  Preview
                </button>
                {canEdit && (
                  <>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => setEditing(template)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                      type="button"
                      onClick={() => duplicate(template)}
                    >
                      Duplicate
                    </button>
                    {!template.isSystem && (
                      <button
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        type="button"
                        onClick={() => remove(template)}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          No templates are available.
        </div>
      )}

      {editing !== undefined && canEdit && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            showToast(editing ? 'Template saved.' : 'Template created.');
            setReload((value) => value + 1);
          }}
        />
      )}
      {previewing && (
        <TemplatePreview
          template={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...emptyTemplate,
    ...(template
      ? {
          name: template.name,
          description: template.description,
          subject: template.subject,
          htmlBody: template.htmlBody,
          textBody: template.textBody,
        }
      : {}),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const result = template
        ? await window.bulkMail.emailTemplates.update(template.id, form)
        : await window.bulkMail.emailTemplates.create(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this template.',
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  return (
    <Modal
      title={template ? 'Edit email template' : 'Create email template'}
      eyebrow="Content studio"
      onClose={onClose}
      size="max-w-5xl"
    >
      <form className="mt-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Template name
            <input
              className={fieldClass}
              name="name"
              maxLength={100}
              required
              value={form.name}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email subject
            <input
              className={fieldClass}
              name="subject"
              maxLength={200}
              value={form.subject}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <input
              className={fieldClass}
              name="description"
              maxLength={500}
              value={form.description}
              onChange={update}
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">HTML content</h3>
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? 'Edit HTML' : 'Preview HTML'}
          </button>
        </div>
        {preview ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <EmailPreviewFrame
              className="h-72 w-full bg-white"
              title="Template preview"
              htmlBody={form.htmlBody}
            />
          </div>
        ) : (
          <label className="mt-2 block text-sm font-medium text-slate-700">
            <span className="sr-only">HTML content</span>
            <textarea
              className="min-h-64 w-full rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              name="htmlBody"
              maxLength={500 * 1024}
              required
              spellCheck="false"
              value={form.htmlBody}
              onChange={update}
            />
          </label>
        )}
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Variables: {templateVariables.join(' · ')}
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Plain-text alternative
          <textarea
            className={`${fieldClass} min-h-28`}
            name="textBody"
            maxLength={200 * 1024}
            value={form.textBody}
            onChange={update}
          />
        </label>
        <p className="mt-3 min-h-5 text-sm text-rose-600" role="alert">
          {error}
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving…' : template ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TemplatePreview({ template, onClose }) {
  return (
    <Modal
      title={template.name}
      eyebrow="Sandboxed email preview"
      onClose={onClose}
      size="max-w-4xl"
    >
      <p className="mt-2 text-sm text-slate-500">
        Subject: {template.subject || 'Not set'}
      </p>
      <EmailPreviewFrame
        className="mt-4 h-[60vh] w-full rounded-xl border border-slate-200 bg-white"
        title={`${template.name} preview`}
        htmlBody={template.htmlBody}
      />
      <p className="mt-2 text-xs text-slate-500">
        External images, scripts, forms and network requests are blocked in this
        preview.
      </p>
    </Modal>
  );
}
