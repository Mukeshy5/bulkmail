export const categories = [
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
  'General',
  'Events',
  'Customer Communication',
];
export const fonts = [
  'Arial',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Times New Roman',
];
export const variables = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['full_name', 'Full name'],
  ['email', 'Email'],
  ['company', 'Company'],
  ['phone', 'Phone'],
  ['country', 'Country'],
  ['unsubscribe_url', 'Unsubscribe URL'],
  ['current_date', 'Current date'],
];
export const devices = { Desktop: null, Tablet: 548, Mobile: 375 };
export const imageKinds = ['image', 'logo', 'video', 'product', 'price'];
export const buttonKinds = ['button', 'whatsapp', 'video', 'product'];
export const linkKinds = [
  'heading',
  'subheading',
  'paragraph',
  'footer',
  'address',
  'link',
  'qr',
  ...imageKinds,
  ...buttonKinds,
];
export const blockLabels = {
  heading: 'Heading',
  subheading: 'Subheading',
  paragraph: 'Text',
  image: 'Image',
  logo: 'Logo',
  button: 'Button',
  link: 'Hyperlink',
  divider: 'Divider',
  spacer: 'Spacer',
  social: 'Social links',
  whatsapp: 'WhatsApp',
  contact: 'Contact info',
  html: 'HTML block',
  video: 'Video thumbnail',
  product: 'Product card',
  price: 'Product + price',
  two: 'Two columns',
  three: 'Three columns',
  footer: 'Footer',
  unsubscribe: 'Unsubscribe',
  address: 'Address',
  qr: 'QR code',
};
export const palette = {
  Content: [
    'heading',
    'subheading',
    'paragraph',
    'image',
    'logo',
    'button',
    'link',
  ],
  Layout: ['two', 'three', 'divider', 'spacer', 'footer'],
  Engagement: [
    'social',
    'whatsapp',
    'contact',
    'video',
    'product',
    'price',
    'qr',
  ],
  Utilities: ['html', 'address', 'unsubscribe'],
};
const starterCopy = {
  heading: 'Your email headline',
  subheading: 'A little more detail',
  paragraph: 'Hello {{first_name}}, write your message here.',
  button: 'Learn more',
  logo: '',
  image: '',
  link: 'Visit our website',
  whatsapp: 'Chat With Us on WhatsApp',
  contact: 'Contact our team',
  html: '<p>Paste your HTML here.</p>',
  video: 'Watch video',
  product: 'Product name',
  price: 'Product name',
  two: 'Column one',
  three: 'Column one',
  footer: 'Your company',
  unsubscribe: 'Unsubscribe',
  address: 'Your mailing address',
  qr: '',
};
export const defaultDesign = {
  background: '#eaf0fa',
  contentBackground: '#ffffff',
  color: '#172848',
  family: 'Arial',
  width: 600,
  spacing: 18,
  radius: 8,
  border: 0,
  borderColor: '#d9e3f2',
  fontSize: 16,
  mobilePadding: 16,
  header: '',
  footer: '',
  css: '',
};
export const blankMeta = {
  name: '',
  description: '',
  subject: '',
  category: 'General',
  textBody: '',
  status: 'draft',
};
export function newBlock(type, patch = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    content: starterCopy[type] || '',
    second: 'Column two',
    third: 'Column three',
    align: 'left',
    alt: '',
    linkType: 'website',
    target: '_blank',
    buttonText: type === 'product' ? 'View product' : '',
    font: type === 'heading' ? 33 : type === 'subheading' ? 23 : 16,
    weight: ['heading', 'subheading'].includes(type) ? 700 : 400,
    lineHeight: 1.45,
    keepRatio: true,
    buttonColor: type === 'whatsapp' ? '#138548' : '#2858e4',
    buttonTextColor: '#ffffff',
    buttonRadius: 7,
    buttonPadding: 12,
    buttonPaddingX: 22,
    imageWidth: type === 'qr' ? 150 : type === 'logo' ? 144 : 560,
    imageHeight: type === 'spacer' ? 24 : 0,
    price: ['price', 'product'].includes(type) ? '$0.00' : '',
    ...patch,
  };
}
export function templateDraft(template) {
  const blocks =
    template?.design ||
    (template?.htmlBody
      ? [newBlock('html', { content: template.htmlBody })]
      : []);
  return {
    design: blocks,
    designSettings: { ...defaultDesign, ...template?.designSettings },
    meta: Object.fromEntries(
      Object.entries(blankMeta).map(([key, value]) => [
        key,
        template?.[key] ?? value,
      ]),
    ),
  };
}
export async function studioRequest(method, ...args) {
  const result = await window.bulkMail.emailTemplates[method](...args);
  if (!result.ok && !result.cancelled)
    throw new Error(result.error || 'The template operation failed.');
  return result;
}
export async function mediaRequest(method, ...args) {
  const result = await window.bulkMail.emailMedia[method](...args);
  if (!result.ok)
    throw new Error(result.error || 'The media operation failed.');
  return result;
}
export function readHtmlFile(file) {
  if (!file || !/\.html?$/i.test(file.name) || file.size > 450 * 1024)
    throw new Error('Choose an HTML file up to 450 KB.');
  return file.text();
}
export const campaignTemplate = (template, html = template.htmlBody) => ({
  templateId: template.id,
  subject: template.subject,
  customHtml: html,
});
