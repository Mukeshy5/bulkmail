import { useEffect, useRef, useState } from 'react';
import {
  Crop,
  ExternalLink,
  Expand,
  Image,
  Maximize2,
  Minimize2,
  Monitor,
  Smartphone,
  Tablet,
  Upload,
} from 'lucide-react';
import EmailPreviewFrame, { sampleRecipient } from './EmailPreview.jsx';
import { formatDate, Modal, useToast } from './ui.jsx';
import { Action, ErrorText, Field } from './workspace-ui.jsx';
import { devices, mediaRequest, studioRequest } from './email-studio-model.js';

const deviceIcons = { Desktop: Monitor, Tablet, Mobile: Smartphone };
export function DeviceButtons({ value, onChange }) {
  return (
    <div className="email-device-buttons" aria-label="Preview device">
      {Object.entries(deviceIcons).map(([name, Icon]) => (
        <button
          type="button"
          key={name}
          title={name}
          aria-label={name + ' preview'}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}

export function PreviewDialog({
  html,
  title = 'Email preview',
  subject,
  onClose,
  initialDevice = 'Desktop',
}) {
  const [device, setDevice] = useState(initialDevice);
  const [wide, setWide] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [fullScreenError, setFullScreenError] = useState('');
  const [remote, setRemote] = useState(false);
  const [recipient, setRecipient] = useState(sampleRecipient);
  const previewSurface = useRef(null);

  useEffect(() => {
    function syncFullScreen() {
      setFullScreen(document.fullscreenElement === previewSurface.current);
    }
    document.addEventListener('fullscreenchange', syncFullScreen);
    return () =>
      document.removeEventListener('fullscreenchange', syncFullScreen);
  }, []);

  async function toggleFullScreen() {
    const surface = previewSurface.current;
    if (!surface) return;
    setFullScreenError('');
    try {
      if (document.fullscreenElement === surface) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await surface.requestFullscreen();
      }
    } catch {
      setFullScreenError('Full-screen preview is unavailable in this window.');
    }
  }

  function close() {
    if (document.fullscreenElement === previewSurface.current) {
      document.exitFullscreen().catch(() => {
        setFullScreenError(
          'Could not exit full-screen preview. Press Esc to return.',
        );
      });
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={title}
      onClose={close}
      size={wide ? 'max-w-[96vw]' : 'max-w-5xl'}
    >
      <div className="email-dialog-toolbar">
        <DeviceButtons value={device} onChange={setDevice} />
        <Action aria-pressed={wide} onClick={() => setWide(!wide)}>
          <Maximize2 size={15} />
          {wide ? 'Default width' : 'Wide preview'}
        </Action>
        <Action
          aria-pressed={fullScreen}
          onClick={toggleFullScreen}
          title={
            fullScreen ? 'Exit full-screen preview' : 'Open full-screen preview'
          }
        >
          {fullScreen ? <Minimize2 size={15} /> : <Expand size={15} />}
          {fullScreen ? 'Exit full screen' : 'Open full screen'}
        </Action>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
          />{' '}
          Load remote images
        </label>
      </div>
      {subject && (
        <p className="email-preview-subject">
          Subject <strong>{subject}</strong>
        </p>
      )}
      <ErrorText text={fullScreenError} />
      <div className="email-preview-surface" ref={previewSurface}>
        <EmailPreviewFrame
          htmlBody={html}
          title={title}
          showRemoteImages={remote}
          recipient={recipient}
          className="email-device-preview"
          style={{
            width: devices[device] || '100%',
            height: wide ? '68vh' : '52vh',
          }}
        />
        {fullScreen && (
          <button
            type="button"
            className="email-fullscreen-exit"
            onClick={toggleFullScreen}
          >
            <Minimize2 size={15} /> Exit full screen
          </button>
        )}
      </div>
      <details className="email-sample-data">
        <summary>Sample recipient data</summary>
        <div className="email-compact-fields">
          {['first_name', 'last_name', 'email', 'company', 'phone'].map(
            (key) => (
              <Field key={key} label={key.replaceAll('_', ' ')}>
                <input
                  value={recipient[key]}
                  onChange={(event) =>
                    setRecipient({
                      ...recipient,
                      [key]: event.target.value,
                      ...(key === 'first_name'
                        ? {
                            full_name:
                              event.target.value + ' ' + recipient.last_name,
                          }
                        : key === 'last_name'
                          ? {
                              full_name:
                                recipient.first_name + ' ' + event.target.value,
                            }
                          : {}),
                    })
                  }
                />
              </Field>
            ),
          )}
        </div>
      </details>
    </Modal>
  );
}

export function LinkDialog({ block, onApply, onClose }) {
  const [form, setForm] = useState({
    linkType: block.linkType || 'website',
    linkText: block.linkText || '',
    linkValue:
      block.linkValue ||
      (['image', 'logo'].includes(block.type) ? '' : block.url) ||
      '',
    whatsappNumber: block.whatsappNumber || '',
    whatsappMessage: block.whatsappMessage || '',
    mailSubject: block.mailSubject || '',
    target: block.target || '_blank',
    utmSource: block.utmSource || '',
    utmMedium: block.utmMedium || '',
    utmCampaign: block.utmCampaign || '',
    utmContent: block.utmContent || '',
    utmTerm: block.utmTerm || '',
  });
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('');
  const getValue = (key) => ({
    value: form[key],
    onChange: (event) => {
      setForm({ ...form, [key]: event.target.value });
      setDestination('');
    },
  });
  const whatsapp = block.type === 'whatsapp' || form.linkType === 'whatsapp';
  const isUrl =
    ['website', 'redirect', 'social'].includes(form.linkType) && !whatsapp;
  const canLinkPhrase = [
    'heading',
    'subheading',
    'paragraph',
    'footer',
    'address',
  ].includes(block.type);
  async function action(kind) {
    setError('');
    try {
      if (kind === 'open') {
        await studioRequest('openLink', { type: block.type, ...form });
        return;
      }
      const result = await studioRequest('link', { type: block.type, ...form });
      if (!result.url)
        throw new Error('Enter a valid destination for this link type.');
      if (
        kind === 'apply' &&
        form.linkText.trim() &&
        !block.content?.includes(form.linkText.trim())
      )
        throw new Error('The phrase must match text in the selected block.');
      setDestination(result.url);
      if (kind === 'apply') onApply(form);
    } catch (cause) {
      setError(cause.message);
    }
  }
  return (
    <Modal title="Link settings" onClose={onClose}>
      <div className="studio-form">
        {!['whatsapp'].includes(block.type) && (
          <Field label="Destination type">
            <select {...getValue('linkType')}>
              <option value="website">Website URL</option>
              <option value="redirect">Redirect URL</option>
              <option value="email">Email address</option>
              <option value="phone">Phone number</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="social">Social media</option>
            </select>
          </Field>
        )}
        <Field label="Open link">
          <select {...getValue('target')}>
            <option value="_blank">New tab or window</option>
            <option value="_self">Same tab</option>
          </select>
        </Field>
        {canLinkPhrase && (
          <Field label="Text to link (optional)" wide>
            <input
              {...getValue('linkText')}
              maxLength={200}
              placeholder="Leave blank to link the whole block"
            />
          </Field>
        )}
        {whatsapp ? (
          <>
            <Field label="WhatsApp number with country code">
              <input
                type="tel"
                placeholder="+91…"
                {...getValue('whatsappNumber')}
              />
            </Field>
            <Field label="Pre-filled message" wide>
              <textarea
                rows={3}
                maxLength={1000}
                {...getValue('whatsappMessage')}
              />
            </Field>
          </>
        ) : (
          <>
            <Field
              label={
                form.linkType === 'email'
                  ? 'Email address'
                  : form.linkType === 'phone'
                    ? 'Phone number'
                    : 'Destination URL'
              }
              wide
            >
              <input
                placeholder={isUrl ? 'https://example.com' : undefined}
                maxLength={2048}
                {...getValue('linkValue')}
              />
            </Field>
            {form.linkType === 'email' && (
              <Field label="Email subject" wide>
                <input maxLength={150} {...getValue('mailSubject')} />
              </Field>
            )}
          </>
        )}
        {isUrl && (
          <details className="studio-wide email-sample-data">
            <summary>UTM tracking parameters</summary>
            <div className="email-compact-fields">
              {[
                'utmSource',
                'utmMedium',
                'utmCampaign',
                'utmContent',
                'utmTerm',
              ].map((key) => (
                <Field key={key} label={key.replace('utm', 'UTM ')}>
                  <input maxLength={120} {...getValue(key)} />
                </Field>
              ))}
            </div>
          </details>
        )}
        {destination && (
          <output className="email-link-output studio-wide">
            {destination}
          </output>
        )}
        <ErrorText text={error} />
        <div className="studio-wide studio-actions email-dialog-toolbar">
          <Action onClick={() => action('preview')}>Preview destination</Action>
          {destination && (
            <Action onClick={() => action('open')}>
              <ExternalLink size={14} /> Open link
            </Action>
          )}
          <Action
            danger
            onClick={() =>
              onApply({
                linkText: '',
                linkValue: '',
                linkUrl: '',
                ...(['image', 'logo'].includes(block.type) ? {} : { url: '' }),
                whatsappNumber: '',
                whatsappMessage: '',
                mailSubject: '',
                utmSource: '',
                utmMedium: '',
                utmCampaign: '',
                utmContent: '',
                utmTerm: '',
              })
            }
          >
            Remove link
          </Action>
          <Action primary onClick={() => action('apply')}>
            Apply link
          </Action>
        </div>
      </div>
    </Modal>
  );
}

const assetCache = new Map();
export function useMediaImage(id) {
  const [asset, setAsset] = useState(null);
  useEffect(() => {
    if (!id || assetCache.has(id)) return;
    let live = true;
    mediaRequest('get', { id, preview: true })
      .then((result) => {
        if (assetCache.size >= 40)
          assetCache.delete(assetCache.keys().next().value);
        assetCache.set(id, result.dataUrl);
        if (live) setAsset({ id, url: result.dataUrl });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return assetCache.get(id) || (asset?.id === id ? asset.url : '');
}

function MediaTile({ row, onPick, onCrop, onDelete, canEdit }) {
  const image = useMediaImage(row.id);
  return (
    <article className="email-asset">
      <button
        type="button"
        className="email-asset-picture"
        onClick={() => onPick(row)}
        title={'Use ' + row.name}
      >
        {image ? <img src={image} alt={row.name} /> : <Image size={23} />}
      </button>
      <div className="email-asset-details">
        <strong title={row.name}>{row.name}</strong>
        <small>
          {row.width} × {row.height} px · {(row.sizeBytes / 1024).toFixed(1)} KB
        </small>
      </div>
      <div className="studio-actions">
        <Action onClick={() => onPick(row)}>Use image</Action>
        {canEdit && (
          <>
            <Action onClick={() => onCrop(row)} title="Crop and resize">
              <Crop size={14} />
            </Action>
            <Action danger onClick={() => onDelete(row)}>
              Delete
            </Action>
          </>
        )}
      </div>
    </article>
  );
}

export function MediaLibrary({ onPick, onClose, canEdit }) {
  const input = useRef(null);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [crop, setCrop] = useState(null);
  const [limit, setLimit] = useState(24);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        mediaRequest('list', search)
          .then((result) => {
            if (active) setItems(result.media);
          })
          .catch((cause) => {
            if (active) setError(cause.message);
          }),
      120,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, revision]);

  async function upload(file) {
    if (!file || busy || !canEdit) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image up to 5 MB.');
      return;
    }
    setBusy(true);
    try {
      await mediaRequest('upload', {
        name: file.name,
        fileData: new Uint8Array(await file.arrayBuffer()),
      });
      setSearch('');
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item) {
    if (
      !window.confirm(
        'Remove this image from the library? Existing designs can still use it.',
      )
    )
      return;
    try {
      await mediaRequest('delete', item.id);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause.message);
    }
  }

  if (crop)
    return (
      <CropDialog
        media={crop}
        onClose={() => setCrop(null)}
        onSaved={() => {
          setCrop(null);
          setSearch('');
          setRevision((value) => value + 1);
        }}
      />
    );
  return (
    <Modal title="Media library" onClose={onClose} size="max-w-5xl">
      <div className="email-dialog-toolbar">
        <Field label="Search images">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by filename"
          />
        </Field>
        {canEdit && (
          <>
            <input
              hidden
              type="file"
              ref={input}
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(event) => {
                const file = event.target.files[0];
                event.target.value = '';
                upload(file);
              }}
            />
            <Action
              primary
              disabled={busy}
              onClick={() => input.current.click()}
            >
              <Upload size={15} /> {busy ? 'Uploading…' : 'Upload image'}
            </Action>
          </>
        )}
      </div>
      {canEdit && (
        <div
          className="email-upload-target"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            upload(event.dataTransfer.files[0]);
          }}
        >
          <Image size={19} />
          <span>Drop JPG, PNG, GIF or WebP images here</span>
          <small>Up to 5 MB per file</small>
        </div>
      )}
      <ErrorText text={error} />
      {items === null ? (
        <p className="studio-empty">Loading images…</p>
      ) : !items.length ? (
        <p className="studio-empty">No images found.</p>
      ) : (
        <>
          <div className="email-asset-grid">
            {items.slice(0, limit).map((row) => (
              <MediaTile
                key={row.id}
                row={row}
                onPick={onPick}
                onCrop={setCrop}
                onDelete={remove}
                canEdit={canEdit}
              />
            ))}
          </div>
          {items.length > limit && (
            <div className="email-dialog-toolbar">
              <Action onClick={() => setLimit(limit + 24)}>Load more</Action>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function CropDialog({ media, onClose, onSaved }) {
  const source = useMediaImage(media.id);
  const origin = useRef(null);
  const [crop, setCrop] = useState({
    left: 0,
    top: 0,
    width: media.width,
    height: media.height,
    outputWidth: Math.min(media.width, 2400),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function point(event) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          media.width,
          Math.round(((event.clientX - box.left) * media.width) / box.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          media.height,
          Math.round(((event.clientY - box.top) * media.height) / box.height),
        ),
      ),
    };
  }
  function move(event) {
    if (!origin.current) return;
    const end = point(event);
    const start = origin.current;
    setCrop((value) => ({
      ...value,
      left: Math.min(end.x, start.x),
      top: Math.min(end.y, start.y),
      width: Math.max(1, Math.abs(end.x - start.x)),
      height: Math.max(1, Math.abs(end.y - start.y)),
    }));
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mediaRequest('crop', { id: media.id, ...crop });
      onSaved();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Crop and resize image" onClose={onClose}>
      {source && (
        <div
          className="email-crop-surface"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            origin.current = point(event);
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            move(event);
            origin.current = null;
          }}
          onPointerCancel={() => {
            origin.current = null;
          }}
        >
          <img src={source} alt={media.name} />
          <div
            className="email-crop-selection"
            aria-hidden="true"
            style={{
              left: (crop.left / media.width) * 100 + '%',
              top: (crop.top / media.height) * 100 + '%',
              width: (crop.width / media.width) * 100 + '%',
              height: (crop.height / media.height) * 100 + '%',
            }}
          />
        </div>
      )}
      <form className="studio-form" onSubmit={save}>
        {Object.entries({
          left: 'Crop left (px)',
          top: 'Crop top (px)',
          width: 'Crop width (px)',
          height: 'Crop height (px)',
          outputWidth: 'Output width (px)',
        }).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              required
              type="number"
              min={key === 'left' || key === 'top' ? 0 : 1}
              value={crop[key]}
              onChange={(event) =>
                setCrop({ ...crop, [key]: Number(event.target.value) })
              }
            />
          </Field>
        ))}
        <ErrorText text={error} />
        <div className="studio-wide studio-actions">
          <Action type="submit" primary disabled={busy}>
            Save cropped copy
          </Action>
        </div>
      </form>
    </Modal>
  );
}

export function TestDialog({
  html,
  suggestedSubject,
  text,
  userEmail,
  onClose,
}) {
  const [recipient, setRecipient] = useState(userEmail || '');
  const [subject, setSubject] = useState(suggestedSubject || '');
  const [accounts, setAccounts] = useState([]);
  const [smtpAccountId, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  useEffect(() => {
    let active = true;
    window.bulkMail.smtpAccounts
      .list()
      .then((result) => {
        if (active && result.ok) {
          const connected = result.accounts.filter(
            (account) =>
              account.isEnabled &&
              account.connectionStatus === 'connected' &&
              account.encryption !== 'none',
          );
          setAccounts(connected);
          setAccount(
            (connected.find((row) => row.isDefault) || connected[0])?.id || '',
          );
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await studioRequest('test', {
        recipient,
        subject,
        html,
        text,
        smtpAccountId,
      });
      toast('SMTP accepted the test email.');
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Send a test email" onClose={onClose}>
      <form className="studio-form" onSubmit={submit}>
        <Field label="Test recipient">
          <input
            type="email"
            required
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
        </Field>
        <Field label="SMTP account">
          <select
            required
            value={smtpAccountId}
            onChange={(event) => setAccount(event.target.value)}
          >
            <option value="">Select a tested account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Test subject" wide>
          <input
            required
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <ErrorText text={error} />
        <div className="studio-wide studio-actions">
          <Action primary type="submit" disabled={busy || !accounts.length}>
            {busy ? 'Submitting…' : 'Send test email'}
          </Action>
        </div>
        {!accounts.length && (
          <p className="studio-wide studio-muted">
            Add and test an enabled TLS account in SMTP Accounts.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function ChecksDialog({ html, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    studioRequest('inspect', { html })
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [html]);
  async function live() {
    setBusy(true);
    setError('');
    try {
      setReport(await studioRequest('inspect', { html, remote: true }));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Email design checks" onClose={onClose}>
      <ErrorText text={error} />
      <div className="email-dialog-toolbar">
        <Action onClick={live} disabled={busy || !report?.links.length}>
          {busy ? 'Checking URLs…' : 'Check live URLs'}
        </Action>
      </div>
      {report && (
        <div className="email-check-list">
          {report.warnings.length ? (
            <ul>
              {report.warnings.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p>No structural issues found.</p>
          )}
          {report.checked.map((row) => (
            <div key={row.url}>
              <strong>{row.issue || 'Responding'}</strong>
              <small>{row.url}</small>
            </div>
          ))}
          {report.checked.length > 0 &&
            report.links.length > report.checked.length && (
              <p>
                Checked the first {report.checked.length} of{' '}
                {report.links.length} public links.
              </p>
            )}
        </div>
      )}
    </Modal>
  );
}

export function HistoryDialog({ id, revision, onRestore, onClose }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    studioRequest('versions', id)
      .then((result) => {
        if (active) setVersions(result.versions);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function restore(version) {
    if (
      !window.confirm(
        'Restore version ' +
          version.revision +
          '? A new version will be created.',
      )
    )
      return;
    setBusy(true);
    try {
      const result = await studioRequest('restoreVersion', {
        id,
        revision: version.revision,
        expectedRevision: revision,
      });
      onRestore(result.template);
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Template versions" onClose={onClose}>
      <ErrorText text={error} />
      {versions === null ? (
        <p className="studio-empty">Loading versions…</p>
      ) : (
        <div className="email-version-list">
          {versions.map((item) => (
            <div key={item.revision}>
              <div>
                <strong>
                  Version {item.revision} · {item.reason}
                </strong>
                <small>
                  {item.name} · {formatDate(item.createdAt)}
                </small>
              </div>
              {item.revision === revision ? (
                <span className="email-tag">Current</span>
              ) : (
                <Action disabled={busy} onClick={() => restore(item)}>
                  Restore
                </Action>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
