import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Columns3,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Image,
  ImagePlus,
  Link2,
  MailMinus,
  MapPin,
  MessageCircle,
  Minus,
  MousePointer2,
  MoveVertical,
  Play,
  QrCode,
  Share2,
  ShoppingBag,
  Tag,
  Trash2,
  Type,
  UserRound,
  PanelBottom,
  Code2,
  ImageOff,
} from 'lucide-react';
import EmailPreviewFrame from './EmailPreview.jsx';
import { useMediaImage } from './EmailStudioDialogs.jsx';
import { Action, Field } from './workspace-ui.jsx';
import {
  blockLabels,
  buttonKinds,
  fonts,
  imageKinds,
  linkKinds,
  palette,
  studioRequest,
  variables,
} from './email-studio-model.js';

const icons = {
  heading: Heading1,
  subheading: Heading2,
  paragraph: Type,
  image: Image,
  logo: ImagePlus,
  button: MousePointer2,
  link: Link2,
  divider: Minus,
  spacer: MoveVertical,
  social: Share2,
  whatsapp: MessageCircle,
  contact: UserRound,
  html: Code2,
  video: Play,
  product: ShoppingBag,
  price: Tag,
  two: Columns2,
  three: Columns3,
  footer: PanelBottom,
  unsubscribe: MailMinus,
  address: MapPin,
  qr: QrCode,
};
export function ElementPalette({ onAdd, onMedia, canEdit }) {
  const [search, setSearch] = useState('');
  const match = search.trim().toLowerCase();
  const found = Object.values(palette)
    .flat()
    .some((type) => blockLabels[type].toLowerCase().includes(match));
  return (
    <aside
      className="email-editor-panel email-elements"
      aria-label="Content elements"
    >
      <div className="email-panel-heading">
        <div>
          <h2>Elements</h2>
          <p>Drag onto the canvas</p>
        </div>
      </div>
      <input
        className="email-mini-input"
        type="search"
        aria-label="Find an element"
        placeholder="Find an element"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="email-elements-scroll">
        {Object.entries(palette).map(([title, types]) => {
          const visible = types.filter((type) =>
            blockLabels[type].toLowerCase().includes(match),
          );
          if (!visible.length) return null;
          return (
            <section key={title}>
              <h3>{title}</h3>
              <div className="email-elements-grid">
                {visible.map((type) => {
                  const Icon = icons[type];
                  return (
                    <button
                      type="button"
                      key={type}
                      className="email-element-tile"
                      draggable={canEdit}
                      disabled={!canEdit}
                      onClick={() => onAdd(type)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-email-element',
                          type,
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <Icon size={19} strokeWidth={1.7} />
                      <span>{blockLabels[type]}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!found && <p className="studio-empty">No matching elements.</p>}
      </div>
      <Action onClick={onMedia}>
        <Image size={16} /> Media library
      </Action>
    </aside>
  );
}

function EditableText({ type, value, label, onChange, className }) {
  const ref = useRef(null);
  const active = useRef(false);
  useEffect(() => {
    if (
      ref.current &&
      !active.current &&
      ref.current.innerText !== (value || '')
    )
      ref.current.innerText = value || '';
  }, [value]);
  const Tag = type || 'div';
  return (
    <Tag
      ref={ref}
      className={'email-inline-editor ' + (className || '')}
      suppressContentEditableWarning
      role={onChange ? 'textbox' : undefined}
      aria-label={onChange ? label : undefined}
      contentEditable={onChange ? 'plaintext-only' : false}
      data-placeholder={label}
      onFocus={() => {
        active.current = true;
      }}
      onPaste={(event) => event.stopPropagation()}
      onBlur={(event) => {
        active.current = false;
        if (onChange && event.currentTarget.innerText !== (value || ''))
          onChange(event.currentTarget.innerText);
      }}
    />
  );
}

function CanvasImage({ block, selected, onChange, remote }) {
  const local = useMediaImage(block.mediaId);
  const [tempWidth, setTempWidth] = useState(null);
  const drag = useRef(null);
  const raw =
    block.imageUrl || (['image', 'logo'].includes(block.type) ? block.url : '');
  const source = local || (remote && /^https:\/\//i.test(raw || '') ? raw : '');
  const width =
    tempWidth ??
    (Number(block.imageWidth) || (block.type === 'logo' ? 144 : 560));
  if (!source)
    return (
      <div className="email-canvas-placeholder">
        <ImageOff size={24} />
        <span>{raw && !remote ? 'Remote image' : 'Select an image'}</span>
      </div>
    );
  return (
    <div className="email-canvas-image" style={{ width, maxWidth: '100%' }}>
      <img
        src={source}
        alt={block.alt || ''}
        style={{
          borderRadius: Number(block.imageRadius || block.radius || 0),
          height:
            block.keepRatio === false && Number(block.imageHeight)
              ? Number(block.imageHeight)
              : 'auto',
        }}
      />
      {selected && onChange && (
        <button
          type="button"
          aria-label="Drag to resize image"
          title="Drag to resize image"
          className="email-resize-handle"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const image = event.currentTarget.parentElement;
            drag.current = {
              x: event.clientX,
              width: image.clientWidth,
              scale:
                image.getBoundingClientRect().width / image.clientWidth || 1,
            };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setTempWidth(
                Math.max(
                  16,
                  Math.min(
                    1200,
                    Math.round(
                      drag.current.width +
                        (event.clientX - drag.current.x) / drag.current.scale,
                    ),
                  ),
                ),
              );
          }}
          onPointerUp={() => {
            if (tempWidth != null) onChange({ imageWidth: tempWidth });
            setTempWidth(null);
            drag.current = null;
          }}
          onPointerCancel={() => {
            setTempWidth(null);
            drag.current = null;
          }}
        />
      )}
    </div>
  );
}

function QrCanvas({ block }) {
  const [url, setUrl] = useState('');
  const hasValue = Boolean(
    block.content || block.linkValue || block.whatsappNumber,
  );
  useEffect(() => {
    if (!hasValue) return;
    let active = true;
    const timer = setTimeout(() => {
      studioRequest('render', { design: [block], designSettings: {} })
        .then((result) => {
          if (active)
            setUrl(
              result.html.match(/data:image\/png;base64,[a-z0-9+/=]+/i)?.[0] ||
                '',
            );
        })
        .catch(() => {
          if (active) setUrl('');
        });
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [block, hasValue]);
  return hasValue && url ? (
    <img
      className="email-inline-qr"
      src={url}
      width={block.imageWidth || 150}
      alt={block.alt || 'QR code'}
    />
  ) : (
    <div className="email-canvas-placeholder">
      <QrCode size={25} />
      <span>Enter QR content</span>
    </div>
  );
}

function VisualBlock({ block, selected, onChange, remote, mobile }) {
  const { type } = block;
  const text = (key = 'content', Tag) => (
    <EditableText
      type={Tag}
      value={block[key]}
      label={key === 'content' ? blockLabels[type] : key}
      onChange={onChange ? (value) => onChange({ [key]: value }) : undefined}
    />
  );
  const avatar = () => (
    <CanvasImage
      block={block}
      selected={selected}
      onChange={onChange}
      remote={remote}
    />
  );
  const button = (key = 'content') => (
    <div
      className="email-canvas-cta"
      style={{
        background: block.buttonColor || '#2858e4',
        color: block.buttonTextColor || 'white',
        borderRadius: Number(block.buttonRadius ?? block.radius ?? 7),
        padding:
          (block.buttonPadding ?? 12) +
          'px ' +
          (block.buttonPaddingX ?? 22) +
          'px',
      }}
    >
      {type === 'whatsapp' && <MessageCircle size={18} />}
      {text(key, 'span')}
    </div>
  );
  if (type === 'image' || type === 'logo') return avatar();
  if (type === 'button' || type === 'whatsapp') return button();
  if (type === 'divider')
    return (
      <hr
        className="email-canvas-line"
        style={{ borderColor: block.color || '#d6e0ee' }}
      />
    );
  if (type === 'spacer')
    return (
      <div
        className="email-canvas-spacer"
        style={{ height: Number(block.imageHeight || block.font || 24) }}
      />
    );
  if (type === 'two' || type === 'three') {
    const keys =
      type === 'two' ? ['content', 'second'] : ['content', 'second', 'third'];
    return (
      <div
        className="email-canvas-columns"
        style={{
          gridTemplateColumns: mobile
            ? '1fr'
            : 'repeat(' + keys.length + ', minmax(0, 1fr))',
        }}
      >
        {keys.map((key) => (
          <div key={key}>{text(key)}</div>
        ))}
      </div>
    );
  }
  if (type === 'html')
    return (
      <EmailPreviewFrame
        htmlBody={block.content}
        title="Imported HTML block"
        className="email-raw-block"
        showRemoteImages={remote}
      />
    );
  if (type === 'qr') return <QrCanvas block={block} />;
  if (type === 'social')
    return (
      <div className="email-canvas-social">
        {[
          ['LinkedIn', block.url, 'in'],
          ['Instagram', block.url2, '◎'],
          ['Facebook', block.url3, 'f'],
        ].map(([name, url, icon]) => (
          <span className={url ? 'configured' : ''} key={name}>
            <b aria-hidden="true">{icon}</b>
            {name}
          </span>
        ))}
      </div>
    );
  if (type === 'video')
    return (
      <div className="email-canvas-product">
        {avatar()}
        {button()}
      </div>
    );
  if (type === 'product' || type === 'price')
    return (
      <div className="email-canvas-product">
        {avatar()}
        <strong>{text()}</strong>
        <span
          className="email-product-price"
          style={{ color: block.priceColor || '#2858e4' }}
        >
          {text('price')}
        </span>
        {type === 'product' && (
          <>
            {text('description')}
            {button('buttonText')}
          </>
        )}
      </div>
    );
  if (type === 'contact')
    return (
      <div className="email-canvas-contact">
        {text()}
        <small>{block.contactEmail}</small>
        <small>{block.contactPhone}</small>
        {block.whatsappNumber && (
          <span>
            <MessageCircle size={14} />
            {block.buttonText || 'Chat on WhatsApp'}
          </span>
        )}
      </div>
    );
  if (type === 'link' || type === 'unsubscribe')
    return <div className="email-canvas-link">{text()}</div>;
  return text(
    'content',
    type === 'heading' ? 'h1' : type === 'subheading' ? 'h2' : 'div',
  );
}

export function EmailCanvas({
  design,
  settings,
  selected,
  onSelect,
  onDrop,
  onMove,
  onDuplicate,
  onDelete,
  onPatch,
  canEdit,
  width,
  zoom,
  remote,
  mobile,
}) {
  const [over, setOver] = useState(null);
  const prevent = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    if (over !== index) setOver(index);
  };
  function drop(event, index) {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    if (canEdit) onDrop(event, index);
  }
  return (
    <div
      className="email-canvas-zone"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOver(null);
      }}
      onDragEnd={() => setOver(null)}
    >
      <div
        className="email-canvas-board"
        style={{
          maxWidth: width + 28,
          background: settings.background,
          zoom: zoom / 100,
        }}
        onDragOver={(event) => prevent(event, design.length)}
        onDrop={(event) => drop(event, design.length)}
      >
        <div
          className="email-message"
          style={{
            width,
            maxWidth: '100%',
            background: settings.contentBackground,
            color: settings.color,
            fontFamily: settings.family,
            fontSize: settings.fontSize,
            border: settings.border + 'px solid ' + settings.borderColor,
            borderRadius: settings.radius,
          }}
        >
          {settings.header && (
            <div className="email-layout-copy">{settings.header}</div>
          )}
          {!design.length && (
            <div className="email-canvas-empty">
              <ImagePlus size={30} />
              <strong>Build your email here</strong>
              <span>Choose or drop an element to get started.</span>
            </div>
          )}
          {design.map((block, index) => {
            const active = selected === block.id;
            return (
              <div
                key={block.id}
                role="group"
                aria-label={blockLabels[block.type]}
                className={
                  'email-canvas-row' +
                  (active ? ' selected' : '') +
                  (over === index ? ' drop-target' : '')
                }
                onClick={() => onSelect(block.id)}
                onFocus={() => onSelect(block.id)}
                style={{ marginTop: block.margin || 0 }}
                onDragOver={(event) => prevent(event, index)}
                onDrop={(event) => drop(event, index)}
              >
                {canEdit && (
                  <div className="email-block-tools">
                    <button
                      type="button"
                      draggable
                      title="Drag block"
                      aria-label="Drag block"
                      className="email-drag-handle"
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-email-block',
                          block.id,
                        );
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <GripVertical size={15} />
                    </button>
                    <span>{blockLabels[block.type]}</span>
                    <button
                      type="button"
                      title="Move up"
                      aria-label="Move block up"
                      disabled={index === 0}
                      onClick={() => onMove(block.id, index - 1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label="Move block down"
                      disabled={index === design.length - 1}
                      onClick={() => onMove(block.id, index + 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      title="Duplicate block"
                      aria-label="Duplicate block"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDuplicate(block);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      title="Delete block"
                      aria-label="Delete block"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(block.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                <div
                  className="email-block-content"
                  style={{
                    textAlign: block.align || 'left',
                    padding: block.padding ?? settings.spacing,
                    background: block.background || 'transparent',
                    color: block.color || settings.color,
                    fontFamily: block.family || settings.family,
                    fontSize: block.font || settings.fontSize,
                    fontWeight:
                      block.weight ?? (block.type === 'heading' ? 700 : 400),
                    fontStyle: block.italic ? 'italic' : 'normal',
                    textDecoration: block.underline ? 'underline' : 'none',
                    lineHeight: block.lineHeight || 1.45,
                    letterSpacing: (block.letterSpacing || 0) + 'px',
                    borderRadius: block.radius || 0,
                  }}
                >
                  <VisualBlock
                    block={block}
                    selected={active}
                    onChange={
                      canEdit ? (value) => onPatch(block.id, value) : undefined
                    }
                    remote={remote}
                    mobile={mobile}
                  />
                </div>
              </div>
            );
          })}
          {settings.footer && (
            <div className="email-layout-copy">{settings.footer}</div>
          )}
        </div>
        {canEdit && (
          <div
            className={
              'email-canvas-end' +
              (over === design.length ? ' drop-target' : '')
            }
          >
            Drop element here
          </div>
        )}
      </div>
    </div>
  );
}

function Control({
  type = 'text',
  label,
  value,
  onChange,
  options,
  min,
  max,
  step,
  rows = 3,
}) {
  const update = (event) =>
    onChange(
      type === 'number' && event.target.value !== ''
        ? Number(event.target.value)
        : event.target.value,
    );
  return (
    <Field label={label}>
      {type === 'select' ? (
        <select value={value ?? ''} onChange={update}>
          {options.map((item) => (
            <option
              key={Array.isArray(item) ? item[0] : item}
              value={Array.isArray(item) ? item[0] : item}
            >
              {Array.isArray(item) ? item[1] : item}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={value || ''} onChange={update} rows={rows} />
      ) : (
        <input
          type={type}
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          onChange={update}
        />
      )}
    </Field>
  );
}

export function Inspector({
  block,
  settings,
  tab,
  onTab,
  onPatch,
  onSettings,
  onLink,
  onMedia,
  canEdit,
}) {
  const bind = (key, label, options = {}) => (
    <Control
      key={key}
      label={label}
      value={block[key] ?? options.fallback}
      onChange={(value) => onPatch({ [key]: value })}
      {...options}
    />
  );
  const theme = (key, label, options) => (
    <Control
      key={key}
      label={label}
      value={settings[key]}
      onChange={(value) => onSettings({ [key]: value })}
      {...options}
    />
  );
  const isImage = block && imageKinds.includes(block.type);
  const isButton = block && buttonKinds.includes(block.type);
  const hasContent =
    block &&
    !['divider', 'spacer', 'social', 'image', 'logo'].includes(block.type);
  return (
    <aside
      className="email-editor-panel email-inspector"
      aria-label="Email properties"
    >
      <div className="email-panel-heading">
        <h2>Properties</h2>
      </div>
      <div className="email-panel-tabs">
        <button
          type="button"
          aria-pressed={tab === 'block'}
          onClick={() => onTab('block')}
        >
          Selected block
        </button>
        <button
          type="button"
          aria-pressed={tab === 'design'}
          onClick={() => onTab('design')}
        >
          Email design
        </button>
      </div>
      <div className="email-properties-scroll">
        {tab === 'design' ? (
          <fieldset disabled={!canEdit}>
            <h3>Layout</h3>
            <div className="studio-actions">
              <Action
                onClick={() =>
                  onSettings({
                    background: '#eaf0fa',
                    contentBackground: '#ffffff',
                    color: '#172848',
                    borderColor: '#d9e3f2',
                  })
                }
              >
                Light
              </Action>
              <Action
                onClick={() =>
                  onSettings({
                    background: '#10182a',
                    contentBackground: '#1b2943',
                    color: '#ecf4ff',
                    borderColor: '#32456b',
                  })
                }
              >
                Dark
              </Action>
            </div>
            <div className="email-property-pair">
              {theme('background', 'Email background', { type: 'color' })}
              {theme('contentBackground', 'Content background', {
                type: 'color',
              })}
              {theme('width', 'Width (px)', {
                type: 'number',
                min: 320,
                max: 820,
              })}
              {theme('spacing', 'Section padding', {
                type: 'number',
                min: 0,
                max: 56,
              })}
              {theme('border', 'Border width', {
                type: 'number',
                min: 0,
                max: 8,
              })}
              {theme('borderColor', 'Border color', { type: 'color' })}
              {theme('radius', 'Corner radius', {
                type: 'number',
                min: 0,
                max: 44,
              })}
              {theme('mobilePadding', 'Mobile padding', {
                type: 'number',
                min: 0,
                max: 36,
              })}
            </div>
            <h3>Default typography</h3>
            {theme('family', 'Font family', { type: 'select', options: fonts })}
            <div className="email-property-pair">
              {theme('fontSize', 'Font size', {
                type: 'number',
                min: 9,
                max: 44,
              })}
              {theme('color', 'Text color', { type: 'color' })}
            </div>
            <h3>Header and footer</h3>
            {theme('header', 'Header text', { type: 'textarea' })}
            {theme('footer', 'Footer text', { type: 'textarea' })}
            {theme('css', 'Custom email CSS', { type: 'textarea', rows: 7 })}
          </fieldset>
        ) : !block ? (
          <p className="studio-empty">
            Select a block on the canvas to edit its properties.
          </p>
        ) : (
          <fieldset disabled={!canEdit}>
            <h3>{blockLabels[block.type]}</h3>
            {hasContent && (
              <>
                {bind(
                  'content',
                  block.type === 'html'
                    ? 'HTML source'
                    : block.type === 'qr'
                      ? 'QR content'
                      : 'Content',
                  { type: 'textarea', rows: block.type === 'html' ? 10 : 3 },
                )}
                <Field label="Insert personalization">
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value)
                        onPatch({
                          content:
                            (block.content || '') +
                            '{{' +
                            event.target.value +
                            '}}',
                        });
                    }}
                  >
                    <option value="">Variable…</option>
                    {variables.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {['two', 'three'].includes(block.type) &&
              bind('second', 'Column two', { type: 'textarea' })}
            {block.type === 'three' &&
              bind('third', 'Column three', { type: 'textarea' })}
            {isImage && (
              <>
                <Action onClick={onMedia}>
                  <Image size={15} />{' '}
                  {block.mediaId || block.imageUrl || block.url
                    ? 'Replace image'
                    : 'Choose or upload image'}
                </Action>
                <Field label="Image URL">
                  <input
                    type="url"
                    value={
                      block.imageUrl ||
                      (['image', 'logo'].includes(block.type)
                        ? block.url
                        : '') ||
                      ''
                    }
                    onChange={(event) =>
                      onPatch({
                        imageUrl: event.target.value,
                        mediaId: '',
                        ...(['image', 'logo'].includes(block.type)
                          ? { url: '' }
                          : {}),
                      })
                    }
                  />
                </Field>
                {bind('alt', 'Alt text', {
                  fallback: ['image', 'logo'].includes(block.type)
                    ? block.content
                    : '',
                })}
                <div className="email-property-pair">
                  {bind('imageWidth', 'Width (px)', {
                    type: 'number',
                    min: 16,
                    max: 1200,
                  })}
                  {block.keepRatio === false &&
                    bind('imageHeight', 'Height (px)', {
                      type: 'number',
                      min: 0,
                      max: 1500,
                    })}
                  {bind('imageRadius', 'Image radius', {
                    type: 'number',
                    min: 0,
                    max: 60,
                    fallback: block.radius ?? 0,
                  })}
                </div>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={block.keepRatio !== false}
                    onChange={(event) =>
                      onPatch({ keepRatio: event.target.checked })
                    }
                  />{' '}
                  Keep aspect ratio
                </label>
                <Action
                  danger
                  onClick={() =>
                    onPatch({
                      mediaId: '',
                      imageUrl: '',
                      ...(['image', 'logo'].includes(block.type)
                        ? { url: '' }
                        : {}),
                    })
                  }
                >
                  Remove image
                </Action>
              </>
            )}
            {block.type === 'qr' && (
              <>
                {bind('alt', 'Alt text', { fallback: 'QR code' })}
                {bind('imageWidth', 'QR size (px)', {
                  type: 'number',
                  min: 80,
                  max: 400,
                })}
              </>
            )}
            {block.type === 'spacer' &&
              bind('imageHeight', 'Height', {
                type: 'number',
                min: 4,
                max: 180,
              })}
            {block.type === 'social' &&
              [
                ['url', 'LinkedIn URL'],
                ['url2', 'Instagram URL'],
                ['url3', 'Facebook URL'],
              ].map(([key, label]) => bind(key, label, { type: 'url' }))}
            {block.type === 'contact' && (
              <>
                {bind('contactEmail', 'Email', { type: 'email' })}
                {bind('contactPhone', 'Phone', { type: 'tel' })}
                {bind('buttonText', 'WhatsApp label')}
              </>
            )}
            {['contact', 'whatsapp'].includes(block.type) && (
              <>
                {bind('whatsappNumber', 'WhatsApp number', { type: 'tel' })}
                {bind('whatsappMessage', 'Pre-filled message', {
                  type: 'textarea',
                })}
              </>
            )}
            {['product', 'price'].includes(block.type) && (
              <>
                {bind('price', 'Price')}
                {bind('priceColor', 'Price color', {
                  type: 'color',
                  fallback: '#2858e4',
                })}
              </>
            )}
            {block.type === 'product' && (
              <>
                {bind('description', 'Product description', {
                  type: 'textarea',
                })}
                {bind('buttonText', 'Button text')}
              </>
            )}
            {linkKinds.includes(block.type) && (
              <Action onClick={onLink}>
                <Link2 size={15} />{' '}
                {block.linkValue || block.whatsappNumber
                  ? 'Edit link'
                  : 'Add link'}
              </Action>
            )}
            {isButton && (
              <>
                <h3>Button style</h3>
                <div className="email-property-pair">
                  {bind('buttonColor', 'Button color', {
                    type: 'color',
                    fallback: '#2858e4',
                  })}
                  {bind('buttonTextColor', 'Button text', {
                    type: 'color',
                    fallback: '#ffffff',
                  })}
                  {bind('hoverColor', 'Hover color', {
                    type: 'color',
                    fallback: '#19389e',
                  })}
                  {bind('buttonRadius', 'Button radius', {
                    type: 'number',
                    min: 0,
                    max: 60,
                    fallback: 7,
                  })}
                  {bind('buttonPadding', 'Vertical padding', {
                    type: 'number',
                    min: 3,
                    max: 38,
                    fallback: 12,
                  })}
                  {bind('buttonPaddingX', 'Side padding', {
                    type: 'number',
                    min: 8,
                    max: 70,
                    fallback: 22,
                  })}
                </div>
              </>
            )}
            <h3>Typography and spacing</h3>
            {bind('family', 'Font family', {
              type: 'select',
              options: [['', 'Default font'], ...fonts],
            })}
            <div className="email-property-pair">
              {bind('font', 'Font size', {
                type: 'number',
                min: 8,
                max: 80,
                fallback: settings.fontSize,
              })}
              {bind('weight', 'Font weight', {
                type: 'select',
                options: [
                  [400, 'Regular'],
                  [500, 'Medium'],
                  [600, 'Semibold'],
                  [700, 'Bold'],
                  [800, 'Extra bold'],
                ],
                fallback: 400,
              })}
              {bind('lineHeight', 'Line height', {
                type: 'number',
                min: 0.9,
                max: 3,
                step: 0.05,
                fallback: 1.45,
              })}
              {bind('letterSpacing', 'Letter spacing', {
                type: 'number',
                min: -2,
                max: 12,
                step: 0.1,
                fallback: 0,
              })}
              {bind('color', 'Text color', {
                type: 'color',
                fallback: settings.color,
              })}
              {bind('background', 'Block background', {
                type: 'color',
                fallback: settings.contentBackground,
              })}
            </div>
            <div className="studio-actions">
              <Action
                aria-pressed={Number(block.weight) >= 700}
                onClick={() =>
                  onPatch({ weight: Number(block.weight) >= 700 ? 400 : 700 })
                }
              >
                <b>Bold</b>
              </Action>
              <Action
                aria-pressed={block.italic === true}
                onClick={() => onPatch({ italic: block.italic !== true })}
              >
                <i>Italic</i>
              </Action>
              <Action
                aria-pressed={block.underline === true}
                onClick={() => onPatch({ underline: block.underline !== true })}
              >
                <u>Underline</u>
              </Action>
            </div>
            {bind('align', 'Alignment', {
              type: 'select',
              options: ['left', 'center', 'right'],
            })}
            <div className="email-property-pair">
              {bind('padding', 'Padding', {
                type: 'number',
                min: 0,
                max: 100,
                fallback: settings.spacing,
              })}
              {bind('margin', 'Top margin', {
                type: 'number',
                min: 0,
                max: 100,
                fallback: 0,
              })}
              {bind('radius', 'Block radius', {
                type: 'number',
                min: 0,
                max: 60,
                fallback: 0,
              })}
            </div>
          </fieldset>
        )}
      </div>
    </aside>
  );
}
