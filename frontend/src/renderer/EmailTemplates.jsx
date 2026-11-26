import { useEffect, useState } from 'react';
import { FileText, LayoutTemplate } from 'lucide-react';
import { Modal, PageHeading, useToast } from './ui.jsx';
import EmailPreviewFrame from './EmailPreview.jsx';
import { categories } from './EmailBuilder.jsx';
import { Action, call, ErrorText, Field } from './workspace-ui.jsx';

export default function EmailTemplates({ canEdit, navigate }) {
  const [templates, setTemplates] = useState(null);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const toast = useToast();
  useEffect(() => {
    let active = true;
    window.bulkMail.emailTemplates
      .list()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) setTemplates(result.templates);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  async function action(method, template) {
    if (
      method === 'delete' &&
      !window.confirm(
        'Delete this template? Drafts using it will need another design.',
      )
    )
      return;
    setError('');
    try {
      const result =
        method === 'exportTemplate'
          ? await call(method, template.id)
          : await window.bulkMail.emailTemplates[method](template.id);
      if (!result.ok && !result.cancelled) throw new Error(result.error);
      if (result.ok) {
        if (method === 'duplicate') navigate('builder', result.template.id);
        else
          toast(method === 'delete' ? 'Template deleted.' : 'HTML exported.');
        setRevision(revision + 1);
      }
    } catch (cause) {
      setError(cause.message);
    }
  }

  const visible = templates?.filter(
    (item) =>
      (!category || item.category === category) &&
      (item.name + ' ' + item.description)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="studio-page">
      <PageHeading
        title="Email templates"
        description="Choose a starter or build reusable designs of your own."
        actions={
          canEdit && (
            <Action primary onClick={() => navigate('builder')}>
              New template
            </Action>
          )
        }
      />
      <div className="studio-filters">
        <Field label="Search templates">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText text={error} />
      {!visible && !error && <p className="studio-empty">Loading templates…</p>}
      {visible && !visible.length && (
        <p className="studio-empty">No templates match this view.</p>
      )}
      <div className="studio-template-grid">
        {visible?.map((item) => (
          <article className="studio-card studio-template" key={item.id}>
            <button
              type="button"
              className="studio-template-tile"
              onClick={() => setPreview(item)}
              aria-label={'Preview ' + item.name}
            >
              <LayoutTemplate size={27} />
              <span>{item.category}</span>
              <strong>{item.name}</strong>
            </button>
            <p>{item.description || item.subject || 'Reusable template'}</p>
            <div className="studio-actions">
              {canEdit && (
                <>
                  <Action
                    onClick={() =>
                      navigate('campaigns', {
                        templateId: item.id,
                        subject: item.subject,
                      })
                    }
                  >
                    Use
                  </Action>
                  <Action onClick={() => navigate('builder', item.id)}>
                    {item.isSystem ? 'Customize' : 'Edit'}
                  </Action>
                  {!item.isSystem && (
                    <Action danger onClick={() => action('delete', item)}>
                      Delete
                    </Action>
                  )}
                  <Action onClick={() => action('duplicate', item)}>
                    Duplicate
                  </Action>
                </>
              )}
              <Action
                title="Export HTML"
                aria-label={'Export ' + item.name + ' as HTML'}
                onClick={() => action('exportTemplate', item)}
              >
                <FileText size={16} />
              </Action>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <Modal
          title={preview.name}
          onClose={() => setPreview(null)}
          size="max-w-4xl"
        >
          {preview.subject && <p className="studio-muted">{preview.subject}</p>}
          <EmailPreviewFrame
            title={preview.name + ' preview'}
            htmlBody={preview.htmlBody}
            className="studio-email-frame"
          />
        </Modal>
      )}
    </div>
  );
}
