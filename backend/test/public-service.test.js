const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createHmac } = require('node:crypto');
const { createApp } = require('../index.js');

test('public unsubscribe, tracking, provider events, and double opt-in persist across requests', async (t) => {
  const { openDatabase } = await import('../../frontend/src/main/database.js');
  const db = openDatabase(':memory:');
  const date = new Date().toISOString();
  const secret = 'example-webhook-secret-with-enough-length';
  const messageId = 'd1b974b1-9be6-4d29-9a0a-982148fa12e1';
  const email = 'subscribed@example.test';
  const token = 'a'.repeat(32);
  const link = 'b'.repeat(32);
  db.prepare(
    "INSERT INTO campaigns (id, name, created_at, updated_at) VALUES ('campaign','Newsletter',?,?)",
  ).run(date, date);
  db.prepare('INSERT INTO campaign_recipients VALUES (?, ?, NULL, ?, ?)').run(
    messageId,
    'campaign',
    email,
    token,
  );
  db.prepare('INSERT INTO tracking_links VALUES (?, ?, ?)').run(
    link,
    messageId,
    'https://example.test/news',
  );
  db.prepare(
    "INSERT INTO contact_lists VALUES ('list','Signup list','',?,?)",
  ).run(date, date);
  db.prepare('INSERT INTO signup_forms VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'form',
    'News',
    'list',
    'Send me news',
    '{"doubleOptIn":true,"company":true}',
    1,
    date,
  );
  let confirmation;
  const app = createApp(
    db,
    {
      PUBLIC_URL: 'https://public.example.test',
      PROVIDER_WEBHOOK_SECRET: secret,
      MAILGUN_WEBHOOK_SIGNING_KEY: secret,
      TURNSTILE_SITE_KEY: 'test',
      TURNSTILE_SECRET: 'test',
    },
    {
      captchaFetch: async () => ({
        json: async () => ({ success: true, hostname: 'public.example.test' }),
      }),
      sendConfirmation: async (to, url) => {
        confirmation = { to, url };
      },
    },
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const send = (route, fields) =>
    fetch(origin + route, {
      method: 'POST',
      body: new URLSearchParams(fields),
    });

  assert.equal((await fetch(origin + '/u/' + token)).status, 200);
  assert.equal(
    db.prepare('SELECT count(*) FROM suppression_list').pluck().get(),
    0,
  );
  assert.equal(
    (await send('/u/' + token, { 'List-Unsubscribe': 'One-Click' })).status,
    204,
  );
  assert.equal(
    (await send('/u/' + token, { 'List-Unsubscribe': 'One-Click' })).status,
    204,
  );
  assert.equal(
    db.prepare('SELECT count(*) FROM unsubscribe_list').pluck().get(),
    1,
  );
  assert.equal(
    (await fetch(origin + '/o/' + token)).headers.get('content-type'),
    'image/gif',
  );
  assert.equal(
    (await fetch(origin + '/r/' + link, { redirect: 'manual' })).headers.get(
      'location',
    ),
    'https://example.test/news',
  );

  const provider = (authorized) =>
    fetch(origin + '/api/provider-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorized ? 'Bearer ' + secret : 'Bearer invalid',
      },
      body: JSON.stringify({
        id: 'provider-id',
        provider: 'example',
        messageId: '<' + messageId + '@example.test>',
        event: 'bounce',
        category: 'hard',
      }),
    });
  assert.equal((await provider(false)).status, 401);
  assert.equal((await provider(true)).status, 204);
  assert.equal((await provider(true)).status, 204);
  assert.equal(db.prepare('SELECT count(*) FROM bounce_logs').pluck().get(), 1);
  assert.deepEqual(
    db.prepare('SELECT kind FROM tracking_events ORDER BY kind').pluck().all(),
    ['bounce', 'click', 'open', 'unsubscribe'],
  );
  const timestamp = String(Math.floor(Date.now() / 1000));
  const mailgunToken = 'a'.repeat(50);
  const validSignature = createHmac('sha256', secret)
    .update(timestamp + mailgunToken)
    .digest('hex');
  const mailgun = (signature) =>
    fetch(origin + '/api/webhooks/mailgun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: { timestamp, token: mailgunToken, signature },
        'event-data': {
          id: 'delivered-event',
          event: 'delivered',
          recipient: email,
          message: { headers: { 'message-id': messageId + '@example.test' } },
        },
      }),
    });
  assert.equal((await mailgun('0'.repeat(64))).status, 406);
  assert.equal((await mailgun(validSignature)).status, 200);
  assert.equal((await mailgun(validSignature)).status, 200);
  assert.equal(
    db
      .prepare("SELECT count(*) FROM tracking_events WHERE kind = 'delivered'")
      .pluck()
      .get(),
    1,
  );

  const form = {
    name: 'New Subscriber',
    email: 'new@example.test',
    consent: 'yes',
    'cf-turnstile-response': 'verified',
  };
  assert.equal((await send('/f/form', { ...form, consent: 'no' })).status, 400);
  assert.equal((await send('/f/form', form)).status, 200);
  assert.equal(confirmation.to, 'new@example.test');
  assert.equal(db.prepare('SELECT count(*) FROM contacts').pluck().get(), 0);
  const confirm = new URL(confirmation.url).pathname;
  assert.equal((await fetch(origin + confirm)).status, 200);
  assert.equal(db.prepare('SELECT count(*) FROM contacts').pluck().get(), 0);
  assert.equal((await send(confirm, {})).status, 200);
  assert.equal(
    db.prepare('SELECT subscription_status FROM contacts').pluck().get(),
    'subscribed',
  );
  assert.equal(
    db.prepare('SELECT count(*) FROM contact_list_members').pluck().get(),
    1,
  );
  assert.equal((await send(confirm, {})).status, 404);
});
