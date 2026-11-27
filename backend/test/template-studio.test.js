import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { openDatabase } from '../src/database.js';
import { blockLink, sanitizeEmailMarkup } from '../src/email-design.js';
import {
  cropMedia,
  listMedia,
  mediaDirectory,
  portableHtml,
  uploadMedia,
  archiveMedia,
  mediaImage,
} from '../src/email-media-service.js';
import {
  createEmailTemplate,
  listEmailTemplates,
  prepareTemplateInput,
  restoreTemplateVersion,
  setTemplateFavorite,
  templateVersions,
  updateEmailTemplate,
} from '../src/email-template-service.js';
import { inspectEmail } from '../src/email-validation.js';
import { sendTemplateTest } from '../src/delivery-service.js';

const node = (type, values = {}) => ({ id: type, type, ...values });

test('template studio stores drafts, personal favorites, and restorable revisions', async () => {
  const db = openDatabase(':memory:');
  try {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO users (id, full_name, username, email, password_hash, role, created_at, updated_at) VALUES ('local','Studio User','studio','user@example.test','unused','super_admin',?,?)",
    ).run(now, now);
    const prepared = await prepareTemplateInput({
      name: 'Studio test draft',
      subject: 'Hello {{first_name}}',
      category: 'Welcome Email',
      status: 'draft',
      design: [
        node('heading', { content: 'Welcome {{first_name}}' }),
        node('unsubscribe', { content: 'Unsubscribe' }),
      ],
      designSettings: {
        width: 640,
        css: '@import "bad.css"; p{color:#123456;}',
      },
    });
    assert.ok(prepared.ok);
    const created = createEmailTemplate(db, 'local', prepared.input).template;
    assert.equal(created.revision, 1);
    assert.equal(created.status, 'draft');
    assert.equal(created.designSettings.width, 640);
    assert.match(created.htmlBody, /color:#123456/);
    assert.doesNotMatch(created.htmlBody, /@import/);
    assert.ok(
      setTemplateFavorite(db, 'local', { id: created.id, favorite: true }).ok,
    );
    assert.equal(
      listEmailTemplates(db, 'local').templates.find(
        (item) => item.id === created.id,
      ).favorite,
      true,
    );
    assert.equal(
      listEmailTemplates(db).templates.find((item) => item.id === created.id)
        .favorite,
      false,
    );
    const renamed = updateEmailTemplate(db, 'local', created.id, {
      name: 'Ready email',
      status: 'ready',
      expectedRevision: 1,
      reason: 'rename',
    });
    assert.equal(renamed.template.revision, 2);
    assert.equal(
      updateEmailTemplate(db, 'local', created.id, {
        name: 'Stale',
        expectedRevision: 1,
      }).conflict,
      true,
    );
    assert.equal(
      templateVersions(db, created.id).versions[0].reason,
      'Renamed',
    );
    const restored = restoreTemplateVersion(db, 'local', {
      id: created.id,
      revision: 1,
      expectedRevision: 2,
    });
    assert.equal(restored.template.name, created.name);
    assert.equal(restored.template.htmlBody, created.htmlBody);
    assert.equal(restored.template.revision, 3);
    assert.equal(restored.template.status, 'draft');
  } finally {
    db.close();
  }
});

