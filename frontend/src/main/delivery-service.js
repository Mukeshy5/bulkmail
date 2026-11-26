import { randomBytes, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import sanitizeHtml from 'sanitize-html';
import { campaignAudience, resolveAudience } from './audience-service.js';
import { notify, recordActivity, settings } from './operations.js';
import { createAccountTransport } from './smtp-service.js';

const token = () => randomBytes(24).toString('base64url');
const nowIso = () => new Date().toISOString();
const problem = (error) => ({ ok: false, error });

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}

export function personalize(source, contact, unsubscribe, html = false) {
  const fields = {
    first_name: 'there',
    last_name: '',
    full_name: 'there',
    email: '',
    company: '',
    country: '',
    unsubscribe_url: unsubscribe,
  };
  return source.replace(
    /\{\{\s*([a-z_]+)(?:\s*\|\s*default:\s*(?:"([^"]*)"|'([^']*)'|&quot;(.+?)&quot;|&#39;(.+?)&#39;))?\s*\}\}/gi,
    (match, key, double, single, escapedDouble, escapedSingle) => {
      const name = key.toLowerCase();
      if (!Object.hasOwn(fields, name)) return match;
      const value =
        (name === 'unsubscribe_url' ? unsubscribe : contact[name]) ||
        double ||
        single ||
        escapedDouble ||
        escapedSingle ||
        fields[name] ||
        '';
      return html ? escapeHtml(value) : String(value);
    },
  );
}

export function scheduleDate(input, timezone) {
  if (
    typeof input !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input) ||
    typeof timezone !== 'string'
  )
    return null;
  const parts = input.match(/\d+/g).map(Number);
  const nominal = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
  );
  if (!Number.isFinite(nominal)) return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
  const candidates = new Set();
  for (const hours of [-36, 0, 36]) {
    const sample = nominal + hours * 3600000;
    const local = formatter.format(sample).replace(' ', 'T');
    const instant = 2 * nominal - Date.parse(local + 'Z') + hours * 3600000;
    if (formatter.format(instant).replace(' ', 'T') === input)
      candidates.add(instant);
  }
  return candidates.size === 1
    ? new Date([...candidates][0]).toISOString()
    : null;
}

function deliveryConfig(db, campaign, test = false) {
  const account = db
    .prepare(
      "SELECT * FROM smtp_accounts WHERE is_enabled = 1 AND connection_status = 'connected' AND (id = ? OR (? IS NULL AND is_default = 1))",
    )
    .get(campaign.smtp_account_id, campaign.smtp_account_id);
  const template =
    campaign.template_id &&
    db
      .prepare(
        'SELECT html_body, text_body, subject FROM email_templates WHERE id = ?',
      )
      .get(campaign.template_id);
  const config = settings(db);
  const html = campaign.custom_html || template?.html_body;
  const subject = campaign.subject || template?.subject;
  if (!account || account.encryption === 'none')
    return problem(
      'Select an enabled, successfully tested SMTP account with TLS.',
    );
  if (!subject || !html)
    return problem('Add a subject and select a template or provide HTML.');
  if (!test && (!config.businessAddress || !config.publicUrl))
    return problem(
      'Set a business address and public HTTPS service in Settings.',
    );
  return {
    ok: true,
    account,
    content: {
      subject,
      html,
      text: campaign.custom_html ? '' : template?.text_body || '',
      previewText: campaign.preview_text,
      address: config.businessAddress,
      sender: campaign.sender_name || account.sender_name,
      from: campaign.sender_email || account.sender_email,
      replyTo: campaign.reply_to_email || account.reply_to_email,
      publicUrl: config.publicUrl,
      trackOpen: config.trackOpen,
      trackClick: config.trackClick,
    },
  };
}

export function reviewCampaign(db, id) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return problem('Campaign not found.');
  const config = deliveryConfig(db, campaign);
  const count = resolveAudience(db, campaignAudience(db, id)).length;
  return {
    ok: true,
    count,
    issues: [
      ...(config.ok ? [] : [config.error]),
      ...(!count
        ? ['Select a list or segment with eligible subscribers.']
        : []),
    ],
  };
}

