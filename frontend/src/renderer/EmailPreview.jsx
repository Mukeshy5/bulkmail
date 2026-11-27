import { useEffect, useState } from 'react';

export const sampleRecipient = {
  first_name: 'Alex',
  last_name: 'Morgan',
  full_name: 'Alex Morgan',
  email: 'alex@example.test',
  company: 'Example Company',
  country: 'United States',
  phone: '+1 202 555 0144',
  unsubscribe_url: '#unsubscribe-preview',
  current_date: new Date().toLocaleDateString('en-CA'),
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );

export function previewDocument(
  html,
  showRemoteImages = false,
  recipient = {},
) {
  const values = { ...sampleRecipient, ...recipient };
  const previewHtml = (html || '').replace(
    /\{\{\s*([a-z_]+)(?:\s*\|\s*default:\s*(?:"([^"]*)"|'([^']*)'|&quot;(.+?)&quot;|&#39;(.+?)&#39;))?\s*\}\}/gi,
    (match, key, double, single, encoded, encodedSingle) =>
      Object.hasOwn(values, key.toLowerCase())
        ? escape(
            values[key.toLowerCase()] ||
              double ||
              single ||
              encoded ||
              encodedSingle ||
              '',
          )
        : match,
  );
  const images = showRemoteImages ? 'data: https:' : 'data:';
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' +
    images +
    "; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body style=\"margin:0\">" +
    previewHtml +
    '</body></html>'
  );
}

export default function EmailPreviewFrame({
  htmlBody,
  title,
  className = '',
  showRemoteImages = false,
  recipient,
  style,
  loading,
}) {
  const [local, setLocal] = useState(null);
  useEffect(() => {
    if (
      !htmlBody?.includes('cid:bulkmail-media-') ||
      !window.bulkMail?.emailTemplates?.portable
    )
      return;
    let active = true;
    window.bulkMail.emailTemplates
      .portable({ html: htmlBody, preview: true })
      .then((result) => {
        if (active && result.ok)
          setLocal({ original: htmlBody, html: result.html });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [htmlBody]);
  return (
    <iframe
      className={'pointer-events-none ' + className}
      style={style}
      title={title}
      loading={loading}
      sandbox=""
      srcDoc={previewDocument(
        local?.original === htmlBody ? local.html : htmlBody,
        showRemoteImages,
        recipient,
      )}
    />
  );
}
