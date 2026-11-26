import { useEffect, useState } from 'react';
import { GripVertical, Monitor, Smartphone, Tablet } from 'lucide-react';
import EmailPreviewFrame from './EmailPreview.jsx';
import { PageHeading, useToast } from './ui.jsx';
import { Action, ErrorText, Field } from './workspace-ui.jsx';

export const categories = [
  'General',
  'Business',
  'Marketing',
  'Newsletter',
  'Events',
  'Customer Communication',
];
const names = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  social: 'Social links',
  logo: 'Logo',
  two: 'Two columns',
  three: 'Three columns',
  html: 'HTML',
  footer: 'Footer',
  unsubscribe: 'Unsubscribe link',
};
const copy = {
  heading: 'A clear heading',
  paragraph: 'Hello {{first_name | default: "there"}},',
  button: 'Learn more',
  image: 'Image description',
  logo: 'Logo',
  two: 'Column one',
  three: 'Column one',
  footer: 'Your company · Your address',
  unsubscribe: 'Unsubscribe',
};
const devices = [
  ['Desktop', 620, Monitor],
  ['Tablet', 520, Tablet],
  ['Mobile', 320, Smartphone],
];
const newBlock = (type, content = copy[type] || '') => ({
  id: crypto.randomUUID(),
  type,
  content,
  second: 'Column two',
  third: 'Column three',
  color: '#182b4b',
  background: '#ffffff',
  buttonColor: '#315be8',
  url: '',
  url2: '',
  url3: '',
  align: 'left',
  padding: 20,
  margin: 0,
  radius: 6,
  font: type === 'heading' ? 28 : 16,
  family: 'Arial',
});
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const bounded = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
const hex = (color, fallback) =>
  /^#[a-f0-9]{6}$/i.test(color) ? color : fallback;
const fonts = ['Arial', 'Georgia', 'Verdana', 'Tahoma'];
const href = (value) => (/^https?:\/\//i.test(value) ? escape(value) : '#');

function renderBlock(block) {
  const { type } = block;
  const body = escape(block.content).replace(/\n/g, '<br>');
  switch (type) {
    case 'heading':
      return '<h1 style="font-size:inherit;margin:0">' + body + '</h1>';
    case 'paragraph':
    case 'footer':
      return '<p style="margin:0">' + body + '</p>';
    case 'image':
    case 'logo':
      return href(block.url) === '#'
        ? '<span>' + body + '</span>'
        : '<img src="' +
            href(block.url) +
            '" alt="' +
            escape(block.content) +
            '" width="' +
            (type === 'logo' ? 140 : 560) +
            '" style="max-width:100%;height:auto;display:inline-block;border:0">';
    case 'button':
      return (
        '<a href="' +
        href(block.url) +
        '" style="display:inline-block;padding:12px 20px;text-decoration:none;color:#ffffff;border-radius:' +
        bounded(block.radius, 50) +
        'px;background:' +
        hex(block.buttonColor, '#315be8') +
        '">' +
        body +
        '</a>'
      );
    case 'divider':
      return '<hr style="margin:0;border:0;border-top:1px solid #d8e1ee">';
    case 'spacer':
      return (
        '<div style="height:' + bounded(block.font, 100) + 'px">&nbsp;</div>'
      );
    case 'social':
      return (
        [
          ['LinkedIn', block.url],
          ['Instagram', block.url2],
          ['Facebook', block.url3],
        ]
          .filter(([, url]) => href(url) !== '#')
          .map(
            ([name, url]) =>
              '<a style="margin-right:14px" href="' +
              href(url) +
              '">' +
              name +
              '</a>',
          )
          .join(' ') || '<span>Social links</span>'
      );
    case 'two':
    case 'three': {
      const values =
        type === 'two'
          ? [block.content, block.second]
          : [block.content, block.second, block.third];
      return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        values
          .map(
            (value) =>
              '<td valign="top" width="' +
              Math.floor(100 / values.length) +
              '%" style="padding:0 8px;word-break:break-word">' +
              escape(value).replace(/\n/g, '<br>') +
              '</td>',
          )
          .join('') +
        '</tr></table>'
      );
    }
    case 'unsubscribe':
      return '<a href="{{unsubscribe_url}}">' + body + '</a>';
    case 'html':
      return block.content;
    default:
      return '';
  }
}

function emailHtml(blocks) {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf2f9"><tr><td align="center" style="padding:12px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">' +
    blocks
      .map((block) => {
        const align = ['center', 'right'].includes(block.align)
          ? block.align
          : 'left';
        const family = fonts.includes(block.family) ? block.family : 'Arial';
        return (
          '<tr><td style="padding-top:' +
          bounded(block.margin, 80) +
          'px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="' +
          align +
          '" style="border-radius:' +
          bounded(block.radius, 50) +
          'px;padding:' +
          bounded(block.padding, 80) +
          'px;font-family:' +
          family +
          ',sans-serif;font-size:' +
          bounded(block.font, 100) +
          'px;color:' +
          hex(block.color, '#182b4b') +
          ';background:' +
          hex(block.background, '#ffffff') +
          '">' +
          renderBlock(block) +
          '</td></tr></table></td></tr>'
        );
      })
      .join('') +
    '</table></td></tr></table>'
  );
}

