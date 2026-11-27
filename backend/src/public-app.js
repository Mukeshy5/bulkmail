import {
  timingSafeEqual,
  createHash,
  createHmac,
  randomUUID,
  randomBytes,
} from 'node:crypto';

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const tokenPattern = /^[a-zA-Z0-9_-]{32}$/;
const pixel = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
const categories = [
  'hard',
  'soft',
  'invalid_email',
  'mailbox_full',
  'domain_error',
  'temporary',
  'delivery_failure',
];
const signupInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(100),
  company: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  consent: z.literal('yes'),
  'cf-turnstile-response': z.string().min(1).max(2048),
});
const providerInput = z.object({
  id: z.string().min(1).max(150),
  provider: z.string().regex(/^[a-z0-9_-]{1,32}$/i),
  messageId: z
    .string()
    .max(350)
    .regex(/^<?[a-f0-9-]{36}@[a-zA-Z0-9.-]+>?$/),
  event: z.enum(['delivered', 'bounce', 'complaint']),
  category: z.enum(categories).optional(),
  recipient: z.string().email().max(254).optional(),
});

function createApp(
  db,
  config,
  { captchaFetch = fetch, sendConfirmation } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
          frameSrc: ['https://challenges.cloudflare.com'],
          frameAncestors: null,
          formAction: ["'self'"],
        },
      },
      xFrameOptions: false,
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('Referrer-Policy', 'no-referrer');
    next();
  });

  function page(response, title, content, status = 200) {
    response
      .status(status)
      .type('html')
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
          safe(title) +
          '</title><main><h1>' +
          safe(title) +
          '</h1>' +
          content +
          '</main></html>',
      );
  }
  const recipient = db.prepare(
    'SELECT id, email FROM campaign_recipients WHERE token = ?',
  );
  const events = db.prepare(
    'INSERT OR IGNORE INTO tracking_events VALUES (?, ?, ?, ?, ?)',
  );
  const addNotice = db.prepare('INSERT INTO notifications VALUES (?, ?, ?, ?)');
  const missing = (response) => page(response, 'Link unavailable', '', 404);
  const signup = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const traffic = rateLimit({
    windowMs: 60 * 1000,
    limit: 1200,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const hasGuard = Boolean(
    config.TURNSTILE_SITE_KEY && config.TURNSTILE_SECRET && config.PUBLIC_URL,
  );
  const formById = db.prepare(
    'SELECT * FROM signup_forms WHERE id = ? AND published = 1',
  );
  const suppression = db.prepare(
    'SELECT 1 FROM suppression_list WHERE email = ?',
  );

  const suppress = db.transaction((row, reason, source, date) => {
    db.prepare(
      'INSERT OR IGNORE INTO suppression_list VALUES (?, ?, ?, ?)',
    ).run(row.email, reason, source, date);
    db.prepare(
      'UPDATE contacts SET subscription_status = ?, updated_at = ? WHERE email = ?',
    ).run(reason, date, row.email);
  });
  const unsubscribe = db.transaction((row) => {
    const date = now();
    const inserted = db
      .prepare('INSERT OR IGNORE INTO unsubscribe_list VALUES (?, ?, ?)')
      .run(row.email, 'public unsubscribe', date);
    if (inserted.changes)
      events.run(randomUUID(), row.id, 'unsubscribe', '', date);
    suppress(row, 'unsubscribed', 'public unsubscribe', date);
  });

  app.get('/api/health', (_request, response) =>
    response.json({ status: 'ok' }),
  );
  app.get('/api/ready', traffic, (_request, response) => {
    const instance = db
      .prepare(
        "SELECT value FROM application_settings WHERE key = 'publicInstance'",
      )
      .get();
    response.json({ instance: instance ? JSON.parse(instance.value) : null });
  });

  app.get('/u/:token', traffic, (request, response) => {
    if (
      !tokenPattern.test(request.params.token) ||
      !recipient.get(request.params.token)
    )
      return missing(response);
    return page(
      response,
      'Unsubscribe from marketing email',
      '<form method="post"><button type="submit">Unsubscribe</button></form>',
    );
  });
  app.post('/u/:token', traffic, (request, response) => {
    const row =
      tokenPattern.test(request.params.token) &&
      recipient.get(request.params.token);
    if (!row) return missing(response);
    unsubscribe.immediate(row);
    if (request.body?.['List-Unsubscribe'] === 'One-Click')
      return response.sendStatus(204);
    return page(
      response,
      'You are unsubscribed',
      '<p>You will no longer receive marketing campaigns from this sender.</p>',
    );
  });
  app.get('/o/:token', traffic, (request, response) => {
    const row =
      tokenPattern.test(request.params.token) &&
      recipient.get(request.params.token);
    if (row && request.method === 'GET')
      events.run(randomUUID(), row.id, 'open', '', now());
    response.type('gif').send(pixel);
  });
  app.get('/r/:token', traffic, (request, response) => {
    const link =
      tokenPattern.test(request.params.token) &&
      db
        .prepare('SELECT * FROM tracking_links WHERE id = ?')
        .get(request.params.token);
    if (!link) return missing(response);
    const url = new URL(link.destination);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return missing(response);
    if (request.method === 'GET')
      events.run(randomUUID(), link.recipient_id, 'click', link.id, now());
    return response.redirect(302, url.href);
  });

  const providerEvent = db.transaction((payload, receipt = null) => {
    if (receipt) {
      db.prepare('DELETE FROM webhook_receipts WHERE created_at < ?').run(
        new Date(Date.now() - 86400000).toISOString(),
      );
      if (
        !db
          .prepare('INSERT OR IGNORE INTO webhook_receipts VALUES (?, ?)')
          .run(digest(receipt), now()).changes
      )
        return;
    }
    const id = payload.messageId.replace(/[<>]/g, '').split('@')[0];
    const row = db
      .prepare('SELECT id, email FROM campaign_recipients WHERE id = ?')
      .get(id);
    if (
      !row ||
      (payload.recipient &&
        row.email.toLowerCase() !== payload.recipient.toLowerCase())
    )
      return;
    const eventId = 'provider:' + digest(payload.provider + ':' + payload.id);
    const date = now();
    const stored = events.run(
      eventId,
      row.id,
      payload.event,
      payload.category || '',
      date,
    );
    if (!stored.changes) return;
    if (payload.event === 'bounce') {
      db.prepare('INSERT INTO bounce_logs VALUES (?, ?, ?)').run(
        eventId,
        payload.category,
        payload.provider,
      );
      if (['hard', 'invalid_email'].includes(payload.category))
        suppress(row, 'bounced', payload.provider, date);
    }
    if (payload.event === 'complaint')
      suppress(row, 'blocked', payload.provider, date);
  });
  app.post('/api/provider-events', traffic, (request, response) => {
    if (
      !config.PROVIDER_WEBHOOK_SECRET ||
      config.PROVIDER_WEBHOOK_SECRET.length < 32 ||
      !timingSafeEqual(
        Buffer.from(digest(request.get('Authorization') || '')),
        Buffer.from(digest('Bearer ' + config.PROVIDER_WEBHOOK_SECRET)),
      )
    ) {
      return response.sendStatus(401);
    }
    const payload = providerInput.safeParse(request.body);
    if (
      !payload.success ||
      (payload.data.event === 'bounce' && !payload.data.category)
    )
      return response.sendStatus(400);
    providerEvent.immediate(payload.data);
    return response.sendStatus(204);
  });
  app.post('/api/webhooks/mailgun', traffic, (request, response) => {
    const key = config.MAILGUN_WEBHOOK_SIGNING_KEY;
    const { timestamp, token, signature } = request.body?.signature || {};
    if (
      !key ||
      typeof timestamp !== 'string' ||
      !/^\d{10}$/.test(timestamp) ||
      typeof token !== 'string' ||
      !/^[a-zA-Z0-9_-]{32,128}$/.test(token) ||
      typeof signature !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(signature) ||
      Math.abs(Date.now() - Number(timestamp) * 1000) > 15 * 60000
    )
      return response.sendStatus(406);
    const expected = createHmac('sha256', key)
      .update(timestamp + token)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      return response.sendStatus(406);
    const event = request.body?.['event-data'];
    const kind = {
      delivered: 'delivered',
      failed: 'bounce',
      complained: 'complaint',
    }[event?.event];
    if (!kind) return response.sendStatus(200);
    const code = event['delivery-status']?.['enhanced-code'];
    const category = ['5.1.1', '5.1.3'].includes(code)
      ? 'invalid_email'
      : ['4.2.2', '5.2.2'].includes(code)
        ? 'mailbox_full'
        : ['4.1.2', '5.1.2'].includes(code)
          ? 'domain_error'
          : event.severity === 'temporary'
            ? 'temporary'
            : 'delivery_failure';
    const payload = providerInput.safeParse({
      id: event.id,
      provider: 'mailgun',
      recipient: event.recipient,
      messageId: event.message?.headers?.['message-id'],
      event: kind,
      category: kind === 'bounce' ? category : undefined,
    });
    if (payload.success && payload.data.recipient)
      providerEvent.immediate(payload.data, token);
    return response.sendStatus(200);
  });

  function formOptions(row) {
    return JSON.parse(row.options);
  }

  app.get('/f/:id', signup, (request, response) => {
    const row = hasGuard && formById.get(request.params.id);
    if (!row) return missing(response);
    const options = formOptions(row);
    const fields = (options.customFields || [])
      .map(
        (name) =>
          '<p><label>' +
          safe(name) +
          ' <input name="custom_' +
          safe(name) +
          '" maxlength="200"></label></p>',
      )
      .join('');
    return page(
      response,
      row.name,
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><form method="post">' +
        '<p><label>Name <input name="name" required maxlength="100" autocomplete="name"></label></p>' +
        '<p><label>Email <input type="email" name="email" required maxlength="254" autocomplete="email"></label></p>' +
        (options.company
          ? '<p><label>Company <input name="company" maxlength="120" autocomplete="organization"></label></p>'
          : '') +
        (options.phone
          ? '<p><label>Phone <input name="phone" type="tel" maxlength="40" autocomplete="tel"></label></p>'
          : '') +
        fields +
        '<p><label><input required type="checkbox" name="consent" value="yes"> ' +
        safe(row.consent) +
        '</label></p><div class="cf-turnstile" data-sitekey="' +
        safe(config.TURNSTILE_SITE_KEY) +
        '"></div><button>Subscribe</button></form>',
    );
  });

  const subscribe = db.transaction((submission, row, date) => {
    if (!row.list_id || suppression.get(submission.email)) return false;
    const input = JSON.parse(submission.details);
    db.prepare(
      "INSERT INTO contacts (id,full_name,email,company,phone,source,custom_fields,subscription_status,consent_source,consent_at,consent_evidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'subscribed',?,?,?,?,?) " +
        "ON CONFLICT(email) DO UPDATE SET subscription_status = 'subscribed', consent_source = excluded.consent_source, consent_at = excluded.consent_at, consent_evidence = excluded.consent_evidence, updated_at = excluded.updated_at WHERE contacts.subscription_status = 'pending'",
    ).run(
      randomUUID(),
      input.name,
      submission.email,
      input.company || '',
      input.phone || '',
      'signup form',
      JSON.stringify(input.custom),
      'signup form ' + row.name,
      date,
      input.evidence,
      date,
      date,
    );
    db.prepare(
      "INSERT OR IGNORE INTO contact_list_members SELECT ?, id, ? FROM contacts WHERE email = ? AND subscription_status = 'subscribed'",
    ).run(row.list_id, date, submission.email);
    db.prepare(
      'UPDATE signup_submissions SET confirmed_at = ?, token_hash = NULL WHERE id = ?',
    ).run(date, submission.id);
    addNotice.run(
      randomUUID(),
      'subscriber.created',
      'New subscriber from ' + row.name,
      date,
    );
    return true;
  });

  const storeSignup = db.transaction(
    (row, email, details, confirmationToken) => {
      const date = now();
      if (suppression.get(email) || !row.list_id) return null;
      const previous = db
        .prepare(
          'SELECT * FROM signup_submissions WHERE form_id = ? AND email = ?',
        )
        .get(row.id, email);
      if (previous?.confirmed_at) return null;
      if (previous && Date.now() - Date.parse(previous.created_at) < 600000)
        return null;
      const id = previous?.id || randomUUID();
      db.prepare(
        'INSERT INTO signup_submissions VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, details=excluded.details, created_at=excluded.created_at',
      ).run(
        id,
        row.id,
        email,
        confirmationToken ? digest(confirmationToken) : null,
        JSON.stringify(details),
        date,
      );
      if (!confirmationToken)
        subscribe({ id, email, details: JSON.stringify(details) }, row, date);
      return id;
    },
  );

  app.post('/f/:id', signup, async (request, response) => {
    const row = hasGuard && formById.get(request.params.id);
    if (!row) return missing(response);
    const data = signupInput.safeParse(request.body);
    if (!data.success || !data.data.name)
      return page(
        response,
        'Check your signup details',
        '<p>Complete the fields, consent, and CAPTCHA.</p>',
        400,
      );
    const verified = await captchaFetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({
          secret: config.TURNSTILE_SECRET,
          response: data.data['cf-turnstile-response'],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const validation = await verified.json();
    if (
      !validation.success ||
      validation.hostname !== new URL(config.PUBLIC_URL).hostname
    )
      return page(
        response,
        'Verification failed',
        '<p>Return to the signup form and try again.</p>',
        400,
      );
    const options = formOptions(row);
    if (options.doubleOptIn && !sendConfirmation)
      return page(response, 'Signup temporarily unavailable', '', 503);
    const confirmationToken = options.doubleOptIn
      ? randomBytes(24).toString('base64url')
      : null;
    const { name, email, company, phone } = data.data;
    const custom = Object.fromEntries(
      (options.customFields || []).map((field) => [
        field,
        typeof request.body['custom_' + field] === 'string'
          ? request.body['custom_' + field].trim().slice(0, 200)
          : '',
      ]),
    );
    const id = storeSignup.immediate(
      row,
      email,
      {
        name,
        company: options.company ? company : '',
        phone: options.phone ? phone : '',
        custom,
        evidence: row.consent,
      },
      confirmationToken,
    );
    if (id && confirmationToken) {
      try {
        await sendConfirmation(
          email,
          config.PUBLIC_URL + '/confirm/' + confirmationToken,
        );
      } catch {
        db.prepare(
          'DELETE FROM signup_submissions WHERE id = ? AND token_hash = ? AND confirmed_at IS NULL',
        ).run(id, digest(confirmationToken));
        return page(response, 'Signup temporarily unavailable', '', 503);
      }
    }
    return page(
      response,
      'Signup received',
      '<p>' +
        (confirmationToken
          ? 'Check your email for a confirmation link.'
          : 'Thank you for submitting the form.') +
        '</p>',
    );
  });

  function pendingConfirmation(token) {
    if (!tokenPattern.test(token)) return null;
    const row = db
      .prepare(
        'SELECT * FROM signup_submissions WHERE token_hash = ? AND confirmed_at IS NULL',
      )
      .get(digest(token));
    return row && Date.now() - Date.parse(row.created_at) <= 48 * 3600000
      ? row
      : null;
  }
  app.get('/confirm/:token', signup, (request, response) => {
    if (!pendingConfirmation(request.params.token)) return missing(response);
    return page(
      response,
      'Confirm your subscription',
      '<form method="post"><button>Confirm subscription</button></form>',
    );
  });
  app.post('/confirm/:token', signup, (request, response) => {
    const confirmed = db
      .transaction(() => {
        const submission = pendingConfirmation(request.params.token);
        const row = submission && formById.get(submission.form_id);
        return row && subscribe(submission, row, now());
      })
      .immediate();
    if (!confirmed) return missing(response);
    return page(
      response,
      'Subscription confirmed',
      '<p>You can unsubscribe from any marketing email.</p>',
    );
  });
  app.use((_request, response) => missing(response));
  app.use((error, _request, response, _next) => {
    console.error('Public service request failed:', error.code || error.name);
    page(
      response,
      'Request could not be completed',
      '',
      error.status === 400 ? 400 : 503,
    );
  });
  return app;
}

function createConfirmationSender(config, port) {
  let sendConfirmation;
  if (
    config.CONFIRM_SMTP_HOST &&
    config.CONFIRM_SMTP_USER &&
    config.CONFIRM_SMTP_PASSWORD &&
    config.CONFIRM_SMTP_FROM
  ) {
    const smtp = nodemailer.createTransport({
      host: config.CONFIRM_SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: config.CONFIRM_SMTP_USER,
        pass: config.CONFIRM_SMTP_PASSWORD,
      },
      connectionTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    sendConfirmation = async (to, link) => {
      const result = await smtp.sendMail({
        from: config.CONFIRM_SMTP_FROM,
        to: { address: to, name: '' },
        subject: 'Confirm your subscription',
        text:
          'Confirm your request at ' +
          link +
          '\n\nIf you did not request this, ignore this email.',
      });
      if (result.accepted?.length !== 1)
        throw new Error('Confirmation recipient was not accepted.');
    };
  }
  return sendConfirmation;
}

export { createApp, createConfirmationSender };
