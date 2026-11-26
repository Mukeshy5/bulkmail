const previewValues = {
  first_name: 'Alex',
  last_name: 'Morgan',
  full_name: 'Alex Morgan',
  email: 'alex@example.test',
  company: 'Example Company',
  unsubscribe_url: '#unsubscribe-preview',
};

export function previewDocument(html) {
  const previewHtml = html.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/gi,
    (match, key) => previewValues[key.toLowerCase()] ?? match,
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${previewHtml}</body></html>`;
}

export default function EmailPreviewFrame({ htmlBody, title, className = '' }) {
  return (
    <iframe
      className={`pointer-events-none ${className}`}
      title={title}
      sandbox=""
      srcDoc={previewDocument(htmlBody)}
    />
  );
}
