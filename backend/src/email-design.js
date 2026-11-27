import QRCode from 'qrcode';
import postcss from 'postcss';
import sanitizeHtml from 'sanitize-html';

export const templateCategories = [
  'General',
  'Business',
  'Marketing',
  'Promotional',
  'Newsletter',
  'Welcome Email',
  'Follow-up Email',
  'Product Launch',
  'Event Invitation',
  'Offers & Discounts',
  'Transactional Emails',
  'Events',
  'Customer Communication',
];
export const mediaIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const mediaCid = (id) => 'bulkmail-media-' + id + '@bulkmail.local';
export const blockTypes = new Set([
  'heading',
  'subheading',
  'paragraph',
  'image',
  'logo',
  'button',
  'link',
  'divider',
  'spacer',
  'social',
  'whatsapp',
  'contact',
  'html',
  'video',
  'product',
  'price',
  'two',
  'three',
  'footer',
  'unsubscribe',
  'address',
  'qr',
]);
const styles = new Set(['left', 'center', 'right']);
const families = new Set([
  'Arial',
  'Verdana',
  'Georgia',
  'Tahoma',
  'Trebuchet MS',
  'Times New Roman',
]);
const imageTypes = new Set(['image', 'logo', 'video', 'product', 'price']);

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
const rich = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');
const text = (value, max = 4000) =>
  typeof value === 'string' ? value.slice(0, max) : '';
const num = (value, min, max, fallback) => {
  if (value === undefined || value === '' || !Number.isFinite(Number(value)))
    return fallback;
  return Math.max(min, Math.min(max, Number(value)));
};
const color = (value, fallback) =>
  /^#[a-f0-9]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const font = (value, fallback) => (families.has(value) ? value : fallback);