const log = (db, recipient, kind, detail) =>
  db
    .prepare('INSERT INTO email_logs VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), recipient, kind, detail, nowIso());

export function planCampaign(db, actor, id, { localDate, timezone } = {}) {
  const scheduledAt = localDate ? scheduleDate(localDate, timezone) : null;
  if (localDate && (!scheduledAt || scheduledAt <= nowIso())) {
    return problem(
      'Choose a future local date and a valid time zone. Avoid ambiguous daylight-saving times.',
    );
  }
  return db
    .transaction(() => {
      const campaign = db
        .prepare('SELECT * FROM campaigns WHERE id = ?')
        .get(id);
      if (!campaign || !['draft', 'scheduled'].includes(campaign.status))
        return problem('This campaign cannot be scheduled or queued.');
      const result = deliveryConfig(db, campaign);
      if (!result.ok) return result;
      const audience = resolveAudience(db, campaignAudience(db, id));
      if (!audience.length)
        return problem('There are no eligible, subscribed recipients.');
      const status = scheduledAt ? 'scheduled' : 'processing';
      const now = nowIso();
      db.prepare(
        'UPDATE campaigns SET smtp_account_id = ?, delivery_config = ?, status = ?, scheduled_at = ?, timezone = ?, updated_at = ? WHERE id = ?',
      ).run(
        result.account.id,
        JSON.stringify(result.content),
        status,
        scheduledAt,
        scheduledAt ? timezone : 'UTC',
        now,
        id,
      );
      if (!scheduledAt) enqueue(db, id, audience, now);
      recordActivity(
        db,
        actor,
        'campaign.' + status,
        'campaign',
        id,
        campaign.name,
      );
      notify(
        db,
        status === 'scheduled' ? 'campaign.scheduled' : 'campaign.queued',
        campaign.name,
      );
      return { ok: true, count: audience.length };
    })
    .immediate();
}

function enqueue(db, id, audience, now) {
  const addRecipient = db.prepare(
    'INSERT INTO campaign_recipients VALUES (?, ?, ?, ?, ?)',
  );
  const addQueue = db.prepare(
    "INSERT INTO email_queue (recipient_id, state, next_at, updated_at) VALUES (?, 'pending', ?, ?)",
  );
  for (const contact of audience) {
    const recipient = randomUUID();
    addRecipient.run(recipient, id, contact.id, contact.email, token());
    addQueue.run(recipient, now, now);
  }
}

export function controlCampaign(db, actor, id, action) {
  const transitions = {
    pause: [['processing', 'sending'], 'paused'],
    resume: [['paused'], 'processing'],
    cancel: [['scheduled', 'processing', 'sending', 'paused'], 'cancelled'],
  };
  const transition = Object.hasOwn(transitions, action) && transitions[action];
  if (!transition) return problem('Choose a valid action.');
  return db
    .transaction(() => {
      const campaign = db
        .prepare('SELECT id, status, name FROM campaigns WHERE id = ?')
        .get(id);
      if (!campaign || !transition[0].includes(campaign.status))
        return problem('This action is unavailable for the campaign status.');
      const now = nowIso();
      db.prepare(
        'UPDATE campaigns SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?',
      ).run(transition[1], now, action === 'cancel' ? now : null, id);
      if (action === 'cancel')
        db.prepare(
          "UPDATE email_queue SET state = 'cancelled', updated_at = ? WHERE state = 'pending' AND recipient_id IN (SELECT id FROM campaign_recipients WHERE campaign_id = ?)",
        ).run(now, id);
      recordActivity(
        db,
        actor,
        'campaign.' + action,
        'campaign',
        id,
        campaign.name,
      );
      return { ok: true };
    })
    .immediate();
}

function smtpTransport(account, decrypt, createTransport) {
  return createAccountTransport(
    account,
    decrypt(Buffer.from(account.encrypted_password)),
    createTransport,
    30000,
  );
}

function trackedHtml(db, delivery, recipient, unsubscribe, html) {
  if (delivery.trackClick) {
    html = html.replace(
      /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi,
      (match, prefix, quote, href) => {
        const destination = href.replaceAll('&amp;', '&');
        let target;
        try {
          target = new URL(destination);
        } catch {
          return match;
        }
        if (
          !['http:', 'https:'].includes(target.protocol) ||
          target.username ||
          target.password ||
          target.href === unsubscribe ||
          target.origin === delivery.publicUrl
        )
          return match;
        const id = token();
        db.prepare('INSERT OR IGNORE INTO tracking_links VALUES (?, ?, ?)').run(
          id,
          recipient.id,
          target.href,
        );
        const tracked = db
          .prepare(
            'SELECT id FROM tracking_links WHERE recipient_id = ? AND destination = ?',
          )
          .get(recipient.id, target.href);
        return prefix + quote + delivery.publicUrl + '/r/' + tracked.id + quote;
      },
    );
  }
  if (delivery.trackOpen)
    html +=
      '<img src="' +
      delivery.publicUrl +
      '/o/' +
      recipient.token +
      '" width="1" height="1" alt="">';
  return html;
}

function message(db, delivery, contact, recipient = null) {
  const unsubscribe = recipient
    ? delivery.publicUrl + '/u/' + recipient.token
    : '#unsubscribe-test';
  let html = sanitizeHtml(
    personalize(delivery.html, contact, unsubscribe, true),
    {
      allowedTags: [
        ...sanitizeHtml.defaults.allowedTags,
        'img',
        'center',
        'font',
      ],
      allowedAttributes: {
        '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor'],
        a: ['href', 'title'],
        img: ['src', 'alt', 'title'],
        table: ['role', 'cellpadding', 'cellspacing', 'border'],
        td: ['colspan', 'rowspan'],
        font: ['color', 'size', 'face'],
      },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowProtocolRelative: false,
    },
  );
  if (delivery.previewText) {
    html =
      '<div style="display:none;max-height:0;overflow:hidden">' +
      escapeHtml(personalize(delivery.previewText, contact, unsubscribe)) +
      '</div>' +
      html;
  }
  const disclosure =
    recipient && (delivery.trackOpen || delivery.trackClick)
      ? ' · Engagement tracking is enabled for this email.'
      : '';
  const footer =
    '<p>' +
    escapeHtml(delivery.sender) +
    ' · ' +
    escapeHtml(delivery.address) +
    ' · <a href="' +
    unsubscribe +
    '">Unsubscribe</a>' +
    disclosure +
    '</p>';
  if (recipient) html = trackedHtml(db, delivery, recipient, unsubscribe, html);
  html += footer;
  const text =
    delivery.text ||
    delivery.html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return {
    from: { name: delivery.sender, address: delivery.from },
    to: { address: contact.email, name: '' },
    replyTo: delivery.replyTo || undefined,
    subject: personalize(delivery.subject, contact, unsubscribe).replace(
      /\p{Cc}/gu,
      ' ',
    ),
    text:
      personalize(text, contact, unsubscribe) +
      '\n\n' +
      delivery.sender +
      '\n' +
      delivery.address +
      '\nUnsubscribe: ' +
      unsubscribe +
      disclosure,
    html,
    messageId: recipient
      ? '<' + recipient.id + '@' + delivery.from.split('@')[1] + '>'
      : undefined,
    headers: recipient
      ? {
          'List-Unsubscribe': '<' + unsubscribe + '>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : {},
  };
}

export async function sendCampaignTest(db, id, userEmail, options) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return problem('Campaign not found.');
  const config = deliveryConfig(db, campaign, true);
  if (!config.ok) return config;
  let transport;
  try {
    transport = smtpTransport(
      config.account,
      options.decrypt,
      options.createTransport ?? nodemailer.createTransport,
    );
    const email = message(db, config.content, {
      email: userEmail,
      first_name: 'Test',
    });
    const result = await transport.sendMail({
      ...email,
      subject: '[Test] ' + email.subject,
    });
    if (result.accepted?.length !== 1)
      throw new Error('Recipient not accepted');
    return { ok: true };
  } catch {
    return problem(
      'The SMTP server did not accept the test message. Check the account settings.',
    );
  } finally {
    transport?.close();
  }
}

