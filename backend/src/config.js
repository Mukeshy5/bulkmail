function servicePort(value, fallback, name) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Set a valid ${name} in backend/.env.`);
  }
  return port;
}

export function validateBackendConfig(config = {}) {
  const desktopPort = servicePort(
    config.DESKTOP_API_PORT,
    3002,
    'DESKTOP_API_PORT',
  );
  const publicPort = servicePort(config.PORT, 3001, 'PORT');
  if (desktopPort === publicPort) {
    throw new Error(
      'Use different ports for the desktop API and public service.',
    );
  }

  let publicUrl;
  if (config.PUBLIC_URL) {
    try {
      publicUrl = new URL(config.PUBLIC_URL);
    } catch {
      throw new Error('PUBLIC_URL must be a valid HTTPS origin.');
    }
    if (
      publicUrl.protocol !== 'https:' ||
      publicUrl.origin !== config.PUBLIC_URL
    ) {
      throw new Error(
        'PUBLIC_URL must be an HTTPS origin without a trailing slash.',
      );
    }
  }

  if (config.TRUST_PROXY && !['0', '1'].includes(config.TRUST_PROXY)) {
    throw new Error('TRUST_PROXY must be 0 or 1.');
  }

  const hasTurnstileSiteKey = Boolean(config.TURNSTILE_SITE_KEY);
  const hasTurnstileSecret = Boolean(config.TURNSTILE_SECRET);
  if (hasTurnstileSiteKey !== hasTurnstileSecret) {
    throw new Error(
      'Configure both TURNSTILE_SITE_KEY and TURNSTILE_SECRET, or leave both blank.',
    );
  }
  if ((hasTurnstileSiteKey || hasTurnstileSecret) && !publicUrl) {
    throw new Error('Configure PUBLIC_URL when enabling Turnstile.');
  }

  if (
    config.PROVIDER_WEBHOOK_SECRET &&
    config.PROVIDER_WEBHOOK_SECRET.length < 32
  ) {
    throw new Error('PROVIDER_WEBHOOK_SECRET must be at least 32 characters.');
  }

  const confirmationFields = [
    config.CONFIRM_SMTP_HOST,
    config.CONFIRM_SMTP_USER,
    config.CONFIRM_SMTP_PASSWORD,
    config.CONFIRM_SMTP_FROM,
  ];
  const configuredConfirmationFields =
    confirmationFields.filter(Boolean).length;
  if (
    configuredConfirmationFields > 0 &&
    configuredConfirmationFields !== confirmationFields.length
  ) {
    throw new Error(
      'Configure CONFIRM_SMTP_HOST, USER, PASSWORD, and FROM together, or leave them blank.',
    );
  }

  const confirmationPort = servicePort(
    config.CONFIRM_SMTP_PORT,
    587,
    'CONFIRM_SMTP_PORT',
  );
  return { desktopPort, publicPort, confirmationPort };
}
