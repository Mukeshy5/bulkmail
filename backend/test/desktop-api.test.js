import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadCredentialStore } from '../src/credential-store.js';
import { openDatabase } from '../src/database.js';
import { createDesktopApp } from '../src/desktop-app.js';

async function serve(db, credentials) {
  const server = createDesktopApp(db, credentials).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    async call(channel, input, token, extraHeaders = {}) {
      const response = await fetch(
        origin + '/api/desktop/' + channel.replace(':', '/'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bulk-Mail-Client': 'desktop-v1',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...extraHeaders,
          },
          body: JSON.stringify({ input }),
        },
      );
      return { status: response.status, result: await response.json() };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('desktop HTTP API authenticates, applies permissions, and writes persistent backend data', async () => {
  const folder = await mkdtemp(
    path.join(os.tmpdir(), 'bulk-mail-desktop-api-'),
  );
  const filename = path.join(folder, 'backend.sqlite');
  const credentials = await loadCredentialStore(
    folder,
    Buffer.alloc(32, 7).toString('base64'),
  );
  let db = openDatabase(filename);
  let api = await serve(db, credentials);
  try {
    assert.equal((await api.call('contacts:list')).status, 401);
    assert.equal(
      (
        await api.call('auth:needs-setup', undefined, undefined, {
          Origin: 'https://example.test',
        })
      ).status,
      403,
    );
    assert.equal((await api.call('auth:needs-setup')).result.needsSetup, true);
    const loginDetails = {
      fullName: 'Integration Admin',
      username: 'testadmin',
      email: 'admin@example.test',
      password: 'ReliableTest#81',
    };
    assert.equal(
      (await api.call('auth:register', loginDetails)).result.ok,
      true,
    );
    assert.equal((await api.call('auth:needs-setup')).result.needsSetup, false);
    const loggedIn = (await api.call('auth:login', loginDetails)).result;
    assert.equal(loggedIn.user.role, 'super_admin');
    const { token } = loggedIn;
    assert.equal(
      (await api.call('auth:current-user', undefined, token)).result.user
        .username,
      'testadmin',
    );

    const added = await api.call(
      'contacts:create',
      { fullName: 'First Contact', email: 'first@example.test' },
      token,
    );
    assert.ok(added.result.ok, added.result.error);
    const fileData = Buffer.from(
      'Name,Email\r\nImported Person,second@example.test\r\n',
    ).toString('base64');
    assert.equal(
      (
        await api.call(
          'contacts:preview-import',
          { fileName: 'contacts.csv', fileData },
          token,
        )
      ).result.totalRows,
      1,
    );
    const imported = (
      await api.call(
        'contacts:import',
        {
          fileName: 'contacts.csv',
          fileData,
          mapping: { fullName: 'Name', email: 'Email' },
        },
        token,
      )
    ).result;
    assert.equal(imported.report.imported, 1);
    const contactsCsv = (await api.call('contacts:export', {}, token)).result;
    assert.equal(contactsCsv.count, 2);
    assert.match(contactsCsv.file.text, /first@example\.test/);
    const report = (
      await api.call(
        'workspace:exportReport',
        { type: 'contacts', format: 'xlsx' },
        token,
      )
    ).result;
    assert.ok(report.ok, report.error);
    assert.equal(
      Buffer.from(report.file.base64, 'base64').subarray(0, 2).toString(),
      'PK',
    );

    const createdUser = await api.call(
      'workspace:saveUser',
      {
        ...loginDetails,
        email: 'viewer@example.test',
        username: 'testviewer',
        role: 'viewer',
      },
      token,
    );
    assert.ok(createdUser.result.ok, createdUser.result.error);
    const viewer = (
      await api.call('auth:login', {
        username: 'testviewer',
        password: loginDetails.password,
      })
    ).result.token;
    assert.equal((await api.call('contacts:list', {}, viewer)).result.total, 2);
    assert.equal(
      (
        await api.call(
          'contacts:create',
          { fullName: 'Denied', email: 'denied@example.test' },
          viewer,
        )
      ).status,
      403,
    );

    await api.close();
    db.close();
    db = openDatabase(filename);
    api = await serve(db, credentials);
    assert.equal((await api.call('contacts:list', {}, token)).result.total, 2);
    assert.equal(
      (await api.call('auth:logout', undefined, token)).result.ok,
      true,
    );
    assert.equal((await api.call('contacts:list', {}, token)).status, 401);
  } finally {
    await api.close();
    if (db.open) db.close();
    await rm(filename, { force: true });
    await rmdir(folder);
  }
});

test('backend encrypts and authenticates SMTP credentials with its own key', async () => {
  const credentials = await loadCredentialStore(
    os.tmpdir(),
    Buffer.alloc(32, 5).toString('base64'),
  );
  const encoded = credentials.encrypt('temporary test credential');
  assert.equal(
    encoded.includes(Buffer.from('temporary test credential')),
    false,
  );
  assert.equal(credentials.decrypt(encoded), 'temporary test credential');
  const tampered = Buffer.from(encoded);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => credentials.decrypt(tampered));
  assert.throws(() => credentials.decrypt(Buffer.from('legacy')), {
    code: 'BULK_MAIL_LEGACY_SECRET',
  });
});