function activateSchedules(db, now) {
  const scheduled = db
    .prepare(
      "SELECT id, name FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= ?",
    )
    .all(now);
  for (const campaign of scheduled) {
    const audience = resolveAudience(db, campaignAudience(db, campaign.id));
    db.prepare(
      'UPDATE campaigns SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?',
    ).run(
      audience.length ? 'processing' : 'failed',
      now,
      audience.length ? null : now,
      campaign.id,
    );
    if (audience.length) enqueue(db, campaign.id, audience, now);
    else
      notify(
        db,
        'campaign.failed',
        campaign.name + ' has no eligible subscribers.',
      );
  }
}

function finishCampaigns(db, now) {
  const finished = db
    .prepare(
      "SELECT c.id, c.name, EXISTS (SELECT 1 FROM email_queue q JOIN campaign_recipients r ON r.id = q.recipient_id WHERE r.campaign_id = c.id AND q.state = 'submitted') AS submitted " +
        "FROM campaigns c WHERE c.status IN ('processing','sending') AND NOT EXISTS (SELECT 1 FROM email_queue q JOIN campaign_recipients r ON r.id = q.recipient_id WHERE r.campaign_id = c.id AND q.state IN ('pending','working'))",
    )
    .all();
  for (const campaign of finished) {
    const status = campaign.submitted ? 'completed' : 'failed';
    db.prepare(
      'UPDATE campaigns SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?',
    ).run(status, now, now, campaign.id);
    notify(db, 'campaign.' + status, campaign.name);
  }
}