test('uploaded media survives backend reopening and flows into exports, checks, and SMTP test messages', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bulk-mail-studio-'));
  const filename = path.join(directory, 'studio.sqlite');
  let db = openDatabase(filename);
  const files = [];
  try {
    const bytes = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#243662' },
    })
      .png()
      .toBuffer();
    assert.equal(
      (
        await uploadMedia(db, {
          name: 'not.png',
          fileData: Buffer.from('<svg/>').toString('base64'),
        })
      ).ok,
      false,
    );
    const image = (
      await uploadMedia(db, {
        name: 'hero.png',
        fileData: bytes.toString('base64'),
      })
    ).media;
    files.push(path.join(mediaDirectory(db), image.id));
    assert.equal(image.width, 80);
    assert.deepEqual(await readFile(files[0]), bytes);
    const cropped = (
      await cropMedia(db, {
        id: image.id,
        left: 10,
        top: 5,
        width: 40,
        height: 30,
        outputWidth: 20,
      })
    ).media;
    files.push(path.join(mediaDirectory(db), cropped.id));
    assert.equal(cropped.width, 20);
    assert.equal(cropped.height, 15);
    assert.match(
      (await mediaImage(db, { id: image.id, preview: true })).dataUrl,
      /^data:image\/webp;/,
    );
    assert.ok(archiveMedia(db, image.id).ok);
    assert.deepEqual(
      listMedia(db, '').media.map((item) => item.id),
      [cropped.id],
    );

    db.close();
    db = openDatabase(filename);
    const prepared = await prepareTemplateInput({
      name: 'Test image delivery',
      subject: 'Hello {{first_name}}',
      category: 'Marketing',
      design: [
        node('image', {
          mediaId: image.id,
          alt: 'Company photo',
          imageWidth: 55,
        }),
        node('whatsapp', {
          content: 'Chat with us',
          whatsappNumber: '+91 98765 43210',
          whatsappMessage: 'Hello there!',
        }),
        node('qr', { content: 'https://example.test/archive' }),
        node('unsubscribe', { content: 'Unsubscribe' }),
      ],
      designSettings: { mobilePadding: 8 },
    });
    assert.ok(prepared.ok, prepared.error);
    const html = prepared.input.htmlBody;
    assert.match(html, /cid:bulkmail-media-/);
    assert.match(html, /https:\/\/wa\.me\/919876543210\?text=Hello%20there!/);
    assert.match(html, /data:image\/png;base64,/);
    assert.match(await portableHtml(db, html), /data:image\/png;base64,/);
    assert.equal((await inspectEmail(db, { html })).unsubscribe, true);
    const warning = await inspectEmail(db, {
      html: '<img src="https://127.0.0.1/asset.png"><a href="#">Learn</a>',
      remote: true,
    });
    assert.ok(warning.warnings.some((item) => item.includes('alt text')));
    assert.match(warning.checked[0].issue, /verified as public/);

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO smtp_accounts VALUES ('studio-smtp',NULL,'Test SMTP','smtp.example.test',587,'starttls','user',?,'Studio','from@example.test','',1,1,'connected',?,?,?,'password')",
    ).run(Buffer.from('test'), now, now, now);
    let email;
    const sent = await sendTemplateTest(
      db,
      {
        html,
        recipient: 'reader@example.test',
        subject: 'Hello {{first_name}}',
      },
      {
        decrypt: () => 'test-password',
        createTransport: () => ({
          close() {},
          async sendMail(options) {
            email = options;
            return { accepted: [options.to.address] };
          },
        }),
      },
    );
    assert.ok(sent.ok, sent.error);
    assert.equal(email.subject, '[Test] Hello Alex');
    assert.equal(email.attachments.length, 1);
    assert.match(email.html, /cid:bulkmail-media-/);
    assert.equal(email.attachDataUrls, true);
    assert.match(email.html, /@media/);
  } finally {
    if (db.open) db.close();
    for (const file of [...files, filename]) await rm(file, { force: true });
    if (files.length) await rmdir(path.join(directory, 'media'));
    await rmdir(directory);
  }
});

test('link options encode tracking, mail and phone values and strip active markup', () => {
  const linked = blockLink({
    type: 'button',
    linkValue: 'https://example.test/?existing=1',
    utmSource: 'studio',
    utmCampaign: 'fall savings',
  });
  assert.equal(
    new URL(linked).searchParams.get('utm_campaign'),
    'fall savings',
  );
  assert.equal(new URL(linked).searchParams.get('existing'), '1');
  assert.equal(
    blockLink({
      linkType: 'email',
      linkValue: 'mail@example.test',
      mailSubject: 'Hello there',
    }),
    'mailto:mail@example.test?subject=Hello%20there',
  );
  assert.equal(
    blockLink({ linkType: 'phone', linkValue: '+91 (123) 456 7890' }),
    'tel:+911234567890',
  );
  assert.equal(blockLink({ linkValue: 'javascript:bad' }), '');
  assert.doesNotMatch(
    sanitizeEmailMarkup(
      '<script>bad()</script><img src="data:text/html;base64,abcd" onerror="bad()">',
    ),
    /script|onerror|data:text/,
  );
});