const rgbaOrHex = (value) =>
  typeof value === 'string' &&
  (value === 'transparent' || /^#[a-f0-9]{6}$/i.test(value));

export function website(value) {
  const input = text(value, 2048).trim();
  if (!input || /\s|[\u0000-\u001f]/u.test(input)) return '';
  try {
    const url = new URL(input.startsWith('www.') ? 'https://' + input : input);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

export function whatsAppLink(number, message) {
  const digits = text(number, 40)
    .trim()
    .replace(/[ +().-]/g, '');
  if (!/^[1-9]\d{6,14}$/.test(digits)) return '';
  const value = text(message, 1000).trim();
  return (
    'https://wa.me/' +
    digits +
    (value ? '?text=' + encodeURIComponent(value) : '')
  );
}

export function blockLink(block) {
  const kind = block.linkType || 'website';
  const raw = text(
    block.linkValue ||
      (!imageTypes.has(block.type) ? block.url : block.linkUrl),
    2048,
  ).trim();
  if (block.type === 'whatsapp' || kind === 'whatsapp')
    return whatsAppLink(block.whatsappNumber || raw, block.whatsappMessage);
  if (kind === 'email') {
    const email = raw.replace(/^mailto:/i, '');
    if (!/^[^\s@?#<>,";]+@(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/i.test(email))
      return '';
    const subject = text(block.mailSubject, 150);
    return (
      'mailto:' +
      email +
      (subject ? '?subject=' + encodeURIComponent(subject) : '')
    );
  }
  if (kind === 'phone') {
    const digits = raw.replace(/^tel:/i, '').replace(/[ ().-]/g, '');
    return /^\+?[1-9]\d{5,14}$/.test(digits) ? 'tel:' + digits : '';
  }
  const href = website(raw);
  if (!href) return '';
  const url = new URL(href);
  for (const [key, prop] of [
    ['utm_source', 'utmSource'],
    ['utm_medium', 'utmMedium'],
    ['utm_campaign', 'utmCampaign'],
    ['utm_content', 'utmContent'],
    ['utm_term', 'utmTerm'],
  ]) {
    if (text(block[prop], 120).trim())
      url.searchParams.set(key, block[prop].trim().slice(0, 120));
  }
  return url.href;
}

function safeCss(source) {
  if (!source || /[<>\\]/.test(source)) return '';
  try {
    const root = postcss.parse(source);
    root.walkAtRules((rule) => {
      if (rule.name !== 'media' || /[^\w\s(),:.\-]/.test(rule.params))
        rule.remove();
    });
    root.walkDecls((declaration) => {
      if (
        /url\s*\(|expression\s*\(|image-set\s*\(|behavior|javascript:|@import/i.test(
          declaration.prop + ' ' + declaration.value,
        )
      )
        declaration.remove();
    });
    return root.toString();
  } catch {
    return '';
  }
}

export function sanitizeEmailMarkup(html) {
  const css = [];
  const source = html.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi,
    (_match, value) => {
      const result = safeCss(value);
      if (result) css.push(result);
      return '';
    },
  );
  const body = sanitizeHtml(source, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'center',
      'font',
    ],
    allowedAttributes: {
      '*': [
        'style',
        'class',
        'align',
        'valign',
        'width',
        'height',
        'bgcolor',
        'role',
        'aria-hidden',
      ],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      table: ['cellpadding', 'cellspacing', 'border'],
      td: ['colspan', 'rowspan'],
      font: ['color', 'size', 'face'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'cid', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      img: (_tag, attributes) => {
        if (
          attributes.src?.startsWith('data:') &&
          !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i.test(
            attributes.src,
          )
        )
          delete attributes.src;
        return { tagName: 'img', attribs: attributes };
      },
      '*': (tagName, attributes) => {
        if (
          attributes.style &&
          /[<>\\]|url\s*\(|expression\s*\(|image-set\s*\(|behavior|javascript:/i.test(
            attributes.style,
          )
        )
          delete attributes.style;
        return { tagName, attribs: attributes };
      },
    },
  });
  return (css.length ? '<style>' + css.join('\n') + '</style>' : '') + body;
}

export function normalizeSettings(input = {}) {
  const data = input && typeof input === 'object' ? input : {};
  return {
    background: color(data.background, '#eaf0fa'),
    contentBackground: color(data.contentBackground, '#ffffff'),
    color: color(data.color, '#172848'),
    family: font(data.family, 'Arial'),
    width: num(data.width, 320, 820, 600),
    spacing: num(data.spacing, 0, 56, 18),
    radius: num(data.radius, 0, 44, 8),
    border: num(data.border, 0, 8, 0),
    borderColor: color(data.borderColor, '#d9e3f2'),
    fontSize: num(data.fontSize, 9, 44, 16),
    mobilePadding: num(data.mobilePadding, 0, 36, 16),
    header: text(data.header, 400),
    footer: text(data.footer, 500),
    css: text(data.css, 14000),
  };
}

function imageSource(block) {
  if (mediaIdPattern.test(block.mediaId || ''))
    return 'cid:' + mediaCid(block.mediaId);
  return website(
    block.imageUrl || (['image', 'logo'].includes(block.type) ? block.url : ''),
  );
}

function alignment(block) {
  return styles.has(block.align) ? block.align : 'left';
}

function anchor(html, destination, block, inline = '', className = '') {
  if (!destination) return html;
  return (
    '<a href="' +
    escapeHtml(destination) +
    '" target="' +
    (block.target === '_self' ? '_self' : '_blank') +
    '" rel="noopener noreferrer"' +
    (className ? ' class="' + className + '"' : '') +
    (inline ? ' style="' + inline + '"' : '') +
    '>' +
    html +
    '</a>'
  );
}

function linkedText(block, destination, inline = '') {
  const content = text(block.content);
  const phrase = text(block.linkText, 200).trim();
  const index = phrase ? content.indexOf(phrase) : -1;
  if (!destination || index < 0)
    return anchor(rich(content), destination, block, inline);
  return (
    rich(content.slice(0, index)) +
    anchor(rich(phrase), destination, block, inline) +
    rich(content.slice(index + phrase.length))
  );
}

function image(block, label, destination = '') {
  const src = imageSource(block);
  if (!src) return '<span class="bm-missing-image"></span>';
  const width = num(
    block.imageWidth,
    16,
    1200,
    block.type === 'logo' ? 144 : 560,
  );
  const height =
    block.keepRatio !== false ? 0 : num(block.imageHeight, 0, 1500, 0);
  const style =
    'display:inline-block;border:0;max-width:100%;width:' +
    width +
    'px;height:' +
    (height ? height + 'px' : 'auto') +
    ';border-radius:' +
    num(block.imageRadius ?? block.radius, 0, 60, 0) +
    'px;';
  return anchor(
    '<img src="' +
      escapeHtml(src) +
      '" alt="' +
      escapeHtml(label) +
      '" width="' +
      width +
      '"' +
      (height ? ' height="' + height + '"' : '') +
      ' style="' +
      style +
      '">',
    destination,
    block,
    'display:inline-block;max-width:100%;',
  );
}

function button(block, label, destination, index) {
  const bg = color(
    block.buttonColor,
    block.type === 'whatsapp' ? '#138548' : '#2858e4',
  );
  const fg = color(block.buttonTextColor, '#ffffff');
  const padding = num(block.buttonPadding, 3, 38, 12);
  const horizontal = num(block.buttonPaddingX, 8, 70, 22);
  const buttonStyle =
    'display:inline-block;font-weight:700;text-decoration:none;color:' +
    fg +
    ';background-color:' +
    bg +
    ';border-radius:' +
    num(block.buttonRadius ?? block.radius, 0, 60, 7) +
    'px;padding:' +
    padding +
    'px ' +
    horizontal +
    'px;';
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" align="' +
    alignment(block) +
    '"><tr><td align="center" bgcolor="' +
    bg +
    '" style="border-radius:' +
    num(block.buttonRadius ?? block.radius, 0, 60, 7) +
    'px">' +
    (destination
      ? anchor(label, destination, block, buttonStyle, 'bm-cta-' + index)
      : '<span class="bm-missing-link" style="' +
        buttonStyle +
        '">' +
        label +
        '</span>') +
    '</td></tr></table>'
  );
}

function columns(block, count) {
  const values = [block.content, block.second, block.third].slice(0, count);
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    values
      .map(
        (value) =>
          '<td class="bm-column" width="' +
          Math.floor(100 / count) +
          '%" valign="top" style="padding:6px 8px;overflow-wrap:break-word;">' +
          rich(value) +
          '</td>',
      )
      .join('') +
    '</tr></table>'
  );
}

async function blockMarkup(block, index) {
  const label = rich(block.content);
  const destination = blockLink(block);
  const alt = text(
    block.alt ?? (['image', 'logo'].includes(block.type) ? block.content : ''),
    250,
  );
  switch (block.type) {
    case 'heading':
    case 'subheading': {
      const tag = block.type === 'heading' ? 'h1' : 'h2';
      return (
        '<' +
        tag +
        ' style="margin:0;font:inherit">' +
        linkedText(block, destination) +
        '</' +
        tag +
        '>'
      );
    }
    case 'paragraph':
    case 'footer':
    case 'address':
      return '<p style="margin:0">' + linkedText(block, destination) + '</p>';
    case 'image':
    case 'logo':
      return image(block, alt, destination);
    case 'button':
      return button(block, label, destination, index);
    case 'link':
      return destination
        ? anchor(
            label,
            destination,
            block,
            'color:inherit;text-decoration:underline;',
          )
        : '<span class="bm-missing-link">' + label + '</span>';
    case 'whatsapp':
      return button(
        block,
        '<span aria-hidden="true">💬</span>&nbsp;' + label,
        destination,
        index,
      );
    case 'divider':
      return (
        '<div style="height:1px;border-top:1px solid ' +
        color(block.color, '#d6e0ee') +
        ';font-size:1px;line-height:1px">&nbsp;</div>'
      );
    case 'spacer':
      return (
        '<div style="height:' +
        num(block.imageHeight || block.font, 4, 180, 24) +
        'px">&nbsp;</div>'
      );
    case 'social':
      return [
        ['LinkedIn', block.url, 'in', '#0a66c2'],
        ['Instagram', block.url2, '◎', '#b8408d'],
        ['Facebook', block.url3, 'f', '#0866ff'],
      ]
        .map(([name, url, icon, shade]) =>
          website(url)
            ? anchor(
                '<span aria-hidden="true" style="display:inline-block;padding:2px 6px;border-radius:6px;background:' +
                  shade +
                  ';color:#fff;font-weight:700;">' +
                  icon +
                  '</span>&nbsp;' +
                  name,
                website(url),
                block,
                'display:inline-block;margin:3px 8px;color:inherit;text-decoration:none;',
              )
            : '',
        )
        .join('');
    case 'contact':
      return (
        '<p style="margin:0"><strong>' +
        label +
        '</strong></p>' +
        [
          blockLink({ linkType: 'email', linkValue: block.contactEmail }),
          blockLink({ linkType: 'phone', linkValue: block.contactPhone }),
          whatsAppLink(block.whatsappNumber, block.whatsappMessage),
        ]
          .filter(Boolean)
          .map(
            (url) =>
              '<div style="margin-top:4px">' +
              anchor(
                escapeHtml(
                  url.startsWith('https://wa.me/')
                    ? '💬 ' + (block.buttonText || 'Chat on WhatsApp')
                    : url.slice(url.indexOf(':') + 1),
                ),
                url,
                block,
                'color:inherit;',
              ) +
              '</div>',
          )
          .join('')
      );
    case 'video':
      return (
        image(block, alt || 'Video thumbnail', destination) +
        button(block, label || 'Watch video', destination, index)
      );
    case 'product':
    case 'price':
      return (
        image(block, alt, destination) +
        '<div style="padding:10px 0 4px;font-weight:700;">' +
        label +
        '</div><div style="color:' +
        color(block.priceColor, '#2858e4') +
        ';font-weight:700;">' +
        rich(block.price) +
        '</div>' +
        (block.type === 'product'
          ? '<div style="padding-top:7px;">' +
            rich(block.description) +
            '</div><div style="padding-top:10px;">' +
            button(
              block,
              rich(block.buttonText || 'View product'),
              destination,
              index,
            ) +
            '</div>'
          : '')
      );
    case 'two':
    case 'three':
      return columns(block, block.type === 'two' ? 2 : 3);
    case 'unsubscribe':
      return anchor(
        label || 'Unsubscribe',
        '{{unsubscribe_url}}',
        block,
        'color:inherit;text-decoration:underline;',
      );
    case 'qr': {
      const target = destination || text(block.content, 500).trim();
      if (!target) return '';
      const width = num(block.imageWidth, 80, 400, 150);
      const data = await QRCode.toDataURL(target.slice(0, 500), {
        width,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      return anchor(
        '<img src="' +
          data +
          '" alt="' +
          escapeHtml(alt || 'QR code') +
          '" width="' +
          width +
          '" style="width:' +
          width +
          'px;max-width:100%;height:auto;border:0;">',
        destination,
        block,
      );
    }
    case 'html':
      return text(block.content, 450000);
    default:
      return '';
  }
}

export function validDesign(blocks) {
  return (
    Array.isArray(blocks) &&
    blocks.length <= 100 &&
    Buffer.byteLength(JSON.stringify(blocks)) <= 500 * 1024 &&
    new Set(blocks.map((block) => block?.id)).size === blocks.length &&
    blocks.every(
      (block) =>
        block &&
        typeof block.id === 'string' &&
        block.id.length > 0 &&
        block.id.length <= 100 &&
        blockTypes.has(block.type) &&
        Object.values(block).every((value) =>
          ['string', 'number', 'boolean'].includes(typeof value),
        ),
    )
  );
}

export async function renderDesign(blocks, inputSettings = {}) {
  if (!validDesign(blocks))
    return {
      ok: false,
      error: 'Use up to 100 supported blocks and 500 KB of design content.',
    };
  const settings = normalizeSettings(inputSettings);
  const layout = await Promise.all(
    blocks.map(async (block, index) => {
      const align = alignment(block);
      const family = font(block.family, settings.family);
      const css = [
        'padding:' + num(block.padding, 0, 100, settings.spacing) + 'px',
        'color:' + color(block.color, settings.color),
        'font-family:' + family + ',sans-serif',
        'font-size:' + num(block.font, 8, 80, settings.fontSize) + 'px',
        'font-weight:' +
          num(
            block.weight,
            100,
            900,
            block.type === 'heading' || block.type === 'subheading' ? 700 : 400,
          ),
        'font-style:' + (block.italic === true ? 'italic' : 'normal'),
        'text-decoration:' + (block.underline === true ? 'underline' : 'none'),
        'line-height:' + num(block.lineHeight, 0.9, 3, 1.45),
        'letter-spacing:' + num(block.letterSpacing, -2, 12, 0) + 'px',
        'background-color:' +
          (rgbaOrHex(block.background) ? block.background : 'transparent'),
        'border-radius:' + num(block.radius, 0, 60, 0) + 'px',
      ].join(';');
      const margin = num(block.margin, 0, 100, 0);
      const body = await blockMarkup(block, index);
      return (
        '<tr><td style="padding-top:' +
        margin +
        'px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="bm-padding" align="' +
        align +
        '" style="' +
        css +
        '">' +
        body +
        '</td></tr></table></td></tr>'
      );
    }),
  );
  const hover = blocks
    .map((block, index) =>
      rgbaOrHex(block.hoverColor)
        ? '.bm-cta-' +
          index +
          ':hover{background-color:' +
          block.hoverColor +
          ' !important;}'
        : '',
    )
    .join('');
  const css =
    '@media only screen and (max-width:480px){.bm-content{width:100% !important;}.bm-padding{padding-left:' +
    settings.mobilePadding +
    'px !important;padding-right:' +
    settings.mobilePadding +
    'px !important;}.bm-column{display:block !important;width:auto !important;}}' +
    hover +
    safeCss(settings.css);
  const header = settings.header
    ? '<tr><td class="bm-padding" align="center" style="padding:14px;font-weight:700;">' +
      rich(settings.header) +
      '</td></tr>'
    : '';
  const footer = settings.footer
    ? '<tr><td class="bm-padding" align="center" style="padding:14px;">' +
      rich(settings.footer) +
      '</td></tr>'
    : '';
  const html =
    '<style>' +
    css +
    '</style><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' +
    settings.background +
    '"><tr><td align="center" style="padding:12px 5px;"><table class="bm-content" role="presentation" width="' +
    settings.width +
    '" cellpadding="0" cellspacing="0" bgcolor="' +
    settings.contentBackground +
    '" style="width:100%;max-width:' +
    settings.width +
    'px;color:' +
    settings.color +
    ';font-family:' +
    settings.family +
    ',sans-serif;border:' +
    settings.border +
    'px solid ' +
    settings.borderColor +
    ';border-radius:' +
    settings.radius +
    'px;">' +
    header +
    layout.join('') +
    footer +
    '</table></td></tr></table>';
  if (Buffer.byteLength(html) > 500 * 1024)
    return {
      ok: false,
      error:
        'The generated HTML exceeds 500 KB. Reduce the number of large blocks.',
    };
  return { ok: true, html, settings };
}