export default function EmailBuilder({ id, canEdit, navigate }) {
  const [template, setTemplate] = useState({
    name: '',
    subject: '',
    category: 'General',
    description: '',
  });
  const [history, setHistory] = useState({ past: [], current: [], next: [] });
  const [selected, setSelected] = useState(null);
  const [width, setWidth] = useState(620);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [drag, setDrag] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const blocks = history.current;
  const block = blocks.find((item) => item.id === selected);
  const html = emailHtml(blocks);

  useEffect(() => {
    if (!id) return;
    let active = true;
    window.bulkMail.emailTemplates
      .list()
      .then((result) => {
        if (!active) return;
        const item = result.templates.find((entry) => entry.id === id);
        if (!item) {
          setError('Template not found.');
          return;
        }
        setTemplate(
          item.isSystem
            ? {
                ...item,
                id: undefined,
                name: (item.name + ' copy').slice(0, 100),
                isSystem: false,
              }
            : item,
        );
        setHistory({
          past: [],
          current: item.design || [newBlock('html', item.htmlBody)],
          next: [],
        });
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function commit(value) {
    setHistory((old) => ({
      past: [...old.past.slice(-49), old.current],
      current: value(old.current),
      next: [],
    }));
  }

  function add(type, index = blocks.length, content) {
    if (!canEdit || !names[type] || blocks.length >= 100) return;
    const item = newBlock(type, content);
    commit((current) => [
      ...current.slice(0, index),
      item,
      ...current.slice(index),
    ]);
    setSelected(item.id);
  }

  function move(id, index) {
    const currentIndex = blocks.findIndex((item) => item.id === id);
    if (currentIndex < 0) return;
    commit((current) => {
      const result = [...current];
      const [element] = result.splice(currentIndex, 1);
      result.splice(index, 0, element);
      return result;
    });
    setSelected(id);
  }

  function drop(e, index) {
    e.preventDefault();
    e.stopPropagation();
    setDrag('');
    if (!canEdit) return;
    const type = e.dataTransfer.getData('block/type');
    const moving = e.dataTransfer.getData('block/id');
    if (type) add(type, index);
    if (moving) move(moving, Math.min(index, blocks.length - 1));
  }

  function update(key, value) {
    commit((current) =>
      current.map((item) =>
        item.id === selected ? { ...item, [key]: value } : item,
      ),
    );
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!blocks.length) {
      setError('Add an element before saving.');
      return;
    }
    setBusy(true);
    try {
      const input = { ...template, design: blocks, htmlBody: html };
      const result = template.id
        ? await window.bulkMail.emailTemplates.update(template.id, input)
        : await window.bulkMail.emailTemplates.create(input);
      if (!result.ok) throw new Error(result.error);
      setTemplate(result.template);
      toast('Template saved.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const link = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
    );
    link.href = url;
    link.download =
      (template.name || 'email').replace(/[^a-z0-9-]/gi, '-') + '.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <form className="studio-page" onSubmit={save}>
      <PageHeading
        title="Email builder"
        actions={
          <>
            <Action onClick={() => navigate('templates')}>
              Template library
            </Action>
            <Action onClick={download} disabled={!blocks.length}>
              Export HTML
            </Action>
            {canEdit && (
              <Action primary type="submit" disabled={busy}>
                Save template
              </Action>
            )}
          </>
        }
      />
      <ErrorText text={error} />
      <div className="studio-filters">
        <Field label="Template name">
          <input
            required
            maxLength={100}
            value={template.name}
            onChange={(e) => setTemplate({ ...template, name: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Subject">
          <input
            maxLength={200}
            value={template.subject}
            onChange={(e) =>
              setTemplate({ ...template, subject: e.target.value })
            }
            disabled={!canEdit}
          />
        </Field>
        <Field label="Category">
          <select
            value={template.category}
            onChange={(e) =>
              setTemplate({ ...template, category: e.target.value })
            }
            disabled={!canEdit}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="studio-builder">
        <section className="studio-card studio-palette">
          <h2>Elements</h2>
          {Object.entries(names).map(([type, label]) => (
            <button
              className="studio-button"
              key={type}
              type="button"
              draggable={canEdit}
              disabled={!canEdit}
              onDragStart={(e) => {
                e.dataTransfer.setData('block/type', type);
                setDrag(type);
              }}
              onDragEnd={() => setDrag('')}
              onClick={() => add(type)}
            >
              {label}
            </button>
          ))}
          {canEdit && (
            <Field label="Import HTML">
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file?.size > 500000)
                    setError('HTML can be up to 500 KB.');
                  else if (file) add('html', blocks.length, await file.text());
                }}
              />
            </Field>
          )}
        </section>
        <section className="studio-card studio-canvas">
          <div className="studio-actions">
            <Action
              disabled={!history.past.length}
              onClick={() =>
                setHistory((old) => ({
                  past: old.past.slice(0, -1),
                  current: old.past.at(-1),
                  next: [old.current, ...old.next],
                }))
              }
            >
              Undo
            </Action>
            <Action
              disabled={!history.next.length}
              onClick={() =>
                setHistory((old) => ({
                  past: [...old.past, old.current],
                  current: old.next[0],
                  next: old.next.slice(1),
                }))
              }
            >
              Redo
            </Action>
            {devices.map(([label, value, Icon]) => (
              <Action
                title={label}
                aria-label={label + ' preview'}
                aria-pressed={width === value}
                key={label}
                onClick={() => setWidth(value)}
              >
                <Icon size={16} />
              </Action>
            ))}
          </div>
          <div
            className={'studio-blocks' + (drag ? ' dragging' : '')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, blocks.length)}
          >
            {!blocks.length && (
              <p className="studio-empty">
                Drag elements here or select one from the palette.
              </p>
            )}
            {blocks.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={
                  'studio-block' + (selected === item.id ? ' selected' : '')
                }
                onClick={() => setSelected(item.id)}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.setData('block/id', item.id);
                  setDrag(item.id);
                }}
                onDragEnd={() => setDrag('')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, index)}
              >
                <GripVertical size={15} />
                <strong>{names[item.type] ?? item.type}</strong>
                <span>{item.type !== 'html' && item.content}</span>
              </button>
            ))}
          </div>
          <div className="studio-builder-preview" style={{ maxWidth: width }}>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={showRemoteImages}
                onChange={(event) => setShowRemoteImages(event.target.checked)}
              />
              Load remote images in preview
            </label>
            <EmailPreviewFrame
              title="Live email preview"
              className="studio-email-frame"
              htmlBody={html}
              showRemoteImages={showRemoteImages}
            />
          </div>
        </section>
        <section className="studio-card studio-properties">
          <h2>Properties</h2>
          {!block && <p className="studio-empty">Select an element.</p>}
          {block && (
            <fieldset disabled={!canEdit}>
              <legend>{names[block.type]}</legend>
              {!['spacer', 'divider', 'social'].includes(block.type) && (
                <Field
                  label={block.type === 'html' ? 'HTML source' : 'Content'}
                >
                  <textarea
                    rows={block.type === 'html' ? 10 : 3}
                    value={block.content}
                    onChange={(e) => update('content', e.target.value)}
                  />
                </Field>
              )}
              {['two', 'three'].includes(block.type) && (
                <Field label="Column two">
                  <textarea
                    value={block.second}
                    onChange={(e) => update('second', e.target.value)}
                  />
                </Field>
              )}
              {block.type === 'three' && (
                <Field label="Column three">
                  <textarea
                    value={block.third}
                    onChange={(e) => update('third', e.target.value)}
                  />
                </Field>
              )}
              {['image', 'logo', 'button', 'social'].includes(block.type) && (
                <Field label={block.type === 'social' ? 'LinkedIn URL' : 'URL'}>
                  <input
                    type="url"
                    value={block.url}
                    onChange={(e) => update('url', e.target.value)}
                  />
                </Field>
              )}
              {block.type === 'social' && (
                <>
                  {[
                    ['url2', 'Instagram URL'],
                    ['url3', 'Facebook URL'],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        type="url"
                        value={block[key]}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </Field>
                  ))}
                </>
              )}
              <Field label="Alignment">
                <select
                  value={block.align}
                  onChange={(e) => update('align', e.target.value)}
                >
                  {['left', 'center', 'right'].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Typeface">
                <select
                  value={block.family}
                  onChange={(e) => update('family', e.target.value)}
                >
                  {fonts.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <div className="studio-property-grid">
                {[
                  [
                    'font',
                    block.type === 'spacer' ? 'Height' : 'Font size',
                    100,
                  ],
                  ['padding', 'Padding', 80],
                  ['margin', 'Top margin', 80],
                  ['radius', 'Border radius', 50],
                ].map(([key, label, max]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      min={0}
                      max={max}
                      value={block[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </Field>
                ))}
                {[
                  ['color', 'Text color'],
                  ['background', 'Background'],
                  ...(block.type === 'button'
                    ? [['buttonColor', 'Button color']]
                    : []),
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="color"
                      value={block[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <div className="studio-actions">
                <Action
                  disabled={blocks.indexOf(block) === 0}
                  onClick={() => move(block.id, blocks.indexOf(block) - 1)}
                >
                  Move up
                </Action>
                <Action
                  disabled={blocks.indexOf(block) === blocks.length - 1}
                  onClick={() => move(block.id, blocks.indexOf(block) + 1)}
                >
                  Move down
                </Action>
                <Action
                  disabled={blocks.length >= 100}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    commit((current) => [...current, { ...block, id }]);
                    setSelected(id);
                  }}
                >
                  Duplicate
                </Action>
                <Action
                  danger
                  onClick={() => {
                    commit((current) =>
                      current.filter((item) => item.id !== block.id),
                    );
                    setSelected(null);
                  }}
                >
                  Remove
                </Action>
              </div>
            </fieldset>
          )}
        </section>
      </div>
    </form>
  );
}