function nextRecipient(db, now) {
  const { intervalSeconds, hourlyLimit } = settings(db);
  const instant = Date.parse(now);
  const hour = new Date(instant - 3600000).toISOString();
  const interval = new Date(instant - intervalSeconds * 1000).toISOString();
  const attemptTotals = db
    .prepare(
      "SELECT c.smtp_account_id, count(*) AS count, max(l.created_at) AS latest FROM email_logs l JOIN campaign_recipients r ON r.id = l.recipient_id JOIN campaigns c ON c.id = r.campaign_id WHERE kind = 'attempt' AND l.created_at >= ? GROUP BY c.smtp_account_id",
    )
    .all(hour);
  const totals = new Map(
    attemptTotals.map((row) => [row.smtp_account_id, row]),
  );
  for (const recipient of db
    .prepare(
      'SELECT r.*, q.attempts, c.status, c.name, c.smtp_account_id, c.delivery_config FROM email_queue q ' +
        'JOIN campaign_recipients r ON r.id = q.recipient_id JOIN campaigns c ON c.id = r.campaign_id ' +
        "WHERE q.state = 'pending' AND q.next_at <= ? AND c.status IN ('processing', 'sending') ORDER BY q.next_at, r.id",
    )
    .iterate(now)) {
    const total = totals.get(recipient.smtp_account_id);
    if (!total || (total.count < hourlyLimit && total.latest <= interval))
      return recipient;
  }
  return null;
}

function recover(db) {
  db.transaction(() => {
    const now = nowIso();
    const interrupted = db
      .prepare("SELECT recipient_id FROM email_queue WHERE state = 'working'")
      .all();
    for (const row of interrupted)
      log(
        db,
        row.recipient_id,
        'uncertain',
        'Application closed before SMTP acceptance could be recorded.',
      );
    db.prepare(
      "UPDATE email_queue SET state = 'uncertain', updated_at = ? WHERE state = 'working'",
    ).run(now);
    db.prepare(
      "UPDATE campaigns SET status = 'processing' WHERE status = 'sending'",
    ).run();
    finishCampaigns(db, now);
  }).immediate();
}

