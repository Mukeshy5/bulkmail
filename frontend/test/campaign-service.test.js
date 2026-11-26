import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  createCampaignDraft,
  deleteCampaignDraft,
  duplicateCampaignDraft,
  getCampaign,
  listCampaigns,
  updateCampaignDraft,
} from '../src/main/campaign-service.js';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from '../src/main/email-template-service.js';
import { createContactList } from '../src/main/contacts-service.js';
import { openDatabase } from '../src/main/database.js';

const databases = [];

function createTestDatabase() {
  const database = openDatabase(':memory:');
  databases.push(database);
  return database;
}

function templateInput(overrides = {}) {
  return {
    name: 'Customer account update',
    description: 'Update for existing customers',
    subject: 'An update for {{first_name}}',
    htmlBody: '<h1>Hello {{first_name}}</h1>',
    textBody: 'Hello {{first_name}}',
    ...overrides,
  };
}

function campaignInput(overrides = {}) {
  return {
    name: 'November newsletter',
    description: 'Monthly product update',
    campaignType: 'newsletter',
    subject: 'The latest news',
    senderName: 'Example team',
    senderEmail: 'updates@example.com',
    replyToEmail: 'support@example.com',
    recipientListId: null,
    templateId: 'template-newsletter',
    smtpAccountId: null,
    ...overrides,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

test('built-in templates seed once and cannot be deleted', () => {
  const database = createTestDatabase();
  const first = listEmailTemplates(database);
  const second = listEmailTemplates(database);

  assert.equal(first.templates.length, 19);
  assert.equal(second.templates.length, 19);
  assert.equal(
    first.templates.every((template) => template.isSystem),
    true,
  );
  assert.match(first.templates[0].htmlBody, /unsubscribe_url/);
  assert.equal(
    deleteEmailTemplate(database, null, 'template-newsletter').ok,
    false,
  );
});

test('custom templates support create, update, duplicate and delete', () => {
  const database = createTestDatabase();
  const created = createEmailTemplate(database, null, templateInput());
  assert.equal(created.ok, true);
  assert.equal(created.template.isSystem, false);

  const updated = updateEmailTemplate(
    database,
    null,
    created.template.id,
    templateInput({ subject: 'A new update' }),
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.template.subject, 'A new update');

  const duplicated = duplicateEmailTemplate(
    database,
    null,
    created.template.id,
  );
  assert.equal(duplicated.ok, true);
  assert.equal(duplicated.template.name, 'Customer account update copy');
  assert.equal(
    deleteEmailTemplate(database, null, created.template.id).ok,
    true,
  );
});

test('template validation rejects oversized HTML and header injection', () => {
  const database = createTestDatabase();
  const oversized = createEmailTemplate(
    database,
    null,
    templateInput({ htmlBody: 'x'.repeat(500 * 1024 + 1) }),
  );
  const invalidSubject = createEmailTemplate(
    database,
    null,
    templateInput({ subject: 'Hello\r\nBcc: other@example.com' }),
  );

  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /500 KB/);
  assert.equal(invalidSubject.ok, false);
  assert.match(invalidSubject.error, /subject/);
});

test('campaign drafts validate references and support update, duplicate and delete', () => {
  const database = createTestDatabase();
  const list = createContactList(database, null, {
    name: 'Newsletter audience',
    description: 'Opted-in readers',
  });
  const draft = createCampaignDraft(
    database,
    null,
    campaignInput({ recipientListId: list.list.id }),
  );

  assert.equal(draft.ok, true);
  assert.equal(draft.campaign.status, 'draft');
  assert.equal(draft.campaign.recipientListName, 'Newsletter audience');

  const updated = updateCampaignDraft(
    database,
    null,
    draft.campaign.id,
    campaignInput({
      name: 'November newsletter v2',
      recipientListId: list.list.id,
    }),
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.campaign.name, 'November newsletter v2');

  const duplicated = duplicateCampaignDraft(database, null, draft.campaign.id);
  assert.equal(duplicated.ok, true);
  assert.equal(duplicated.campaign.status, 'draft');
  assert.equal(duplicated.campaign.name, 'November newsletter v2 copy');
  assert.equal(listCampaigns(database).campaigns.length, 2);
  assert.equal(getCampaign(database, draft.campaign.id).ok, true);
  assert.equal(deleteCampaignDraft(database, null, draft.campaign.id).ok, true);
});

test('campaign drafts reject invalid references and protect non-draft campaigns', () => {
  const database = createTestDatabase();
  const invalid = createCampaignDraft(
    database,
    null,
    campaignInput({ recipientListId: 'missing-list' }),
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /recipient list/);

  const created = createCampaignDraft(database, null, campaignInput());
  database
    .prepare("UPDATE campaigns SET status = 'scheduled' WHERE id = ?")
    .run(created.campaign.id);
  assert.equal(
    deleteCampaignDraft(database, null, created.campaign.id).ok,
    false,
  );
  const update = updateCampaignDraft(
    database,
    null,
    created.campaign.id,
    campaignInput(),
  );
  assert.equal(update.ok, false);
  assert.match(update.error, /Only draft/);
});
