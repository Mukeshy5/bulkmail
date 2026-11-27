import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  createContact,
  createContactList,
  getContactListMembers,
  getDashboardSummary,
  listContacts,
  replaceContactListMembers,
  updateContact,
} from "../src/contacts-service.js";
import { openDatabase } from "../src/database.js";

const databases = [];

function createTestDatabase() {
  const database = openDatabase(":memory:");
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

test("active subscribers require consent evidence and suppression cannot be bypassed", () => {
  const database = createTestDatabase();
  const missingConsent = createContact(database, null, {
    fullName: "Subscribed Contact",
    email: "person@example.com",
    company: "Example Company",
    phone: "555-0101",
    subscriptionStatus: "subscribed",
  });

  assert.equal(missingConsent.ok, false);

  const unsubscribed = createContact(database, null, {
    fullName: "Unsubscribed Contact",
    email: "person@example.com",
    company: "Example Company",
    phone: "555-0102",
    subscriptionStatus: "unsubscribed",
  });
  const attemptedResubscribe = updateContact(database, null, unsubscribed.contact.id, {
    ...unsubscribed.contact,
    subscriptionStatus: "subscribed",
    consentSource: "Website form",
    consentAt: "2025-01-01",
  });
  const suppressionCount = database
    .prepare("SELECT COUNT(*) AS count FROM suppression_list")
    .get().count;

  assert.equal(unsubscribed.ok, true);
  assert.equal(attemptedResubscribe.ok, false);
  assert.equal(suppressionCount, 1);
});

test("contact search, list membership, and dashboard data use persisted rows", () => {
  const database = createTestDatabase();
  const firstContact = createContact(database, null, {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    phone: "555-0103",
    city: "London",
  });
  const secondContact = createContact(database, null, {
    fullName: "Grace Hopper",
    email: "grace@example.com",
    company: "Navy Research",
    phone: "555-0104",
    subscriptionStatus: "subscribed",
    consentSource: "Event registration",
    consentAt: "2024-06-01",
  });
  const contactList = createContactList(database, null, {
    name: "Conference contacts",
  });

  const search = listContacts(database, { search: "ada" });
  const membership = replaceContactListMembers(database, null, contactList.list.id, [
    firstContact.contact.id,
    firstContact.contact.id,
  ]);
  const members = getContactListMembers(database, contactList.list.id);
  const dashboard = getDashboardSummary(database);

  assert.equal(search.total, 1);
  assert.equal(search.contacts[0].email, "ada@example.com");
  assert.deepEqual(membership, { ok: true, memberCount: 1 });
  assert.equal(members.contacts.length, 1);
  assert.equal(dashboard.contacts.total, 2);
  assert.equal(dashboard.contacts.subscribed, 1);
  assert.equal(dashboard.contactLists, 1);
  assert.equal(secondContact.contact.subscriptionStatus, "subscribed");
});

test("manual contact creation and updates require name, email, company, and phone", () => {
  const database = createTestDatabase();
  const missingCompany = createContact(database, null, {
    fullName: "Alex Example",
    email: "alex@example.com",
    phone: "555-0105",
  });
  const missingPhone = createContact(database, null, {
    fullName: "Taylor Example",
    email: "taylor@example.com",
    company: "Example Company",
  });

  assert.equal(missingCompany.ok, false);
  assert.match(missingCompany.error, /company name/);
  assert.equal(missingPhone.ok, false);
  assert.match(missingPhone.error, /phone number/);

  const created = createContact(database, null, {
    fullName: "Jordan Example",
    email: "jordan@example.com",
    company: "Example Company",
    phone: "555-0106",
  });
  const update = updateContact(database, null, created.contact.id, {
    ...created.contact,
    company: "",
  });

  assert.equal(created.ok, true);
  assert.equal(update.ok, false);
  assert.match(update.error, /company name/);
});
