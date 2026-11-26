import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  importContacts,
  previewContactImport,
} from '../src/main/contact-import-service.js';
import { createContact } from '../src/main/contacts-service.js';
import { openDatabase } from '../src/main/database.js';

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

test('CSV import previews columns and reports imported, duplicate, invalid, and suppressed rows', async () => {
  const database = createTestDatabase();
  createContact(database, null, {
    fullName: 'Suppressed Contact',
    email: 'blocked@example.com',
    subscriptionStatus: 'unsubscribed',
  });
  const fileData = new TextEncoder().encode(
    [
      'Full Name,Email,Company',
      'Alice Example,alice@example.com,Example Co',
      'Duplicate Alice,alice@example.com,Example Co',
      'Invalid Contact,not-an-email,Example Co',
      'Suppressed Contact,blocked@example.com,Example Co',
    ].join('\n'),
  );
  const input = {
    fileName: 'contacts.csv',
    fileData,
    mapping: {
      fullName: 'Full Name',
      email: 'Email',
      company: 'Company',
    },
  };

  const preview = await previewContactImport(input);
  const imported = await importContacts(database, null, input);

  assert.deepEqual(preview.headers, ['Full Name', 'Email', 'Company']);
  assert.equal(preview.totalRows, 4);
  assert.deepEqual(imported.report, {
    filename: 'contacts.csv',
    totalRows: 4,
    imported: 1,
    duplicates: 1,
    invalid: 1,
    suppressed: 1,
    issues: [
      { row: 3, reason: 'Duplicate email address.' },
      { row: 4, reason: 'Enter a valid email address.' },
      { row: 5, reason: 'Address is suppressed (unsubscribed).' },
    ],
  });

  const contact = database
    .prepare('SELECT subscription_status FROM contacts WHERE email = ?')
    .get('alice@example.com');
  assert.equal(contact.subscription_status, 'pending');
});

test('import rejects unsupported formats and missing email mapping', async () => {
  const database = createTestDatabase();
  const fileData = new TextEncoder().encode(
    'Name,Email\nAlice,alice@example.com\n',
  );
  const unsupported = await previewContactImport({
    fileName: 'contacts.xls',
    fileData,
  });
  const unmapped = await importContacts(database, null, {
    fileName: 'contacts.csv',
    fileData,
    mapping: { fullName: 'Name' },
  });

  assert.equal(unsupported.ok, false);
  assert.match(unsupported.error, /Only \.csv and \.xlsx/);
  assert.equal(unmapped.ok, false);
  assert.match(unmapped.error, /Map a spreadsheet column to Email/);
});