export function createDeliveryWorker(
  db,
  {
    decrypt,
    createTransport = nodemailer.createTransport,
    checkPublicService = async (url, instance) => {
      const response = await fetch(url + '/api/ready', {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      return response.ok && (await response.json()).instance === instance;
    },
  },
) {
  recover(db);
  let pending = null;
  let timer = null;
  const publicChecks = new Map();
  async function run() {
    const now = nowIso();
    db.transaction(() => {
      activateSchedules(db, now);
      finishCampaigns(db, now);
    }).immediate();
    const recipient = nextRecipient(db, now);
    if (!recipient) return;
    const config = JSON.parse(recipient.delivery_config || 'null');
    const instance = settings(db).publicInstance;
    const account = db
      .prepare(
        "SELECT * FROM smtp_accounts WHERE id = ? AND is_enabled = 1 AND connection_status = 'connected' AND encryption != 'none'",
      )
      .get(recipient.smtp_account_id);
    if (!config || !account || !instance) {
      db.prepare(
        "UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?",
      ).run(now, recipient.campaign_id);
      notify(
        db,
        'smtp.error',
        recipient.name + ' is paused. Check SMTP and public service settings.',
      );
      return;
    }

    const previous = publicChecks.get(config.publicUrl);
    let ready = previous?.ready;
    if (!previous || Date.now() >= previous.until) {
      try {
        ready = await checkPublicService(config.publicUrl, instance);
      } catch {
        ready = false;
      }
      publicChecks.set(config.publicUrl, {
        ready,
        until: Date.now() + (ready ? 30000 : 60000),
      });
      if (!ready && previous?.ready !== false)
        notify(
          db,
          'campaign.service',
          'Sending is waiting for the public service to reconnect for ' +
            recipient.name +
            '.',
        );
    }
    if (!ready) {
      db.prepare(
        "UPDATE email_queue SET next_at = ? WHERE recipient_id = ? AND state = 'pending'",
      ).run(new Date(Date.now() + 60000).toISOString(), recipient.id);
      return;
    }
    const claim = db
      .transaction(() => {
        const campaign = db
          .prepare('SELECT status FROM campaigns WHERE id = ?')
          .get(recipient.campaign_id);
        if (!['processing', 'sending'].includes(campaign?.status)) return null;
        const contact = db
          .prepare(
            "SELECT c.* FROM contacts c WHERE c.id = ? AND c.email = ? AND c.subscription_status = 'subscribed' " +
              'AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email)',
          )
          .get(recipient.contact_id, recipient.email);
        const stamp = nowIso();
        if (!contact) {
          db.prepare(
            "UPDATE email_queue SET state = 'skipped', updated_at = ? WHERE recipient_id = ?",
          ).run(stamp, recipient.id);
          log(db, recipient.id, 'skipped', 'Contact no longer eligible.');
          return null;
        }
        const claimed = db
          .prepare(
            "UPDATE email_queue SET state = 'working', attempts = attempts + 1, updated_at = ? WHERE recipient_id = ? AND state = 'pending'",
          )
          .run(stamp, recipient.id);
        if (!claimed.changes) return null;
        const started = db
          .prepare(
            'UPDATE campaigns SET started_at = ?, status = ?, updated_at = ? WHERE id = ? AND started_at IS NULL',
          )
          .run(stamp, 'sending', stamp, recipient.campaign_id);
        if (started.changes) notify(db, 'campaign.started', recipient.name);
        else
          db.prepare(
            "UPDATE campaigns SET status = 'sending' WHERE id = ?",
          ).run(recipient.campaign_id);
        log(db, recipient.id, 'attempt', 'SMTP submission started.');
        return contact;
      })
      .immediate();
    if (!claim) return;

    let outcome = 'submitted';
    let detail = 'SMTP server accepted the recipient.';
    let transport;
    const attempts = recipient.attempts + 1;
    try {
      transport = smtpTransport(account, decrypt, createTransport);
      const result = await transport.sendMail(
        message(db, config, claim, recipient),
      );
      if (result.accepted?.length !== 1) {
        outcome = 'failed';
        detail = 'SMTP server did not accept the recipient.';
      }
    } catch (error) {
      const code = Number(error?.responseCode);
      const command =
        typeof error?.command === 'string' ? error.command.toUpperCase() : '';
      const early = [
        'CONN',
        'EHLO',
        'HELO',
        'AUTH',
        'STARTTLS',
        'MAIL FROM',
        'RCPT TO',
      ].includes(command);
      const connectionFailure =
        early &&
        ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS'].includes(error?.code);
      if ((code >= 400 && code < 500) || connectionFailure) {
        outcome = attempts < 5 ? 'pending' : 'failed';
        detail =
          'Temporary SMTP failure' + (code ? ' (' + code + ')' : '') + '.';
      } else if (code >= 500 && code < 600) {
        outcome = 'failed';
        detail = 'Permanent SMTP refusal (' + code + ').';
      } else {
        outcome = transport ? 'uncertain' : 'failed';
        detail = transport
          ? 'SMTP outcome could not be verified.'
          : 'Could not initialize the SMTP connection.';
      }
    } finally {
      transport?.close();
    }
    const stamp = nowIso();
    db.transaction(() => {
      const { status } = db
        .prepare('SELECT status FROM campaigns WHERE id = ?')
        .get(recipient.campaign_id);
      if (outcome === 'pending' && status === 'cancelled')
        outcome = 'cancelled';
      const next = new Date(
        Date.now() + 30000 * 2 ** (attempts - 1),
      ).toISOString();
      db.prepare(
        'UPDATE email_queue SET state = ?, updated_at = ?, next_at = ?, submitted_at = ? WHERE recipient_id = ?',
      ).run(
        outcome,
        stamp,
        next,
        outcome === 'submitted' ? stamp : null,
        recipient.id,
      );
      log(db, recipient.id, outcome, detail);
      finishCampaigns(db, stamp);
    }).immediate();
  }
  function tick() {
    if (!pending)
      pending = run().finally(() => {
        pending = null;
      });
    return pending;
  }
  return {
    tick,
    start() {
      if (!timer)
        timer = setInterval(
          () =>
            tick().catch((error) => console.error('Delivery queue:', error)),
          1000,
        );
    },
    async stop() {
      clearInterval(timer);
      timer = null;
      await pending;
    },
  };
}
