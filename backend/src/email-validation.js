import { lookup } from 'node:dns/promises';
import { request as http } from 'node:http';
import { request as https } from 'node:https';
import ipaddr from 'ipaddr.js';
import sanitizeHtml from 'sanitize-html';
import { website } from './email-design.js';
import { missingMedia } from './email-media-service.js';

function isPublicAddress(value) {
  try {
    return ipaddr.process(value).range() === 'unicast';
  } catch {
    return false;
  }
}

async function publicDestination(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    (url.port && !['80', '443'].includes(url.port)) ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    (!host.includes('.') && !ipaddr.isValid(host))
  )
    return null;
  if (ipaddr.isValid(host))
    return isPublicAddress(host)
      ? { address: host, family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6 }
      : null;
  const addresses = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 3500);
    lookup(host, { all: true })
      .then(resolve, () => resolve([]))
      .finally(() => clearTimeout(timer));
  });
  return addresses.length &&
    addresses.every(({ address }) => isPublicAddress(address))
    ? addresses[0]
    : null;
}

async function checkUrl(raw) {
  const url = new URL(raw);
  const destination = await publicDestination(url);
  if (!destination) return 'Destination could not be verified as public.';
  return new Promise((resolve) => {
    const make = url.protocol === 'https:' ? https : http;
    const request = make(
      url,
      {
        method: 'HEAD',
        signal: AbortSignal.timeout(3500),
        agent: false,
        lookup: (_host, options, done) =>
          options.all
            ? done(null, [destination])
            : done(null, destination.address, destination.family),
      },
      (response) => {
        response.resume();
        const code = response.statusCode;
        if (code === 404 || code === 410)
          resolve('Destination returned HTTP ' + code + '.');
        else if (code >= 300 && code < 400)
          resolve('Redirect found. Its final destination was not checked.');
        else if (code >= 400)
          resolve('Destination could not be confirmed (HTTP ' + code + ').');
        else resolve('');
      },
    );
    request.on('error', () =>
      resolve('Destination did not respond to the check.'),
    );
    request.end();
  });
}

export async function inspectEmail(db, input) {
  const html = typeof input?.html === 'string' ? input.html : '';
  if (!html || Buffer.byteLength(html) > 500 * 1024)
    return { ok: false, error: 'Add HTML up to 500 KB to check the email.' };
  const warnings = new Set();
  const urls = new Set();
  let unsubscribe = false;
  sanitizeHtml(html, {
    onOpenTag(tag, attrs) {
      if (['iframe', 'video', 'script', 'form'].includes(tag))
        warnings.add(
          'The email contains interactive markup that email clients may remove: ' +
            tag +
            '.',
        );
      const classes = (attrs.class || '').split(/\s+/);
      if (classes.includes('bm-missing-image'))
        warnings.add('An image block does not have an uploaded image or URL.');
      if (classes.includes('bm-missing-link'))
        warnings.add('A button or hyperlink does not have a valid link.');
      if (tag === 'img') {
        if (!attrs.alt?.trim())
          warnings.add('At least one image has no alt text.');
        if (!attrs.src) warnings.add('At least one image has no source.');
        else if (
          !attrs.src.startsWith('cid:') &&
          !attrs.src.startsWith('data:image/')
        ) {
          const url = website(attrs.src);
          if (url) urls.add(url);
          else warnings.add('An image source is invalid or relative.');
        }
      }
      if (tag === 'a') {
        const href = attrs.href || '';
        if (/^\{\{\s*unsubscribe_url\s*\}\}$/i.test(href)) unsubscribe = true;
        else if (/^(mailto:|tel:)/i.test(href)) {
          if (/\s/.test(href) || href.endsWith(':'))
            warnings.add('An email or phone link is incomplete.');
        } else if (website(href)) urls.add(website(href));
        else
          warnings.add(
            'An anchor has an empty, relative, or unsupported destination.',
          );
      }
    },
  });
  if (!unsubscribe)
    warnings.add(
      'No dynamic unsubscribe link was found. Add an Unsubscribe block for marketing email.',
    );
  if ((await missingMedia(db, html)).length)
    warnings.add('At least one uploaded image file is missing.');
  const checked = input.remote === true ? [...urls].slice(0, 12) : [];
  const results = await Promise.all(
    checked.map(async (url) => ({ url, issue: await checkUrl(url) })),
  );
  return {
    ok: true,
    warnings: [...warnings],
    links: [...urls],
    checked: results,
    unsubscribe,
  };
}
