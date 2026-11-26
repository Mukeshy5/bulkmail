import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const marker = Buffer.from('BMS2');
const masterKeyBytes = 32;

function windowsProtection(method, bytes) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    '$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
    '$result = [System.Security.Cryptography.ProtectedData]::' +
      method +
      '($bytes, $null, $scope)',
    '[Console]::Out.Write([Convert]::ToBase64String($result))',
  ].join('; ');
  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const output = execFileSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; " + script,
    ],
    {
      input: bytes.toString('base64'),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  return Buffer.from(output.trim(), 'base64');
}

async function readKey(filename) {
  const encrypted = await readFile(filename);
  return process.platform === 'win32'
    ? windowsProtection('Unprotect', encrypted)
    : encrypted;
}

export async function loadCredentialStore(directory, configuredKey) {
  let key;
  if (configuredKey) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(configuredKey))
      throw new Error(
        'BULK_MAIL_CREDENTIAL_KEY must be a base64-encoded 32-byte key.',
      );
    key = Buffer.from(configuredKey, 'base64');
  } else {
    const filename = path.join(
      directory,
      process.platform === 'win32' ? 'credentials.dpapi' : 'credentials.key',
    );
    try {
      key = await readKey(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      key = randomBytes(masterKeyBytes);
      const protectedKey =
        process.platform === 'win32' ? windowsProtection('Protect', key) : key;
      try {
        await writeFile(filename, protectedKey, { flag: 'wx', mode: 0o600 });
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        key = await readKey(filename);
      }
    }
  }
  if (key.length !== masterKeyBytes)
    throw new Error('The backend credential key is invalid.');
  return {
    encrypt(secret) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([marker, iv, cipher.getAuthTag(), encrypted]);
    },
    decrypt(payload) {
      const bytes = Buffer.from(payload);
      if (bytes.length < 32 || !bytes.subarray(0, 4).equals(marker)) {
        throw Object.assign(
          new Error('SMTP credentials use the old desktop encryption.'),
          { code: 'BULK_MAIL_LEGACY_SECRET' },
        );
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(4, 16),
      );
      decipher.setAuthTag(bytes.subarray(16, 32));
      return Buffer.concat([
        decipher.update(bytes.subarray(32)),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
