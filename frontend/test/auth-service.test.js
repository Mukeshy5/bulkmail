import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { loginUser, registerUser } from '../src/main/auth-service.js';
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

test('registration stores a bcrypt hash and grants first-user admin access', async () => {
  const database = createTestDatabase();
  const result = await registerUser(database, {
    fullName: 'Admin User',
    username: 'admin.user',
    email: 'admin@example.com',
    password: 'Strong!Password42',
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.role, 'super_admin');
  assert.equal('password_hash' in result.user, false);

  const storedUser = database
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(result.user.id);
  assert.match(storedUser.password_hash, /^\$2[aby]\$12\$/);
  assert.notEqual(storedUser.password_hash, 'Strong!Password42');
});

test('registration prevents duplicate accounts and limits later self-registration', async () => {
  const database = createTestDatabase();
  const firstUser = await registerUser(database, {
    fullName: 'Admin User',
    username: 'admin',
    email: 'admin@example.com',
    password: 'Strong!Password42',
  });
  const secondUser = await registerUser(database, {
    fullName: 'Second User',
    username: 'second',
    email: 'second@example.com',
    password: 'Another!Password42',
  });
  const duplicate = await registerUser(database, {
    fullName: 'Duplicate User',
    username: 'admin',
    email: 'different@example.com',
    password: 'Another!Password42',
  });

  assert.equal(firstUser.user.role, 'super_admin');
  assert.equal(secondUser.user.role, 'viewer');
  assert.deepEqual(duplicate, {
    ok: false,
    error: 'That username or email is already registered.',
  });
});

test('login accepts the correct password and rejects invalid credentials', async () => {
  const database = createTestDatabase();
  await registerUser(database, {
    fullName: 'Admin User',
    username: 'admin',
    email: 'admin@example.com',
    password: 'Strong!Password42',
  });

  const successfulLogin = await loginUser(database, {
    username: 'ADMIN',
    password: 'Strong!Password42',
  });
  const failedLogin = await loginUser(database, {
    username: 'admin',
    password: 'Wrong!Password42',
  });

  assert.equal(successfulLogin.ok, true);
  assert.equal(successfulLogin.user.username, 'admin');
  assert.deepEqual(failedLogin, {
    ok: false,
    error: 'Username or password is incorrect.',
  });
});

test('login locks an account after five consecutive failures', async () => {
  const database = createTestDatabase();
  await registerUser(database, {
    fullName: 'Admin User',
    username: 'admin',
    email: 'admin@example.com',
    password: 'Strong!Password42',
  });

  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = await loginUser(database, {
      username: 'admin',
      password: 'Wrong!Password42',
    });
  }

  assert.deepEqual(result, {
    ok: false,
    error: 'Too many failed attempts. Try again in 15 minutes.',
  });
  assert.equal(
    database
      .prepare('SELECT failed_login_attempts FROM users WHERE username = ?')
      .get('admin').failed_login_attempts,
    5,
  );
});

test('accounts remain available after reopening the SQLite database', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bulk-mail-auth-'));
  const databasePath = path.join(directory, 'accounts.sqlite');
  let database = openDatabase(databasePath);

  try {
    await registerUser(database, {
      fullName: 'Admin User',
      username: 'admin',
      email: 'admin@example.com',
      password: 'Strong!Password42',
    });
    database.close();

    database = openDatabase(databasePath);
    const result = await loginUser(database, {
      username: 'admin',
      password: 'Strong!Password42',
    });
    assert.equal(result.ok, true);
    assert.equal(result.user.email, 'admin@example.com');
  } finally {
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
