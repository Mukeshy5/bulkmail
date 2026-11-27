import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileCode2,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Upload,
} from 'lucide-react';
import { Modal, useToast } from './ui.jsx';
import EmailPreviewFrame from './EmailPreview.jsx';
import { PreviewDialog, TestDialog } from './EmailStudioDialogs.jsx';
import { Action, ErrorText, Field } from './workspace-ui.jsx';
import {
  campaignTemplate,
  categories,
  defaultDesign,
  newBlock,
  readHtmlFile,
  studioRequest,
} from './email-studio-model.js';

const filters = [
  ['all', 'All templates'],
  ['custom', 'My templates'],
  ['favorites', 'Favorites'],
  ['recent', 'Recently edited'],
];
const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function EmailTemplates({
  canEdit,
  canSend,
  userEmail,
  navigate,
}) {
  const [templates, setTemplates] = useState(null);
  const [view, setView] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recommended');
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef(null);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    studioRequest('list')
      .then((result) => {
        if (active) setTemplates(result.templates);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const all = templates || [];
  const searchTerm = search.trim().toLowerCase();
  const visible = all.filter(
    (item) =>
      (!category || item.category === category) &&
      (view === 'recent' || view === 'custom'
        ? !item.isSystem
        : view === 'favorites'
          ? item.favorite
          : true) &&
      (!searchTerm ||
        [item.name, item.description, item.subject, item.category]
          .join(' ')
          .toLowerCase()
          .includes(searchTerm)),
  );
  if (view === 'recent' || sort === 'updated')
    visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else if (sort === 'created')
    visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === 'name')
    visible.sort((a, b) => a.name.localeCompare(b.name));

  async function action(method, item) {
    setMenu(null);
    setError('');
    if (method === 'preview' || method === 'rename' || method === 'test') {
      setDialog({ method, item });
      return;
    }
    if (method === 'edit') {
      navigate('builder', item.id);
      return;
    }
    if (method === 'use') {
      navigate('campaigns', campaignTemplate(item));
      return;
    }
    if (
      method === 'delete' &&
      !window.confirm('Delete "' + item.name + '" and its version history?')
    )
      return;
    try {
      const result =
        method === 'export'
          ? await window.bulkMail.workspace.exportTemplate(item.id)
          : method === 'favorite'
            ? await studioRequest('favorite', {
                id: item.id,
                favorite: !item.favorite,
              })
            : await studioRequest(method, item.id);
      if (result.cancelled) return;
      if (!result.ok) throw new Error(result.error);
      if (method === 'duplicate') navigate('builder', result.template.id);
      else if (method === 'favorite')
        setTemplates((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, favorite: result.favorite }
              : entry,
          ),
        );
      else {
        toast(method === 'delete' ? 'Template deleted.' : 'HTML exported.');
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function importHtml(file) {
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const content = await readHtmlFile(file);
      const result = await studioRequest('create', {
        name: file.name.replace(/\.html?$/i, '').slice(0, 100),
        status: 'draft',
        design: [newBlock('html', { content })],
        designSettings: defaultDesign,
      });
      toast('HTML imported as a draft.');
      navigate('builder', result.template.id);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="email-library">
      <header className="email-library-header">
        <div className="email-library-hero-icon">
          <LayoutTemplate size={25} strokeWidth={1.65} />
        </div>
        <div className="email-library-hero-copy">
          <h1>Email templates</h1>
          <p>
            Find a starter design or build a reusable template for your next
            campaign.
          </p>
        </div>
        {canEdit && (
          <div className="email-library-actions">
            <input
              type="file"
              hidden
              ref={fileInput}
              accept=".html,.htm,text/html"
              onChange={(event) => {
                const file = event.target.files[0];
                event.target.value = '';
                importHtml(file);
              }}
            />
            <Action
              onClick={() => fileInput.current.click()}
              disabled={importing}
            >
              <Upload size={16} /> {importing ? 'Importing…' : 'Import HTML'}
            </Action>
            <Action primary onClick={() => navigate('builder')}>
              <Plus size={18} /> New template
            </Action>
          </div>
        )}
      </header>

      <div className="email-library-tools">
        <nav className="email-library-tabs" aria-label="Template views">
          {filters.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => {
                setView(id);
                setMenu(null);
              }}
            >
              {id === 'favorites' && <Star size={14} />}
              {id === 'recent' && <Clock3 size={14} />}
              {label}
            </button>
          ))}
        </nav>
        <div className="email-library-filters">
          <label className="email-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMenu(null);
              }}
            />
          </label>
          <label className="email-select">
            <select
              aria-label="Template category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setMenu(null);
              }}
            >
              <option value="">All categories</option>
              {categories.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <label className="email-select">
            <select
              aria-label="Sort templates"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recommended">Recommended</option>
              <option value="updated">Last modified</option>
              <option value="created">Newest created</option>
              <option value="name">Name</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </div>
      <ErrorText text={error} />
      {templates === null && !error && (
        <p className="studio-empty">Loading templates…</p>
      )}
      {templates && (
        <div className="email-results-head">
          <span>
            {visible.length} {visible.length === 1 ? 'template' : 'templates'}
          </span>
        </div>
      )}
      {templates && !visible.length && (
        <div className="email-library-empty">
          <LayoutTemplate size={28} />
          <h3>No templates in this view</h3>
          {search || category ? (
            <Action
              onClick={() => {
                setSearch('');
                setCategory('');
              }}
            >
              Clear filters
            </Action>
          ) : (
            canEdit &&
            view !== 'favorites' && (
              <Action primary onClick={() => navigate('builder')}>
                Create template
              </Action>
            )
          )}
        </div>
      )}
      <div className="email-library-grid">
        {visible.map((item) => (
          <TemplateCard
            key={item.id}
            item={item}
            canEdit={canEdit}
            canSend={canSend}
            menuOpen={menu === item.id}
            onMenu={() => setMenu(menu === item.id ? null : item.id)}
            onCloseMenu={() => setMenu(null)}
            onAction={(method) => action(method, item)}
          />
        ))}
      </div>

      {dialog?.method === 'preview' && (
        <PreviewDialog
          html={dialog.item.htmlBody}
          title={dialog.item.name}
          subject={dialog.item.subject}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.method === 'test' && (
        <TestDialog
          html={dialog.item.htmlBody}
          suggestedSubject={dialog.item.subject}
          text={dialog.item.textBody}
          userEmail={userEmail}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.method === 'rename' && (
        <RenameDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSaved={() => {
            toast('Template renamed.');
            setDialog(null);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}

function TemplateCard({
  item,
  canEdit,
  canSend,
  menuOpen,
  onMenu,
  onCloseMenu,
  onAction,
}) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event) {
      if (!menuRef.current?.contains(event.target)) onCloseMenu();
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen, onCloseMenu]);
  return (
    <article className="email-template-card">
      <div className="email-template-thumbnail" data-starter={item.isSystem}>
        <button
          type="button"
          className="email-template-preview-button"
          aria-label={'Preview ' + item.name}
          onClick={() => onAction('preview')}
        >
          {item.htmlBody ? (
            <EmailPreviewFrame
              htmlBody={item.htmlBody}
              title={item.name + ' thumbnail'}
              className="email-template-frame"
              loading="lazy"
            />
          ) : (
            <span className="email-template-blank">
              <FileCode2 size={33} />
            </span>
          )}
          <span className="email-template-overlay">
            Preview template <ArrowUpRight size={15} />
          </span>
        </button>
        <span className="email-template-kind">
          {item.isSystem
            ? 'Starter'
            : item.status === 'draft'
              ? 'Draft'
              : 'Custom'}
        </span>
        <button
          type="button"
          className={'email-template-star' + (item.favorite ? ' starred' : '')}
          aria-label={
            item.favorite ? 'Remove from favorites' : 'Add to favorites'
          }
          aria-pressed={item.favorite}
          onClick={() => onAction('favorite')}
        >
          <Star size={18} />
        </button>
      </div>
      <div className="email-template-card-body">
        <div className="email-template-card-heading">
          <div>
            <span className="email-category-label">{item.category}</span>
            <h3 title={item.name}>{item.name}</h3>
          </div>
          <div
            className="email-card-control"
            ref={menuRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCloseMenu();
            }}
          >
            <button
              type="button"
              title="Template actions"
              aria-label={'Actions for ' + item.name}
              aria-expanded={menuOpen}
              onClick={onMenu}
            >
              <MoreHorizontal size={20} />
            </button>
            {menuOpen && (
              <div className="email-card-menu">
                <button type="button" onClick={() => onAction('preview')}>
                  Preview
                </button>
                {canEdit && (
                  <button type="button" onClick={() => onAction('edit')}>
                    {item.isSystem ? 'Customize' : 'Edit template'}
                  </button>
                )}
                {canEdit && !item.isSystem && (
                  <button type="button" onClick={() => onAction('rename')}>
                    Rename
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={() => onAction('duplicate')}>
                    Duplicate
                  </button>
                )}
                <button type="button" onClick={() => onAction('export')}>
                  Export HTML
                </button>
                {canSend && item.htmlBody && (
                  <button type="button" onClick={() => onAction('test')}>
                    Send test email
                  </button>
                )}
                {canEdit && !item.isSystem && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onAction('delete')}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p>{item.description || item.subject || 'Custom email template'}</p>
        <div className="email-card-dates">
          <span>
            <CalendarDays size={13} /> Created {date(item.createdAt)}
          </span>
          <span>
            <Clock3 size={13} /> Edited {date(item.updatedAt)}
          </span>
        </div>
        {canEdit && (
          <div className="email-card-footer">
            <Action onClick={() => onAction('edit')}>
              {item.isSystem ? 'Customize' : 'Edit'}
            </Action>
            <button
              className="email-use-link"
              type="button"
              disabled={!item.htmlBody}
              onClick={() => onAction('use')}
            >
              Use in campaign <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function RenameDialog({ item, onClose, onSaved }) {
  const [name, setName] = useState(item.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await studioRequest('update', item.id, {
        name,
        expectedRevision: item.revision,
        reason: 'rename',
      });
      onSaved();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Rename template" onClose={onClose}>
      <form className="studio-form" onSubmit={save}>
        <Field label="Template name" wide>
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ErrorText text={error} />
        <div className="studio-wide studio-actions">
          <Action primary type="submit" disabled={busy}>
            Save name
          </Action>
        </div>
      </form>
    </Modal>
  );
}
