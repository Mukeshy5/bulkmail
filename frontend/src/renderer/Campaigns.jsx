import { useEffect, useState } from 'react';
import EmailPreviewFrame from './EmailPreview.jsx';
import { ErrorPanel, Modal, PageHeading, useToast } from './ui.jsx';

const emptyCampaign = {
  name: '',
  description: '',
  campaignType: 'marketing',
  subject: '',
  senderName: '',
  senderEmail: '',
  replyToEmail: '',
  recipientListId: '',
  templateId: '',
  smtpAccountId: '',
};

const campaignTypes = [
  ['marketing', 'Marketing'],
  ['newsletter', 'Newsletter'],
  ['promotion', 'Promotion'],
  ['announcement', 'Announcement'],
  ['customer_update', 'Customer update'],
  ['transactional', 'Transactional'],
];

export default function Campaigns({ canEdit, initialAction }) {
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(undefined);
  const [previewing, setPreviewing] = useState(null);
  const [search, setSearch] = useState('');
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      window.bulkMail.campaigns.list(search),
      window.bulkMail.contactLists.list(''),
      window.bulkMail.emailTemplates.list(),
      window.bulkMail.smtpAccounts.list(),
    ])
      .then(([campaignResult, listResult, templateResult, smtpResult]) => {
        const failed = [
          campaignResult,
          listResult,
          templateResult,
          smtpResult,
        ].find((result) => !result.ok);
        if (failed) throw new Error(failed.error);
        if (active) {
          setCampaigns(campaignResult.campaigns);
          setLists(listResult.lists);
          setTemplates(templateResult.templates);
          setSmtpAccounts(
            smtpResult.accounts.filter((account) => account.isEnabled),
          );
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load campaign setup data.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, search]);

  useEffect(() => {
    if (initialAction === 'create' && canEdit) setEditing(null);
  }, [initialAction, canEdit]);

  async function duplicate(campaign) {
    try {
      const result = await window.bulkMail.campaigns.duplicate(campaign.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Campaign draft duplicated.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not duplicate campaign.',
        'error',
      );
    }
  }

  async function remove(campaign) {
    if (
      !window.confirm(
        `Delete draft "${campaign.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const result = await window.bulkMail.campaigns.delete(campaign.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Campaign draft deleted.');
      setReload((value) => value + 1);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not delete campaign.',
        'error',
      );
    }
  }

  if (error && !campaigns.length) {
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
        eyebrow="Campaign workspace"
        title="Campaign drafts"
        description="Prepare the sender, audience, and reusable content before delivery is enabled."
        actions={
          canEdit && (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              type="button"
              onClick={() => setEditing(null)}
            >
              + Create campaign
            </button>
          )
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 sm:flex-row sm:items-start">
        <span className="text-lg" aria-hidden="true">
          !
        </span>
        <p>
          Campaigns can be saved as drafts only. Sending, scheduling, consent
          checks, and unsubscribe processing are not enabled yet.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Your campaigns</h2>
            <p className="mt-1 text-xs text-slate-500">
              {campaigns.length} {campaigns.length === 1 ? 'draft' : 'drafts'}
            </p>
          </div>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 sm:max-w-xs"
            type="search"
            placeholder="Search campaigns"
            aria-label="Search campaigns"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {error && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Loading campaigns…
          </p>
        ) : campaigns.length ? (
          <div className="divide-y divide-slate-100">
            {campaigns.map((campaign) => (
              <article
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                key={campaign.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {campaign.name}
                    </h3>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium capitalize text-amber-700">
                      {campaign.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                      {campaign.campaignType.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {campaign.subject || 'Subject not set'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Audience: {campaign.recipientListName || 'Not selected'}
                    {' · '}Template: {campaign.templateName || 'Not selected'}
                    {' · '}SMTP: {campaign.smtpAccountName || 'Not selected'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Updated {new Date(campaign.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    type="button"
                    onClick={() =>
                      setPreviewing({
                        campaign,
                        template:
                          templates.find(
                            (template) => template.id === campaign.templateId,
                          ) || null,
                      })
                    }
                  >
                    Preview
                  </button>
                  {canEdit && campaign.status === 'draft' && (
                    <>
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        type="button"
                        onClick={() => setEditing(campaign)}
                      >
                        Edit draft
                      </button>
                      <button
                        className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        type="button"
                        onClick={() => duplicate(campaign)}
                      >
                        Duplicate
                      </button>
                      <button
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        type="button"
                        onClick={() => remove(campaign)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <h3 className="font-semibold text-slate-900">No campaigns yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Create a draft to start setting up your next campaign.
            </p>
            {canEdit && (
              <button
                className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                type="button"
                onClick={() => setEditing(null)}
              >
                Create campaign draft
              </button>
            )}
          </div>
        )}
      </section>

      {editing !== undefined && canEdit && (
        <CampaignEditor
          campaign={editing}
          lists={lists}
          templates={templates}
          smtpAccounts={smtpAccounts}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            showToast(
              editing ? 'Campaign draft saved.' : 'Campaign draft created.',
            );
            setReload((value) => value + 1);
          }}
        />
      )}
      {previewing && (
        <CampaignPreview
          campaign={previewing.campaign}
          template={previewing.template}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

function CampaignEditor({
  campaign,
  lists,
  templates,
  smtpAccounts,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => ({
    ...emptyCampaign,
    ...(campaign
      ? {
          name: campaign.name,
          description: campaign.description,
          campaignType: campaign.campaignType,
          subject: campaign.subject,
          senderName: campaign.senderName,
          senderEmail: campaign.senderEmail,
          replyToEmail: campaign.replyToEmail,
          recipientListId: campaign.recipientListId || '',
          templateId: campaign.templateId || '',
          smtpAccountId: campaign.smtpAccountId || '',
        }
      : {}),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'templateId' && !current.subject) {
        next.subject =
          templates.find((item) => item.id === value)?.subject || '';
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const input = {
        ...form,
        recipientListId: form.recipientListId || null,
        templateId: form.templateId || null,
        smtpAccountId: form.smtpAccountId || null,
      };
      const result = campaign
        ? await window.bulkMail.campaigns.update(campaign.id, input)
        : await window.bulkMail.campaigns.create(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this campaign.',
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
  const selectedTemplate = templates.find(
    (template) => template.id === form.templateId,
  );

  return (
    <Modal
      title={campaign ? 'Edit campaign draft' : 'Create campaign draft'}
      eyebrow="Campaign setup"
      onClose={onClose}
      size="max-w-4xl"
    >
      <form className="mt-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Campaign name
            <input
              className={fieldClass}
              name="name"
              maxLength={150}
              required
              value={form.name}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Campaign type
            <select
              className={`${fieldClass} bg-white`}
              name="campaignType"
              value={form.campaignType}
              onChange={update}
            >
              {campaignTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <textarea
              className={`${fieldClass} min-h-20`}
              name="description"
              maxLength={1000}
              value={form.description}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Recipient list
            <select
              className={`${fieldClass} bg-white`}
              name="recipientListId"
              value={form.recipientListId}
              onChange={update}
            >
              <option value="">Select later</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.contactCount})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email template
            <select
              className={`${fieldClass} bg-white`}
              name="templateId"
              value={form.templateId}
              onChange={update}
            >
              <option value="">Select later</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Email subject
            <input
              className={fieldClass}
              name="subject"
              maxLength={200}
              value={form.subject}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sender name
            <input
              className={fieldClass}
              name="senderName"
              maxLength={150}
              value={form.senderName}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sender email
            <input
              className={fieldClass}
              name="senderEmail"
              type="email"
              maxLength={254}
              value={form.senderEmail}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Reply-to email
            <input
              className={fieldClass}
              name="replyToEmail"
              type="email"
              maxLength={254}
              value={form.replyToEmail}
              onChange={update}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            SMTP account
            <select
              className={`${fieldClass} bg-white`}
              name="smtpAccountId"
              value={form.smtpAccountId}
              onChange={update}
            >
              <option value="">Select later</option>
              {smtpAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedTemplate && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Template preview
              </h3>
              <button
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-500"
                type="button"
                onClick={() => setPreview((value) => !value)}
              >
                {preview ? 'Hide preview' : 'Show preview'}
              </button>
            </div>
            {preview && (
              <EmailPreviewFrame
                className="h-64 w-full rounded-lg border border-slate-200 bg-white"
                title="Campaign email preview"
                htmlBody={selectedTemplate.htmlBody}
              />
            )}
          </div>
        )}
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
            {busy ? 'Saving…' : 'Save as draft'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CampaignPreview({ campaign, template, onClose }) {
  return (
    <Modal
      title={campaign.name}
      eyebrow="Draft preview"
      onClose={onClose}
      size="max-w-4xl"
    >
      <p className="mt-2 text-sm text-slate-600">
        Subject: {campaign.subject || 'Not set'}
      </p>
      {template ? (
        <>
          <p className="mt-1 text-xs text-slate-500">
            Template: {template.name}
          </p>
          <EmailPreviewFrame
            className="mt-4 h-[60vh] w-full rounded-xl border border-slate-200 bg-white"
            title="Campaign template preview"
            htmlBody={template.htmlBody}
          />
        </>
      ) : (
        <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Select an email template to preview the campaign content.
        </p>
      )}
    </Modal>
  );
}
