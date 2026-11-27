import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBackendConfig } from '../src/config.js';

test('backend configuration supplies safe local defaults', () => {
  assert.deepEqual(validateBackendConfig(), {
    desktopPort: 3002,
    publicPort: 3001,
    confirmationPort: 587,
  });
});

test('backend configuration rejects duplicate or invalid ports', () => {
  assert.throws(
    () => validateBackendConfig({ PORT: '3002', DESKTOP_API_PORT: '3002' }),
    /different ports/,
  );
  assert.throws(() => validateBackendConfig({ PORT: 'invalid' }), /valid PORT/);
});

test('backend configuration validates optional public integrations', () => {
  assert.throws(
    () => validateBackendConfig({ TURNSTILE_SITE_KEY: 'site-only' }),
    /Configure both TURNSTILE/,
  );
  assert.throws(
    () =>
      validateBackendConfig({
        TURNSTILE_SITE_KEY: 'site',
        TURNSTILE_SECRET: 'secret',
      }),
    /Configure PUBLIC_URL/,
  );
  assert.throws(
    () => validateBackendConfig({ PUBLIC_URL: 'http://example.test' }),
    /HTTPS origin/,
  );
  assert.throws(
    () => validateBackendConfig({ PROVIDER_WEBHOOK_SECRET: 'too-short' }),
    /at least 32 characters/,
  );
});

test('backend configuration requires complete confirmation SMTP settings', () => {
  assert.throws(
    () => validateBackendConfig({ CONFIRM_SMTP_HOST: 'smtp.example.test' }),
    /Configure CONFIRM_SMTP_HOST/,
  );
  assert.throws(
    () =>
      validateBackendConfig({
        CONFIRM_SMTP_HOST: 'smtp.example.test',
        CONFIRM_SMTP_USER: 'mailer',
        CONFIRM_SMTP_PASSWORD: 'secret',
        CONFIRM_SMTP_FROM: 'mailer@example.test',
        CONFIRM_SMTP_PORT: '70000',
      }),
    /valid CONFIRM_SMTP_PORT/,
  );
});
