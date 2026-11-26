import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const HASH_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const genericLoginError = 'Username or password is incorrect.';

function safeUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

function recordFailedLogin(database, userId) {
  return database
    .transaction(() => {
      const user = database
        .prepare(
          'SELECT failed_login_attempts, locked_until FROM users WHERE id = ?',
        )
        .get(userId);
      const now = Date.now();

      if (user.locked_until && user.locked_until > now) {
        return true;
      }

      const previousAttempts =
        user.locked_until && user.locked_until <= now
          ? 0
          : user.failed_login_attempts;
      const failedAttempts = previousAttempts + 1;
      const lockedUntil =
        failedAttempts >= MAX_FAILED_LOGINS ? now + LOCKOUT_DURATION_MS : null;

      database
        .prepare(
          `UPDATE users
         SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
         WHERE id = ?`,
        )
        .run(failedAttempts, lockedUntil, new Date(now).toISOString(), userId);

      return failedAttempts >= MAX_FAILED_LOGINS;
    })
    .immediate();
}

function resetFailedLogins(database, userId) {
  return database
    .transaction(() => {
      const user = database
        .prepare('SELECT locked_until FROM users WHERE id = ?')
        .get(userId);
      const now = Date.now();

      if (user.locked_until && user.locked_until > now) {
        return false;
      }

      database
        .prepare(
          `UPDATE users
         SET failed_login_attempts = 0, locked_until = NULL, updated_at = ?
         WHERE id = ?`,
        )
        .run(new Date(now).toISOString(), userId);
      return true;
    })
    .immediate();
}

function validateRegistration(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'Enter your account details.' };
  }

  const fullName =
    typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const username =
    typeof input.username === 'string'
      ? input.username.trim().toLowerCase()
      : '';
  const email =
    typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (fullName.length < 2 || fullName.length > 100) {
    return { error: 'Full name must be between 2 and 100 characters.' };
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return {
      error:
        'Username must be 3–30 characters using letters, numbers, dots, _ or -.',
    };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (
    password.length < 12 ||
    Buffer.byteLength(password) > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return {
      error:
        'Password must be 12–72 UTF-8 bytes and include uppercase, lowercase, a number, and a symbol.',
    };
  }

  return { fullName, username, email, password };
}

export async function registerUser(
  database,
  input,
  { setupOnly = false } = {},
) {
  const details = validateRegistration(input);
  if (details.error) {
    return { ok: false, error: details.error };
  }

  const existingUser = database
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(details.username, details.email);
  if (existingUser) {
    return {
      ok: false,
      error: 'That username or email is already registered.',
    };
  }

  const passwordHash = await bcrypt.hash(details.password, HASH_ROUNDS);
  const now = new Date().toISOString();
  const createUser = database.transaction(() => {
    const userCount = database
      .prepare('SELECT COUNT(*) AS count FROM users')
      .get().count;
    if (setupOnly && userCount !== 0) return null;
    const role = userCount === 0 ? 'super_admin' : 'viewer';
    const user = {
      id: randomUUID(),
      full_name: details.fullName,
      username: details.username,
      email: details.email,
      password_hash: passwordHash,
      role,
      created_at: now,
      updated_at: now,
    };

    database
      .prepare(
        `INSERT INTO users (
          id, full_name, username, email, password_hash, role, created_at, updated_at
        ) VALUES (
          @id, @full_name, @username, @email, @password_hash, @role, @created_at, @updated_at
        )`,
      )
      .run(user);

    return safeUser(user);
  });

  try {
    const user = createUser.immediate();
    return user
      ? { ok: true, user }
      : {
          ok: false,
          error: 'The workspace administrator creates additional accounts.',
        };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return {
        ok: false,
        error: 'That username or email is already registered.',
      };
    }
    throw error;
  }
}

export async function loginUser(database, input) {
  const username =
    input && typeof input.username === 'string'
      ? input.username.trim().toLowerCase()
      : '';
  const password =
    input && typeof input.password === 'string' ? input.password : '';

  if (
    !username ||
    username.length > 254 ||
    !password ||
    password.length > 128
  ) {
    return { ok: false, error: genericLoginError };
  }

  const user = database
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username);
  if (!user || !user.is_active) {
    return { ok: false, error: genericLoginError };
  }

  const now = Date.now();
  if (user.locked_until && user.locked_until <= now) {
    database
      .prepare(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      )
      .run(user.id);
  } else if (user.locked_until && user.locked_until > now) {
    return {
      ok: false,
      error: 'Too many failed attempts. Try again in 15 minutes.',
    };
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    database
      .prepare('INSERT INTO login_history VALUES (?, ?, 0, ?)')
      .run(randomUUID(), user.id, new Date().toISOString());
    const isLocked = recordFailedLogin(database, user.id);
    return {
      ok: false,
      error: isLocked
        ? 'Too many failed attempts. Try again in 15 minutes.'
        : genericLoginError,
    };
  }

  if (!resetFailedLogins(database, user.id)) {
    return {
      ok: false,
      error: 'Too many failed attempts. Try again in 15 minutes.',
    };
  }

  const current = database
    .prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1 AND password_hash = ?',
    )
    .get(user.id, user.password_hash);
  if (!current) return { ok: false, error: genericLoginError };
  const lastLogin = new Date().toISOString();
  database
    .transaction(() => {
      database
        .prepare('UPDATE users SET last_login = ? WHERE id = ?')
        .run(lastLogin, user.id);
      database
        .prepare('INSERT INTO login_history VALUES (?, ?, 1, ?)')
        .run(randomUUID(), user.id, lastLogin);
    })
    .immediate();
  return { ok: true, user: safeUser(current) };
}
