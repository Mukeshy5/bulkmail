import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  createSmtpAccount,
  deleteSmtpAccount,
  listSmtpAccounts,
  setDefaultSmtpAccount,
  testSmtpAccount,
  updateSmtpAccount,
} from '../src/main/smtp-service.js';
import { openDatabase } from '../src/main/database.js';

const databases = [];
const encryptSecret = (secret) => Buffer.from(`encrypted:${secret}`);

function createTestDatabase() {
  const database = openDatabase(':memory:');
  databases.push(database);
  return database;
}

function smtpInput(overrides = {}) {
  return {
    name: 'Primary mail',
    host: 'smtp.example.com',
    port: 587,
    encryption: 'starttls',
    username: 'mailer@example.com',
    password: 'provider-app-password',
    senderName: 'Bulk Mail',
    senderEmail: 'mailer@example.com',
    replyToEmail: '',
    isEnabled: true,
    isDefault: true,
    ...overrides,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

test('SMTP credentials are encrypted at rest and omitted from list results', () => {
  const database = createTestDatabase();
  const created = createSmtpAccount(database, null, smtpInput(), encryptSecret);

  assert.equal(created.ok, true);
  assert.equal('password' in created.account, false);
  assert.equal('encryptedPassword' in created.account, false);
  assert.equal(created.account.isDefault, true);

  const stored = database
    .prepare('SELECT encrypted_password FROM smtp_accounts WHERE id = ?')
    .get(created.account.id);
  assert.deepEqual(
    stored.encrypted_password,
    encryptSecret('provider-app-password'),
  );

  const listed = listSmtpAccounts(database);
  assert.equal(listed.accounts.length, 1);
  assert.equal('password' in listed.accounts[0], false);
  assert.equal('encrypted_password' in listed.accounts[0], false);
});

test('Microsoft OAuth2 credentials stay encrypted and are passed to the registered provider', async () => {
  const database = createTestDatabase();
  const input = smtpInput({
    host: 'smtp.office365.com',
    authType: 'microsoft',
    oauthClientId: 'example-client-id',
    password: 'test-refresh-token',
    oauthClientSecret: 'test-client-secret',
  });
  const created = createSmtpAccount(database, null, input, encryptSecret);
  assert.ok(created.ok, created.error);
  assert.equal(created.account.authType, 'microsoft');
  assert.equal('oauthClientSecret' in created.account, false);
  assert.equal('oauthClientId' in created.account, false);
  let options;
  const result = await testSmtpAccount(database, null, created.account.id, {
    decryptSecret: (buffer) => buffer.toString().slice('encrypted:'.length),
    createTransport: (config) => {
      options = config;
      return { verify: async () => {}, close() {} };
    },
  });
  assert.ok(result.ok, result.error);
  assert.equal(options.requireTLS, true);
  assert.equal(options.auth.type, 'OAuth2');
  assert.equal(options.auth.refreshToken, 'test-refresh-token');
  assert.equal(
    options.auth.accessUrl,
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  );
  assert.equal(
    createSmtpAccount(
      database,
      null,
      { ...input, host: 'smtp.example.test' },
      encryptSecret,
    ).ok,
    false,
  );
});

test('SMTP validation rejects invalid settings without storing an account', () => {
  const database = createTestDatabase();
  const result = createSmtpAccount(
    database,
    null,
    smtpInput({ port: 70000 }),
    encryptSecret,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /SMTP port/);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM smtp_accounts').get().count,
    0,
  );
});

test('SMTP validation rejects control characters in header and login fields', () => {
  const database = createTestDatabase();
  const result = createSmtpAccount(
    database,
    null,
    smtpInput({ senderName: 'Sender\r\nBcc: other@example.com' }),
    encryptSecret,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /sender name/);
});

test('default SMTP is unique and editing without a password retains its secret', () => {
  const database = createTestDatabase();
  const first = createSmtpAccount(database, null, smtpInput(), encryptSecret);
  const originalSecret = database
    .prepare('SELECT encrypted_password FROM smtp_accounts WHERE id = ?')
    .get(first.account.id).encrypted_password;
  const second = createSmtpAccount(
    database,
    null,
    smtpInput({
      name: 'Backup mail',
      isDefault: true,
      password: 'second-app-password',
    }),
    encryptSecret,
  );

  assert.equal(
    database
      .prepare(
        'SELECT COUNT(*) AS count FROM smtp_accounts WHERE is_default = 1',
      )
      .get().count,
    1,
  );
  const updated = updateSmtpAccount(
    database,
    null,
    first.account.id,
    smtpInput({ password: '', isDefault: false }),
    encryptSecret,
  );
  assert.equal(updated.ok, true);
  assert.deepEqual(
    database
      .prepare('SELECT encrypted_password FROM smtp_accounts WHERE id = ?')
      .get(first.account.id).encrypted_password,
    originalSecret,
  );

  const disabled = updateSmtpAccount(
    database,
    null,
    second.account.id,
    smtpInput({
      name: 'Backup mail',
      password: '',
      isEnabled: false,
      isDefault: true,
    }),
    encryptSecret,
  );
  assert.equal(disabled.ok, true);
  assert.equal(disabled.account.isDefault, false);
  assert.equal(
    setDefaultSmtpAccount(database, null, second.account.id).ok,
    false,
  );
});

test('creating a disabled default candidate does not unset the active default', () => {
  const database = createTestDatabase();
  const active = createSmtpAccount(database, null, smtpInput(), encryptSecret);
  const disabled = createSmtpAccount(
    database,
    null,
    smtpInput({
      name: 'Disabled account',
      isEnabled: false,
      isDefault: true,
    }),
    encryptSecret,
  );

  assert.equal(active.ok, true);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.account.isDefault, false);
  assert.equal(
    database.prepare('SELECT id FROM smtp_accounts WHERE is_default = 1').get()
      .id,
    active.account.id,
  );
});

