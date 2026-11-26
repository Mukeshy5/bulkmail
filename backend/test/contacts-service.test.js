import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  createContact,
  createContactList,
  getContactListMembers,
  getDashboardSummary,
  listContacts,
  replaceContactListMembers,
  updateContact,
} from '../src/contacts-service.js';
import { openDatabase } from '../src/database.js';

const databases = [];

function createTestDatabase() {
  const database = openDatabase(':memory:');
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

test('active subscribers require consent evidence and suppression cannot be bypassed', () => {
  const database = createTestDatabase();
  const missingConsent = createContact(database, null, {
    fullName: 'Subscribed Contact',
    email: 'person@example.com',
    subscriptionStatus: 'subscribed',
  });

  assert.equal(missingConsent.ok, false);

  const unsubscribed = createContact(database, null, {
    fullName: 'Unsubscribed Contact',
    email: 'person@example.com',
    subscriptionStatus: 'unsubscribed',
  });
  const attemptedResubscribe = updateContact(
    database,
    null,
    unsubscribed.contact.id,
    {
      ...unsubscribed.contact,
      subscriptionStatus: 'subscribed',
      consentSource: 'Website form',
      consentAt: '2025-01-01',
    },
  );
  const suppressionCount = database
    .prepare('SELECT COUNT(*) AS count FROM suppression_list')
    .get().count;

  assert.equal(unsubscribed.ok, true);
  assert.equal(attemptedResubscribe.ok, false);
  assert.equal(suppressionCount, 1);
});

test('contact search, list membership, and dashboard data use persisted rows', () => {
  const database = createTestDatabase();
  const firstContact = createContact(database, null, {
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    city: 'London',
  });
  const secondContact = createContact(database, null, {
    fullName: 'Grace Hopper',
    email: 'grace@example.com',
    subscriptionStatus: 'subscribed',
    consentSource: 'Event registration',
    consentAt: '2024-06-01',
  });
  const contactList = createContactList(database, null, {
    name: 'Conference contacts',
  });

  const search = listContacts(database, { search: 'ada' });
  const membership = replaceContactListMembers(
    database,
    null,
    contactList.list.id,
    [firstContact.contact.id, firstContact.contact.id],
  );
  const members = getContactListMembers(database, contactList.list.id);
  const dashboard = getDashboardSummary(database);

  assert.equal(search.total, 1);
  assert.equal(search.contacts[0].email, 'ada@example.com');
  assert.deepEqual(membership, { ok: true, memberCount: 1 });
  assert.equal(members.contacts.length, 1);
  assert.equal(dashboard.contacts.total, 2);
  assert.equal(dashboard.contacts.subscribed, 1);
  assert.equal(dashboard.contactLists, 1);
  assert.equal(secondContact.contact.subscriptionStatus, 'subscribed');
});
