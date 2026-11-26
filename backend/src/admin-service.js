import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { recordActivity } from './operations.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const problem = (error) => ({ ok: false, error });
const publicUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  username: row.username,
  email: row.email,
  role: row.role,
  active: Boolean(row.is_active),
  lastLogin: row.last_login,
});
const roles = [
  'administrator',
  'marketing_manager',
  'campaign_operator',
  'viewer',
];

export const needsSetup = (db) =>
  !db.prepare('SELECT 1 FROM users LIMIT 1').get();
export const listUsers = (db) =>
  db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser);
export const getUser = (db, id) => {
  const user =
    id &&
    db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(id);
  return user
    ? {
        ...publicUser(user),
        permissions: db
          .prepare('SELECT permission FROM permissions WHERE role_id = ?')
          .pluck()
          .all(user.role),
      }
    : null;
};
export const listLoginHistory = (db) =>
  db
    .prepare(
      'SELECT l.*, u.username FROM login_history l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 300',
    )
    .all();
export const rolePermissions = (db) =>
  db
    .prepare(
      'SELECT role_id, permission FROM permissions ORDER BY role_id, permission',
    )
    .all();

export function saveRolePermissions(db, actor, input) {
  if (
    !['marketing_manager', 'campaign_operator', 'viewer'].includes(
      input?.role,
    ) ||
    typeof input.edit !== 'boolean' ||
    typeof input.send !== 'boolean' ||
    (input.send && !input.edit)
  ) {
    return problem(
      'Choose valid role permissions. Sending access requires editing access.',
    );
  }
  db.transaction(() => {
    db.prepare(
      "DELETE FROM permissions WHERE role_id = ? AND permission IN ('workspace.edit','campaign.send')",
    ).run(input.role);
    const grant = db.prepare('INSERT INTO permissions VALUES (?, ?)');
    if (input.edit) grant.run(input.role, 'workspace.edit');
    if (input.send) grant.run(input.role, 'campaign.send');
    recordActivity(
      db,
      actor.id,
      'role.permissions_updated',
      'role',
      input.role,
      'Role permissions updated.',
    );
  }).immediate();
  return { ok: true };
}

export function newPasswordError(password) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) {
    return 'Use 12–72 UTF-8 bytes, including uppercase and lowercase letters, a number, and a symbol.';
  }
  return '';
}

function setPassword(db, id, passwordHash) {
  db.prepare(
    'UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
  ).run(passwordHash, new Date().toISOString(), id);
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM password_recovery WHERE user_id = ?').run(id);
}

