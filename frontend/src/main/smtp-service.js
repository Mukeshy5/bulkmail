import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

const smtpEncryptions = new Set(['ssl', 'starttls', 'none']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function accountFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    encryption: row.encryption,
    username: row.username,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    replyToEmail: row.reply_to_email,
    isEnabled: Boolean(row.is_enabled),
    isDefault: Boolean(row.is_default),
    connectionStatus: row.connection_status,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordActivity(database, actorUserId, action, accountId, description) {
  database
    .prepare(
      `INSERT INTO activity_log (
        id, actor_user_id, action, entity_type, entity_id, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      actorUserId,
      action,
      'smtp_account',
      accountId,
      description,
      new Date().toISOString(),
    );
}

function validateSmtpAccount(input, { passwordRequired }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Enter the SMTP account details.' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const host = typeof input.host === 'string' ? input.host.trim() : '';
  const username =
    typeof input.username === 'string' ? input.username.trim() : '';
  const senderName =
    typeof input.senderName === 'string' ? input.senderName.trim() : '';
  const senderEmail =
    typeof input.senderEmail === 'string'
      ? input.senderEmail.trim().toLowerCase()
      : '';
  const replyToEmail =
    typeof input.replyToEmail === 'string'
      ? input.replyToEmail.trim().toLowerCase()
      : '';
  const encryption = input.encryption;
  const port = input.port;
  const password = input.password;

  if (!name || name.length > 100 || hasControlCharacters(name)) {
    return {
      ok: false,
      error: 'Enter an account name up to 100 characters long.',
    };
  }
  if (!host || host.length > 255 || /[\s/@\\?#]/.test(host)) {
    return { ok: false, error: 'Enter a valid SMTP host name.' };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'Enter an SMTP port from 1 to 65535.' };
  }
  if (!smtpEncryptions.has(encryption)) {
    return { ok: false, error: 'Choose a supported encryption type.' };
  }
  if (!username || username.length > 254 || hasControlCharacters(username)) {
    return { ok: false, error: 'Enter an SMTP username.' };
  }
  if (
    (passwordRequired && (typeof password !== 'string' || !password)) ||
    (password !== undefined &&
      password !== '' &&
      (typeof password !== 'string' || password.length > 1024))
  ) {
    return {
      ok: false,
      error: 'Enter an SMTP password up to 1024 characters long.',
    };
  }
  if (
    !senderName ||
    senderName.length > 150 ||
    hasControlCharacters(senderName)
  ) {
    return {
      ok: false,
      error: 'Enter a sender name up to 150 characters long.',
    };
  }
  if (senderEmail.length > 254 || !emailPattern.test(senderEmail)) {
    return { ok: false, error: 'Enter a valid sender email address.' };
  }
  if (
    replyToEmail &&
    (replyToEmail.length > 254 || !emailPattern.test(replyToEmail))
  ) {
    return { ok: false, error: 'Enter a valid reply-to email address.' };
  }
  if (input.isEnabled !== undefined && typeof input.isEnabled !== 'boolean') {
    return { ok: false, error: 'Choose whether this SMTP account is enabled.' };
  }
  if (input.isDefault !== undefined && typeof input.isDefault !== 'boolean') {
    return { ok: false, error: 'Choose whether this is the default account.' };
  }

  return {
    ok: true,
    account: {
      name,
      host,
      port,
      encryption,
      username,
      password,
      senderName,
      senderEmail,
      replyToEmail,
      isEnabled: input.isEnabled ?? true,
      isDefault: input.isDefault ?? false,
    },
  };
}

function getAccount(database, id) {
  return database.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(id);
}

export function listSmtpAccounts(database) {
  const rows = database
    .prepare(
      `SELECT * FROM smtp_accounts
       ORDER BY is_default DESC, name COLLATE NOCASE`,
    )
    .all();
  return { ok: true, accounts: rows.map(accountFromRow) };
}

export function createSmtpAccount(database, actorUserId, input, encryptSecret) {
  const validated = validateSmtpAccount(input, { passwordRequired: true });
  if (!validated.ok) return validated;
  if (typeof encryptSecret !== 'function') {
    throw new Error('Secure credential encryption is unavailable.');
  }

  const { account } = validated;
  const encryptedPassword = encryptSecret(account.password);
  if (!Buffer.isBuffer(encryptedPassword) || encryptedPassword.length === 0) {
    throw new Error('SMTP credentials could not be encrypted.');
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const create = database.transaction(() => {
    if (account.isDefault && account.isEnabled) {
      database.prepare('UPDATE smtp_accounts SET is_default = 0').run();
    }
    database
      .prepare(
        `INSERT INTO smtp_accounts (
          id, created_by, name, host, port, encryption, username,
          encrypted_password, sender_name, sender_email, reply_to_email,
          is_enabled, is_default, created_at, updated_at
        ) VALUES (
          @id, @actorUserId, @name, @host, @port, @encryption, @username,
          @encryptedPassword, @senderName, @senderEmail, @replyToEmail,
          @isEnabled, @isDefault, @now, @now
        )`,
      )
      .run({
        id,
        actorUserId,
        ...account,
        encryptedPassword,
        isEnabled: Number(account.isEnabled),
        isDefault: Number(account.isDefault && account.isEnabled),
        now,
      });
    recordActivity(
      database,
      actorUserId,
      'smtp.created',
      id,
      `SMTP account "${account.name}" created`,
    );
  });

  try {
    create.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return {
        ok: false,
        error: 'An SMTP account with this name already exists.',
      };
    }
    throw error;
  }
  return { ok: true, account: accountFromRow(getAccount(database, id)) };
}

export function updateSmtpAccount(
  database,
  actorUserId,
  id,
  input,
  encryptSecret,
) {
  const existing = getAccount(database, id);
  if (!existing) return { ok: false, error: 'SMTP account not found.' };

  const validated = validateSmtpAccount(input, { passwordRequired: false });
  if (!validated.ok) return validated;
  const { account } = validated;
  let encryptedPassword = existing.encrypted_password;
  if (account.password) {
    if (typeof encryptSecret !== 'function') {
      throw new Error('Secure credential encryption is unavailable.');
    }
    encryptedPassword = encryptSecret(account.password);
    if (!Buffer.isBuffer(encryptedPassword) || encryptedPassword.length === 0) {
      throw new Error('SMTP credentials could not be encrypted.');
    }
  }

  const isDefault = account.isEnabled && account.isDefault;
  const now = new Date().toISOString();
  const update = database.transaction(() => {
    if (isDefault) {
      database
        .prepare('UPDATE smtp_accounts SET is_default = 0 WHERE id != ?')
        .run(id);
    }
    database
      .prepare(
        `UPDATE smtp_accounts SET
          name = @name,
          host = @host,
          port = @port,
          encryption = @encryption,
          username = @username,
          encrypted_password = @encryptedPassword,
          sender_name = @senderName,
          sender_email = @senderEmail,
          reply_to_email = @replyToEmail,
          is_enabled = @isEnabled,
          is_default = @isDefault,
          connection_status = 'untested',
          last_tested_at = NULL,
          updated_at = @now
        WHERE id = @id`,
      )
      .run({
        id,
        ...account,
        encryptedPassword,
        isEnabled: Number(account.isEnabled),
        isDefault: Number(isDefault),
        now,
      });
    recordActivity(
      database,
      actorUserId,
      'smtp.updated',
      id,
      `SMTP account "${account.name}" updated`,
    );
  });

  try {
    update.immediate();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return {
        ok: false,
        error: 'An SMTP account with this name already exists.',
      };
    }
    throw error;
  }
  return { ok: true, account: accountFromRow(getAccount(database, id)) };
}

export function setDefaultSmtpAccount(database, actorUserId, id) {
  const account = getAccount(database, id);
  if (!account) return { ok: false, error: 'SMTP account not found.' };
  if (!account.is_enabled) {
    return {
      ok: false,
      error: 'Enable this SMTP account before setting it as default.',
    };
  }

  const setDefault = database.transaction(() => {
    database.prepare('UPDATE smtp_accounts SET is_default = 0').run();
    database
      .prepare(
        'UPDATE smtp_accounts SET is_default = 1, updated_at = ? WHERE id = ?',
      )
      .run(new Date().toISOString(), id);
    recordActivity(
      database,
      actorUserId,
      'smtp.default_changed',
      id,
      `Default SMTP account set to "${account.name}"`,
    );
  });
  setDefault.immediate();
  return { ok: true };
}

export function deleteSmtpAccount(database, actorUserId, id) {
  const account = getAccount(database, id);
  if (!account) return { ok: false, error: 'SMTP account not found.' };
  const remove = database.transaction(() => {
    database.prepare('DELETE FROM smtp_accounts WHERE id = ?').run(id);
    recordActivity(
      database,
      actorUserId,
      'smtp.deleted',
      id,
      `SMTP account "${account.name}" deleted`,
    );
  });
  remove.immediate();
  return { ok: true };
}

export async function testSmtpAccount(
  database,
  actorUserId,
  id,
  { decryptSecret, createTransport = nodemailer.createTransport },
) {
  const account = getAccount(database, id);
  if (!account) return { ok: false, error: 'SMTP account not found.' };
  if (typeof decryptSecret !== 'function') {
    throw new Error('Secure credential decryption is unavailable.');
  }

  const testedAt = new Date().toISOString();
  const password = decryptSecret(Buffer.from(account.encrypted_password));
  let transport;
  try {
    transport = createTransport({
      host: account.host,
      port: account.port,
      secure: account.encryption === 'ssl',
      requireTLS: account.encryption === 'starttls',
      auth: { user: account.username, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await transport.verify();
    updateTestStatus(database, actorUserId, account, 'connected', testedAt);
    return { ok: true, testedAt };
  } catch (error) {
    updateTestStatus(database, actorUserId, account, 'failed', testedAt);
    const code =
      error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
        ? ` (${error.code})`
        : '';
    return {
      ok: false,
      error: `SMTP connection failed${code}. Check the server, port, encryption and credentials.`,
    };
  } finally {
    transport?.close();
  }
}

function updateTestStatus(database, actorUserId, account, status, testedAt) {
  const save = database.transaction(() => {
    database
      .prepare(
        `UPDATE smtp_accounts SET
          connection_status = ?, last_tested_at = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(status, testedAt, testedAt, account.id);
    recordActivity(
      database,
      actorUserId,
      `smtp.test_${status}`,
      account.id,
      `SMTP connection test ${status} for "${account.name}"`,
    );
  });
  save.immediate();
}