test('SMTP tests verify connections and record a credential-safe status', async () => {
  const database = createTestDatabase();
  const created = createSmtpAccount(database, null, smtpInput(), encryptSecret);
  let transportOptions;
  const succeeded = await testSmtpAccount(database, null, created.account.id, {
    decryptSecret: (value) => value.toString().replace('encrypted:', ''),
    createTransport: (options) => {
      transportOptions = options;
      return { verify: async () => true, close() {} };
    },
  });

  assert.equal(succeeded.ok, true);
  assert.equal(transportOptions.secure, false);
  assert.equal(transportOptions.requireTLS, true);
  assert.equal(transportOptions.auth.pass, 'provider-app-password');
  assert.equal(
    database
      .prepare('SELECT connection_status FROM smtp_accounts WHERE id = ?')
      .get(created.account.id).connection_status,
    'connected',
  );

  const failed = await testSmtpAccount(database, null, created.account.id, {
    decryptSecret: (value) => value.toString(),
    createTransport: () => ({
      verify: async () => {
        const error = new Error('details must not be surfaced');
        error.code = 'ETIMEDOUT';
        throw error;
      },
      close() {},
    }),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /ETIMEDOUT/);
  assert.doesNotMatch(failed.error, /details must not be surfaced/);
  assert.equal(
    database
      .prepare('SELECT connection_status FROM smtp_accounts WHERE id = ?')
      .get(created.account.id).connection_status,
    'failed',
  );
});

test('SMTP storage decryption failures are surfaced without marking the account failed', async () => {
  const database = createTestDatabase();
  const created = createSmtpAccount(database, null, smtpInput(), encryptSecret);

  await assert.rejects(
    testSmtpAccount(database, null, created.account.id, {
      decryptSecret: () => {
        throw new Error('Secure credential decryption is unavailable.');
      },
      createTransport: () => {
        throw new Error('Transport must not be created.');
      },
    }),
    /Secure credential decryption is unavailable/,
  );
  assert.equal(
    database
      .prepare('SELECT connection_status FROM smtp_accounts WHERE id = ?')
      .get(created.account.id).connection_status,
    'untested',
  );
});

test('SMTP accounts can be deleted without exposing or retaining their secret', () => {
  const database = createTestDatabase();
  const created = createSmtpAccount(database, null, smtpInput(), encryptSecret);
  const removed = deleteSmtpAccount(database, null, created.account.id);

  assert.deepEqual(removed, { ok: true });
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM smtp_accounts').get().count,
    0,
  );
});