export async function saveUser(db, actor, input) {
  const id = typeof input?.id === 'string' ? input.id : null;
  const existing = id && db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (
    id &&
    (!existing ||
      existing.role === 'super_admin' ||
      id === actor.id ||
      (actor.role !== 'super_admin' && existing.role === 'administrator'))
  ) {
    return problem('You cannot manage this account.');
  }
  const fullName =
    typeof input?.fullName === 'string' ? input.fullName.trim() : '';
  const username =
    typeof input?.username === 'string'
      ? input.username.trim().toLowerCase()
      : '';
  const email =
    typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = input?.role;
  if (
    fullName.length < 2 ||
    fullName.length > 100 ||
    !/^[a-z0-9._-]{3,30}$/.test(username) ||
    email.length > 254 ||
    !/^[^\s@<>,";]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
  )
    return problem('Enter a full name, username, and valid email.');
  if (
    !roles.includes(role) ||
    (role === 'administrator' && actor.role !== 'super_admin')
  )
    return problem('Choose a role you can assign.');
  const changePassword = !id || Boolean(input.password);
  const passwordError = changePassword && newPasswordError(input.password);
  if (passwordError) return problem(passwordError);
  const passwordHash = changePassword
    ? await bcrypt.hash(input.password, 12)
    : null;
  const now = new Date().toISOString();
  try {
    return db
      .transaction(() => {
        if (id) {
          const updated = db
            .prepare(
              'UPDATE users SET full_name=?, username=?, email=?, role=?, is_active=?, updated_at=? WHERE id=? AND role=?',
            )
            .run(
              fullName,
              username,
              email,
              role,
              input.active !== false ? 1 : 0,
              now,
              id,
              existing.role,
            );
          if (!updated.changes)
            return problem('The account changed. Refresh and try again.');
          if (passwordHash) setPassword(db, id, passwordHash);
          if (input.active === false)
            db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
        } else {
          db.prepare(
            'INSERT INTO users (id, full_name, username, email, role, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
          ).run(
            randomUUID(),
            fullName,
            username,
            email,
            role,
            passwordHash,
            now,
            now,
          );
        }
        recordActivity(
          db,
          actor.id,
          id ? 'user.updated' : 'user.created',
          'user',
          id,
          username,
        );
        return { ok: true };
      })
      .immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return problem('That username or email is already registered.');
    throw error;
  }
}

export function deleteUser(db, actor, id) {
  if (actor.id === id) return problem('You cannot delete your own account.');
  return db
    .transaction(() => {
      const result = db
        .prepare(
          "DELETE FROM users WHERE id = ? AND role != 'super_admin' AND (role != 'administrator' OR ? = 'super_admin')",
        )
        .run(id, actor.role);
      if (!result.changes) return problem('You cannot delete this account.');
      recordActivity(db, actor.id, 'user.deleted', 'user', id, 'User removed.');
      return { ok: true };
    })
    .immediate();
}

export function createRecoveryCode(db, user) {
  const code = randomBytes(24).toString('base64url');
  db.prepare(
    'INSERT INTO password_recovery VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash',
  ).run(user.id, hash(code));
  return { ok: true, code };
}

export async function resetWithCode(db, input) {
  const error = newPasswordError(input?.password);
  if (error) return problem(error);
  if (typeof input.code !== 'string' || !/^[a-zA-Z0-9_-]{32}$/.test(input.code))
    return problem('Enter a valid recovery code.');
  const code = hash(input.code);
  const user = db
    .prepare(
      'SELECT u.id FROM password_recovery r JOIN users u ON u.id = r.user_id WHERE r.code_hash = ? AND u.is_active = 1',
    )
    .get(code);
  if (!user) return problem('Recovery code is invalid or was already used.');
  const passwordHash = await bcrypt.hash(input.password, 12);
  return db
    .transaction(() => {
      if (
        !db
          .prepare(
            'DELETE FROM password_recovery WHERE user_id = ? AND code_hash = ?',
          )
          .run(user.id, code).changes
      )
        return problem('Recovery code was already used.');
      setPassword(db, user.id, passwordHash);
      recordActivity(
        db,
        user.id,
        'user.recovered',
        'user',
        user.id,
        'Password reset with recovery code.',
      );
      return { ok: true };
    })
    .immediate();
}

export async function changePassword(db, user, input) {
  const error = newPasswordError(input?.password);
  if (error) return problem(error);
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(user.id);
  if (
    typeof input.current !== 'string' ||
    input.current.length > 128 ||
    !row ||
    !(await bcrypt.compare(input.current, row.password_hash))
  )
    return problem('Current password is incorrect.');
  const passwordHash = await bcrypt.hash(input.password, 12);
  return db
    .transaction(() => {
      if (
        !db
          .prepare(
            'SELECT 1 FROM users WHERE id=? AND password_hash=? AND is_active=1',
          )
          .get(user.id, row.password_hash)
      )
        return problem('The account changed. Sign in again.');
      setPassword(db, user.id, passwordHash);
      recordActivity(
        db,
        user.id,
        'user.password_changed',
        'user',
        user.id,
        'Password changed.',
      );
      return { ok: true };
    })
    .immediate();
}

export function newSession(db, user, remember) {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now);
  const token = randomBytes(32).toString('base64url');
  const expiry = new Date(
    Date.now() + (remember ? 30 * 86400000 : 12 * 3600000),
  ).toISOString();
  db.prepare('INSERT INTO user_sessions VALUES (?, ?, ?)').run(
    hash(token),
    user.id,
    expiry,
  );
  return token;
}

export function sessionUser(db, token) {
  const session =
    typeof token === 'string' &&
    db
      .prepare(
        'SELECT user_id FROM user_sessions WHERE token_hash=? AND expires_at>?',
      )
      .get(hash(token), new Date().toISOString());
  return session ? getUser(db, session.user_id) : null;
}

export function revokeSession(db, token) {
  if (typeof token === 'string')
    db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(
      hash(token),
    );
}
