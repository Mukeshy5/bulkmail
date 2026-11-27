import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Code2,
  Copy,
  Download,
  Eye,
  History,
  Minus,
  Plus,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Undo2,
  Upload,
  TriangleAlert,
} from 'lucide-react';
import { Modal, useToast } from './ui.jsx';
import { Action, ErrorText, Field } from './workspace-ui.jsx';
import {
  EmailCanvas,
  ElementPalette,
  Inspector,
} from './EmailStudioCanvas.jsx';
import {
  ChecksDialog,
  DeviceButtons,
  HistoryDialog,
  LinkDialog,
  MediaLibrary,
  PreviewDialog,
  TestDialog,
} from './EmailStudioDialogs.jsx';
import {
  blockLabels,
  campaignTemplate,
  categories,
  devices,
  imageKinds,
  mediaRequest,
  newBlock,
  readHtmlFile,
  studioRequest,
  templateDraft,
} from './email-studio-model.js';

const signature = (document) =>
  JSON.stringify({
    ...document,
    meta: { ...document.meta, status: undefined },
  });
let clipboardBlock;

export default function EmailBuilder({
  id,
  canEdit,
  canSend,
  userEmail,
  navigate,
}) {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: templateDraft(),
    next: [],
  }));
  const [selected, setSelected] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('block');
  const [device, setDevice] = useState('Desktop');
  const [zoom, setZoom] = useState(100);
  const [remote, setRemote] = useState(false);
  const [ready, setReady] = useState(!id);
  const [autosave, setAutosave] = useState(true);
  const [savedHash, setSavedHash] = useState(() => signature(templateDraft()));
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const [conflicted, setConflicted] = useState(false);
  const [, refreshClipboard] = useState(0);
  const currentRecord = useRef(null);
  const pending = useRef(null);
  const htmlInput = useRef(null);
  const attemptedAutosave = useRef('');
  const toast = useToast();
  const { design, meta, designSettings } = history.present;
  const currentHash = signature(history.present);
  const dirty = currentHash !== savedHash;
  const block = design.find((item) => item.id === selected);
  const baseWidth = Math.min(
    820,
    Math.max(320, Number(designSettings.width || 600)),
  );
  const width = Math.min(baseWidth, devices[device] || baseWidth);

  function load(template, makeCopy = false) {
    const base = templateDraft(template);
    const editable = !(makeCopy && template.isSystem);
    if (!editable)
      base.meta = {
        ...base.meta,
        name: (base.meta.name + ' copy').slice(0, 100),
        status: 'draft',
      };
    const nextRecord = editable
      ? {
          id: template.id,
          revision: template.revision,
          status: template.status,
        }
      : null;
    currentRecord.current = nextRecord;
    setRecord(nextRecord);
    setHistory({ past: [], present: base, next: [] });
    setSavedHash(signature(base));
    setSelected(null);
    setReady(true);
    setError('');
    setConflicted(false);
  }

  useEffect(() => {
    let active = true;
    if (typeof id === 'string') {
      studioRequest('get', id)
        .then((result) => {
          if (active) load(result.template, canEdit);
        })
        .catch((cause) => {
          if (active) {
            setError(cause.message);
            setReady(true);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [id, canEdit]);

  const commit = (edit) =>
    setHistory((state) => {
      const next = edit(state.present);
      if (next === state.present) return state;
      return {
        past: [...state.past.slice(-59), state.present],
        present: next,
        next: [],
      };
    });
  function undo() {
    setHistory((state) =>
      state.past.length
        ? {
            past: state.past.slice(0, -1),
            present: state.past.at(-1),
            next: [state.present, ...state.next],
          }
        : state,
    );
  }
  function redo() {
    setHistory((state) =>
      state.next.length
        ? {
            past: [...state.past, state.present],
            present: state.next[0],
            next: state.next.slice(1),
          }
        : state,
    );
  }
  function select(id) {
    setSelected(id);
    setInspectorTab('block');
  }
  function patch(id, value) {
    commit((state) => ({
      ...state,
      design: state.design.map((item) =>
        item.id === id ? { ...item, ...value } : item,
      ),
    }));
  }
  function editMeta(key, value) {
    commit((state) => ({ ...state, meta: { ...state.meta, [key]: value } }));
  }
  function insert(type, index, values = {}) {
    if (!canEdit || !blockLabels[type] || design.length >= 100) return;
    const item = newBlock(type, values);
    commit((state) => ({
      ...state,
      design: [
        ...state.design.slice(0, index),
        item,
        ...state.design.slice(index),
      ],
    }));
    select(item.id);
  }
  function move(id, position) {
    const from = design.findIndex((item) => item.id === id);
    if (
      from === -1 ||
      from === position ||
      position < 0 ||
      position >= design.length
    )
      return;
    commit((state) => {
      const next = [...state.design];
      const [item] = next.splice(from, 1);
      next.splice(position, 0, item);
      return { ...state, design: next };
    });
    select(id);
  }
  function duplicate(item) {
    const { id, ...values } = item;
    insert(item.type, design.findIndex((entry) => entry.id === id) + 1, values);
  }
  function remove(id) {
    commit((state) => ({
      ...state,
      design: state.design.filter((item) => item.id !== id),
    }));
    if (selected === id) setSelected(null);
  }
  function copy() {
    if (!block) return;
    clipboardBlock = { ...block };
    refreshClipboard((value) => value + 1);
    toast('Block copied.');
  }
  function paste() {
    if (!clipboardBlock || !canEdit) return;
    const values = { ...clipboardBlock };
    delete values.id;
    const index = block
      ? design.findIndex((item) => item.id === block.id) + 1
      : design.length;
    insert(values.type, index, values);
  }
  async function importHtml(file) {
    try {
      insert('html', design.length, { content: await readHtmlFile(file) });
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }
  async function onDrop(event, index) {
    const media = event.dataTransfer.files[0];
    if (media) {
      try {
        if (/\.html?$/i.test(media.name)) {
          insert('html', index, { content: await readHtmlFile(media) });
        } else {
          if (media.size > 5 * 1024 * 1024)
            throw new Error('Choose an image up to 5 MB.');
          const result = await mediaRequest('upload', {
            name: media.name,
            fileData: new Uint8Array(await media.arrayBuffer()),
          });
          insert('image', index, {
            mediaId: result.media.id,
            imageWidth: Math.min(560, result.media.width),
          });
        }
      } catch (cause) {
        setError(cause.message);
      }
      return;
    }
    const type = event.dataTransfer.getData('application/x-email-element');
    const id = event.dataTransfer.getData('application/x-email-block');
    if (type) insert(type, index);
    if (id) {
      const oldIndex = design.findIndex((item) => item.id === id);
      if (oldIndex >= 0) move(id, Math.min(index, design.length - 1));
    }
  }

  async function save(status, auto = false) {
    if (!canEdit) return null;
    if (conflicted) {
      if (!auto) setError('Reload the latest version before saving.');
      return null;
    }
    if (!meta.name.trim()) {
      if (!auto) setError('Enter a template name.');
      return null;
    }
    if (!design.length && status === 'ready') {
      if (!auto)
        setError('Add at least one block before saving as a template.');
      return null;
    }
    if (pending.current) {
      if (auto) return null;
      await pending.current.catch(() => {});
    }
    const version = currentRecord.current;
    const payload = {
      ...meta,
      design,
      designSettings,
      status,
      expectedRevision: version?.revision,
      reason: auto ? 'autosave' : 'save',
    };
    const task = (async () => {
      setSaving(true);
      if (!auto) setError('');
      try {
        const templates = window.bulkMail.emailTemplates;
        const result = version
          ? await templates.update(version.id, payload)
          : await templates.create(payload);
        if (!result.ok) {
          if (result.conflict) setConflicted(true);
          throw new Error(result.error);
        }
        const { id, revision, status } = result.template;
        currentRecord.current = { id, revision, status };
        setRecord(currentRecord.current);
        setSavedHash(currentHash);
        setError('');
        if (!auto)
          toast(status === 'draft' ? 'Draft saved.' : 'Template saved.');
        return result.template;
      } catch (cause) {
        setError(cause.message);
        return null;
      } finally {
        setSaving(false);
      }
    })();
    pending.current = task;
    try {
      return await task;
    } finally {
      if (pending.current === task) pending.current = null;
    }
  }

  useEffect(() => {
    if (
      !ready ||
      !autosave ||
      !dirty ||
      !canEdit ||
      conflicted ||
      saving ||
      !meta.name.trim() ||
      attemptedAutosave.current === currentHash
    )
      return;
    // Save once per edit snapshot. Errors stay visible until the next edit or an explicit save.
    const timer = setTimeout(() => {
      attemptedAutosave.current = currentHash;
      save(record?.status || 'draft', true);
    }, 1750);
    return () => clearTimeout(timer);
  }, [currentHash, dirty, ready, canEdit, autosave, conflicted, saving]);

  async function reload() {
    if (
      !currentRecord.current?.id ||
      (dirty &&
        !window.confirm(
          'Reload the latest version and discard unsaved changes?',
        ))
    )
      return;
    try {
      load((await studioRequest('get', currentRecord.current.id)).template);
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function compileAction(name) {
    setSending(true);
    setError('');
    try {
      if (name === 'campaign') {
        const template = await save('ready');
        if (template) navigate('campaigns', campaignTemplate(template));
        return;
      }
      if (name === 'duplicate') {
        const saved =
          dirty || !currentRecord.current
            ? await save(record?.status || 'draft')
            : currentRecord.current;
        if (!saved) return;
        const result = await studioRequest('duplicate', saved.id);
        navigate('builder', result.template.id);
        return;
      }
      const result = await studioRequest('render', { design, designSettings });
      if (name === 'export') {
        const exported = await studioRequest('exportHtml', {
          html: result.html,
          name: meta.name,
        });
        if (exported.ok) toast('HTML exported.');
      } else setDialog({ name, html: result.html });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  }

  function handleKeys(event) {
    if (
      !canEdit ||
      event.defaultPrevented ||
      (!event.ctrlKey && !event.metaKey) ||
      event.target.matches('input, textarea, select, [contenteditable]')
    )
      return;
    const key = event.key.toLowerCase();
    if (!['c', 'v', 'z', 'y'].includes(key)) return;
    if ((key === 'c' && !block) || (key === 'v' && !clipboardBlock)) return;
    event.preventDefault();
    if (key === 'c') copy();
    else if (key === 'v') paste();
    else if (key === 'y' || event.shiftKey) redo();
    else undo();
  }
  const close = () => setDialog(null);

  return (
    <section
      className="email-builder"
      aria-label="Email builder"
      onKeyDown={handleKeys}
    >
      <div className="email-editor-header">
        <div className="email-editor-title">
          <button
            type="button"
            className="email-back"
            title="Template library"
            aria-label="Back to template library"
            onClick={() => navigate('templates')}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <h1>Email builder</h1>
            <p>{meta.name || 'Untitled template'}</p>
          </div>
        </div>
        <div className="email-editor-actions">
          <span
            className={'email-save-indicator' + (dirty ? ' dirty' : '')}
            aria-live="polite"
          >
            {saving ? (
              'Saving…'
            ) : dirty ? (
              <>
                <span /> Unsaved changes
              </>
            ) : record ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              'New draft'
            )}
          </span>
          <Action
            onClick={() => compileAction('preview')}
            disabled={!design.length || sending}
          >
            <Eye size={16} /> Preview
          </Action>
          {canEdit && (
            <>
              <Action onClick={() => save('draft')} disabled={saving}>
                Save draft
              </Action>
              <Action primary onClick={() => save('ready')} disabled={saving}>
                <Save size={16} /> Save template
              </Action>
            </>
          )}
        </div>
      </div>
      <div className="email-editor-meta">
        <Field label="Template name">
          <input
            aria-label="Template name"
            value={meta.name}
            maxLength={100}
            disabled={!canEdit}
            placeholder="Name this template"
            onChange={(event) => editMeta('name', event.target.value)}
          />
        </Field>
        <Field label="Subject line">
          <input
            value={meta.subject}
            maxLength={200}
            disabled={!canEdit}
            placeholder="Email subject"
            onChange={(event) => editMeta('subject', event.target.value)}
          />
        </Field>
        <Field label="Category">
          <select
            value={meta.category}
            disabled={!canEdit}
            onChange={(event) => editMeta('category', event.target.value)}
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Action onClick={() => setDialog({ name: 'details' })}>Details</Action>
        {canEdit && (
          <label className="studio-check email-autosave">
            <input
              type="checkbox"
              checked={autosave}
              onChange={(event) => setAutosave(event.target.checked)}
            />{' '}
            Autosave
          </label>
        )}
      </div>
      {error && (
        <div className="email-editor-error">
          <TriangleAlert size={17} />
          <ErrorText text={error} />
          {conflicted && <Action onClick={reload}>Reload latest</Action>}
        </div>
      )}
      {!ready ? (
        <p className="studio-empty">Loading template…</p>
      ) : (
        <div className="email-editor-grid">
          <ElementPalette
            onAdd={(type) => insert(type, design.length)}
            onMedia={() => setDialog({ name: 'media' })}
            canEdit={canEdit}
          />
          <div className="email-editor-center">
            <div className="email-canvas-toolbar">
              <div className="email-tool-group">
                <Action
                  title="Undo"
                  aria-label="Undo"
                  disabled={!history.past.length || !canEdit}
                  onClick={undo}
                >
                  <Undo2 size={16} />
                </Action>
                <Action
                  title="Redo"
                  aria-label="Redo"
                  disabled={!history.next.length || !canEdit}
                  onClick={redo}
                >
                  <Redo2 size={16} />
                </Action>
                <Action
                  title="Copy block"
                  aria-label="Copy block"
                  disabled={!block || !canEdit}
                  onClick={copy}
                >
                  <Copy size={15} />
                </Action>
                <Action
                  title="Paste block"
                  aria-label="Paste block"
                  disabled={!clipboardBlock || !canEdit}
                  onClick={paste}
                >
                  <ClipboardPaste size={15} />
                </Action>
              </div>
              <DeviceButtons value={device} onChange={setDevice} />
              <div className="email-tool-group email-zoom">
                <Action
                  title="Zoom out"
                  aria-label="Zoom out"
                  disabled={zoom <= 50}
                  onClick={() => setZoom(zoom - 10)}
                >
                  <Minus size={15} />
                </Action>
                <button
                  type="button"
                  title="Reset zoom"
                  onClick={() => setZoom(100)}
                >
                  {zoom}%
                </button>
                <Action
                  title="Zoom in"
                  aria-label="Zoom in"
                  disabled={zoom >= 150}
                  onClick={() => setZoom(zoom + 10)}
                >
                  <Plus size={15} />
                </Action>
              </div>
            </div>
            <EmailCanvas
              design={design}
              settings={designSettings}
              selected={selected}
              onSelect={select}
              onDrop={onDrop}
              onMove={move}
              onDuplicate={duplicate}
              onDelete={remove}
              onPatch={patch}
              canEdit={canEdit}
              width={width}
              zoom={zoom}
              mobile={device === 'Mobile'}
              remote={remote}
            />
          </div>
          <Inspector
            block={block}
            settings={designSettings}
            tab={inspectorTab}
            onTab={setInspectorTab}
            onPatch={(value) => block && patch(block.id, value)}
            onSettings={(value) =>
              commit((state) => ({
                ...state,
                designSettings: { ...state.designSettings, ...value },
              }))
            }
            onLink={() => setDialog({ name: 'link' })}
            onMedia={() => setDialog({ name: 'media', blockId: block?.id })}
            canEdit={canEdit}
          />
        </div>
      )}
      <div className="email-editor-footer">
        <label className="studio-check">
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
          />{' '}
          Show remote images
        </label>
        <div className="studio-actions">
          {canEdit && (
            <>
              <input
                type="file"
                accept=".html,.htm,text/html"
                ref={htmlInput}
                hidden
                onChange={(event) => {
                  const file = event.target.files[0];
                  event.target.value = '';
                  if (file) importHtml(file);
                }}
              />
              <Action onClick={() => htmlInput.current.click()}>
                <Upload size={15} /> Import HTML
              </Action>
            </>
          )}
          <Action
            disabled={!design.length || sending}
            onClick={() => compileAction('source')}
          >
            <Code2 size={15} /> HTML source
          </Action>
          <Action
            disabled={!design.length || sending}
            onClick={() => compileAction('checks')}
          >
            <ShieldCheck size={15} /> Check email
          </Action>
          <Action
            disabled={!design.length || sending}
            onClick={() => compileAction('export')}
          >
            <Download size={15} /> Export
          </Action>
          {canEdit && (
            <>
              <Action
                disabled={!record || saving}
                onClick={() => setDialog({ name: 'history' })}
              >
                <History size={15} /> Versions
              </Action>
              <Action
                disabled={!design.length || sending}
                onClick={() => compileAction('duplicate')}
              >
                <Copy size={14} /> Duplicate
              </Action>
            </>
          )}
          {canSend && (
            <Action
              disabled={!design.length || sending}
              onClick={() => compileAction('test')}
            >
              <Send size={15} /> Send test
            </Action>
          )}
          {canEdit && (
            <Action
              primary
              disabled={!design.length || sending || saving}
              onClick={() => compileAction('campaign')}
            >
              Use in campaign
            </Action>
          )}
        </div>
      </div>
      {dialog?.name === 'preview' && (
        <PreviewDialog
          html={dialog.html}
          subject={meta.subject}
          onClose={close}
          initialDevice={device}
        />
      )}
      {dialog?.name === 'checks' && (
        <ChecksDialog html={dialog.html} onClose={close} />
      )}
      {dialog?.name === 'test' && (
        <TestDialog
          html={dialog.html}
          suggestedSubject={meta.subject}
          text={meta.textBody}
          userEmail={userEmail}
          onClose={close}
        />
      )}
      {dialog?.name === 'history' && record && (
        <HistoryDialog
          id={record.id}
          revision={record.revision}
          onRestore={load}
          onClose={close}
        />
      )}
      {dialog?.name === 'link' && block && (
        <LinkDialog
          block={block}
          onApply={(value) => {
            patch(block.id, value);
            close();
          }}
          onClose={close}
        />
      )}
      {dialog?.name === 'media' && (
        <MediaLibrary
          canEdit={canEdit}
          onClose={close}
          onPick={(item) => {
            if (!canEdit) return;
            const value = {
              mediaId: item.id,
              imageUrl: '',
              imageWidth: Math.min(560, item.width),
            };
            const target = design.find(
              (entry) =>
                entry.id === dialog.blockId && imageKinds.includes(entry.type),
            );
            if (target)
              patch(target.id, {
                ...value,
                ...(target.type === 'logo'
                  ? { imageWidth: Math.min(144, item.width) }
                  : {}),
              });
            else insert('image', design.length, value);
            close();
          }}
        />
      )}
      {dialog?.name === 'details' && (
        <Modal title="Template details" onClose={close}>
          <div className="studio-form">
            <Field label="Description" wide>
              <textarea
                disabled={!canEdit}
                rows={3}
                maxLength={500}
                value={meta.description}
                onChange={(event) =>
                  editMeta('description', event.target.value)
                }
              />
            </Field>
            <Field label="Plain-text version" wide>
              <textarea
                disabled={!canEdit}
                rows={7}
                value={meta.textBody}
                onChange={(event) => editMeta('textBody', event.target.value)}
              />
            </Field>
            <div className="studio-wide studio-actions">
              <Action primary onClick={close}>
                Done
              </Action>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.name === 'source' && (
        <SourceDialog html={dialog.html} onClose={close} />
      )}
    </section>
  );
}

function SourceDialog({ html, onClose }) {
  const [error, setError] = useState('');
  const toast = useToast();
  async function copy() {
    try {
      await studioRequest('copyHtml', { html });
      toast('HTML source copied.');
    } catch (cause) {
      setError(cause.message);
    }
  }
  return (
    <Modal title="Email HTML source" onClose={onClose} size="max-w-5xl">
      <div className="email-dialog-toolbar">
        <Action onClick={copy}>
          <Copy size={15} /> Copy HTML
        </Action>
      </div>
      <ErrorText text={error} />
      <textarea
        className="email-source-code"
        rows={20}
        readOnly
        value={html}
        aria-label="Generated email HTML"
      />
    </Modal>
  );
}
