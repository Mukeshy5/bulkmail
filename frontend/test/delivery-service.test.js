import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../src/main/database.js';
import { createCampaignDraft } from '../src/main/campaign-service.js';
import {
  createContact,
  createContactList,
  replaceContactListMembers,
} from '../src/main/contacts-service.js';
import {
  saveSegment,
  resolveAudience,
  listSegments,
} from '../src/main/audience-service.js';
import {
  createDeliveryWorker,
  planCampaign,
  scheduleDate,
} from '../src/main/delivery-service.js';
import {
  campaignMetrics,
  analytics,
  report,
} from '../src/main/report-service.js';
import { saveSettings, setSetting } from '../src/main/operations.js';

function fixture(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  saveSettings(db, {
    publicUrl: 'https://public.example.test',
    businessAddress: '12 Example Road',
    intervalSeconds: 1,
    hourlyLimit: 100,
    trackOpen: true,
    trackClick: true,
  });
  setSetting(db, 'publicInstance', 'test-instance');
  const date = new Date().toISOString();
  db.prepare(
    "INSERT INTO smtp_accounts VALUES ('smtp', NULL, 'Example', 'smtp.example.test', 587, 'starttls', 'user', ?, 'Example sender', 'sender@example.test', '', 1, 1, 'connected', ?, ?, ?, 'password')",
  ).run(Buffer.from('example'), date, date, date);
  const contact = (email, name, status = 'subscribed') =>
    createContact(db, null, {
      fullName: name,
      email,
      country: 'India',
      subscriptionStatus: status,
      consentAt: date,
      consentSource: 'integration test',
    }).contact;
  const list = (name, ids) => {
    const item = createContactList(db, null, { name }).list;
    replaceContactListMembers(db, null, item.id, ids);
    return item.id;
  };
  const campaign = (input) =>
    createCampaignDraft(db, null, {
      name: 'Newsletter',
      subject: 'Hello {{first_name | default: "there"}}',
      customHtml:
        '<p>Hi {{first_name}}</p><a href="https://example.test/news">News</a><script>unsafe()</script>',
      ...input,
    }).campaign;
  return { db, date, contact, list, campaign };
}

test('schedule converts wall-clock times and rejects ambiguous DST times', () => {
  assert.equal(
    scheduleDate('2030-01-01T10:00', 'Asia/Kolkata'),
    '2030-01-01T04:30:00.000Z',
  );
  assert.equal(scheduleDate('2030-11-03T01:30', 'America/New_York'), null);
  assert.equal(scheduleDate('2030-03-10T02:30', 'America/New_York'), null);
});

test('campaign queue deduplicates, rechecks consent, and records SMTP submission separately from delivery', async (t) => {
  const { db, contact, list, campaign } = fixture(t);
  const optIn = contact('ready@example.test', 'Alice Ready');
  const blocked = contact('blocked@example.test', 'Bob Blocked');
  const pending = contact('pending@example.test', 'Pat Pending', 'pending');
  const a = list('A list', [optIn.id, blocked.id, pending.id]);
  const b = list('B list', [optIn.id]);
  assert.equal(
    saveSegment(db, {
      name: 'India',
      mode: 'and',
      rules: [{ field: 'country', operator: 'eq', value: 'India' }],
    }).ok,
    true,
  );
  const segment = listSegments(db)[0];
  assert.equal(
    resolveAudience(db, { listIds: [a, b], segmentId: segment.id }).length,
    2,
  );
  const draft = campaign({ listIds: [a, b], segmentId: segment.id });
  assert.equal(planCampaign(db, null, draft.id).count, 2);
  db.prepare(
    "UPDATE contacts SET subscription_status='unsubscribed' WHERE id=?",
  ).run(blocked.id);
  const messages = [];
  const worker = createDeliveryWorker(db, {
    decrypt: () => 'password',
    checkPublicService: async () => true,
    createTransport: () => ({
      close() {},
      async sendMail(mail) {
        messages.push(mail);
        return { accepted: [mail.to.address] };
      },
    }),
  });
  await worker.tick();
  db.prepare(
    "UPDATE email_logs SET created_at = '2000' WHERE kind = 'attempt'",
  ).run();
  await worker.tick();
  await worker.tick();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to.address, optIn.email);
  assert.equal(messages[0].subject, 'Hello Alice');
  assert.match(messages[0].html, /https:\/\/public\.example\.test\/r\//);
  assert.match(messages[0].html, /https:\/\/public\.example\.test\/o\//);
  assert.doesNotMatch(messages[0].html, /<script|unsafe\(\)/);
  assert.match(messages[0].headers['List-Unsubscribe'], /\/u\//);
  assert.deepEqual(campaignMetrics(db, draft.id).states, {
    skipped: 1,
    submitted: 1,
  });
  assert.equal(analytics(db, {}).submitted, 1);
  assert.equal(report(db, { type: 'campaigns' }).rows[0].delivered, 0);
});

test('worker retries a temporary SMTP refusal and leaves interrupted acceptance uncertain', async (t) => {
  const { db, contact, list, campaign } = fixture(t);
  const person = contact('one@example.test', 'One Person');
  const draft = campaign({ listIds: [list('Opted in', [person.id])] });
  assert.equal(planCampaign(db, null, draft.id).ok, true);
  const options = {
    decrypt: () => 'password',
    checkPublicService: async () => true,
    createTransport: () => ({
      close() {},
      async sendMail() {
        throw Object.assign(new Error('Deferred'), { responseCode: 451 });
      },
    }),
  };
  await createDeliveryWorker(db, options).tick();
  assert.deepEqual(campaignMetrics(db, draft.id).states, { pending: 1 });
  const queue = db.prepare('SELECT * FROM email_queue').get();
  assert.equal(queue.attempts, 1);
  assert.ok(Date.parse(queue.next_at) > Date.now());
  db.prepare("UPDATE email_queue SET state = 'working'").run();
  await createDeliveryWorker(db, options).tick();
  assert.deepEqual(campaignMetrics(db, draft.id).states, { uncertain: 1 });
  assert.equal(campaignMetrics(db, draft.id).campaign.status, 'failed');
});
