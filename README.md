# Bulk Mail Sender Pro

Bulk Mail Sender Pro is a Windows desktop workspace for permission-based email campaigns. It uses Electron, React JSX, Vite, Tailwind CSS, Node.js, SQLite, and Nodemailer. The optional public service handles subscriber signup, unsubscribe links, engagement tracking, and provider feedback over HTTPS.

## Run the backend and frontend

Use Node.js 24 and npm. Start the backend in one PowerShell terminal:

```powershell
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm start
```

Start the Electron frontend in a second terminal:

```powershell
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm start
```

The desktop app connects to the backend API at `http://127.0.0.1:3002`. The backend owns authentication, SMTP credentials, contacts, campaigns, the delivery queue, reports, and backups. It creates and migrates `backend/data/bulk-mail-sender.sqlite` by default.

- `backend/.env` sets the desktop API port, public service port, database path, and optional integrations. Relative database paths resolve from `backend`.
- `frontend/.env` sets `BULK_MAIL_API_URL`. Match its port to `DESKTOP_API_PORT` in `backend/.env` and restart the frontend after changing it. Vite reads the URL at development startup and when packaging. For an installed app, a launch-time `BULK_MAIL_API_URL` or `--bulk-mail-api-url` overrides the bundled URL.

Keep SMTP credentials and integration secrets in the backend. The desktop API stays bound to loopback and should remain outside the public reverse proxy.

Create the Super Admin account on a new database. The Users page can then create additional accounts and adjust editing and sending permissions. Generate and save a one-time recovery code from Settings. Electron can remember a sign-in by storing an encrypted backend session token in its user profile.

On Windows, the backend protects its SMTP encryption key with the Windows data protection API for the user account running the backend. On other platforms it uses a private key file alongside the database. To provide a key through a managed secret store, set `BULK_MAIL_CREDENTIAL_KEY` to a base64-encoded 32-byte key. Keep the same key when moving the database or restoring SMTP credentials under a different service account.

## Transfer an existing desktop database

Close the old desktop app and stop the new backend. Before the new backend creates its database, run the following from the `backend` directory:

```powershell
npm run migrate:desktop -- "$env:APPDATA\Bulk Mail Sender\bulk-mail-sender.sqlite"
```

The migration snapshots the old SQLite file, upgrades the copy under `backend/data`, and preserves the original. It refuses to overwrite an existing backend database. Sign in with the same username and password afterward. Any SMTP account copied from the old Electron encryption needs its credentials entered and tested again. The migration pauses in-progress campaigns and preserves scheduled times.

## Run a campaign

1. Add an SMTP account, select TLS or STARTTLS, and test the connection. Use your provider’s approved credentials and authenticated sending domain. The Gmail, Outlook.com, and Microsoft 365 presets support OAuth2. Register an OAuth client with your provider and supply a refresh token authorized for SMTP. Custom and hosting servers can use a password or app password. [Outlook.com SMTP settings](https://support.microsoft.com/en-gb/outlook/pop-imap-and-smtp-settings-for-outlook-com?nochrome=true)
2. In Settings, enter your business mailing address and the HTTPS origin of the public service. Use **Test public service** to verify it uses the same workspace database.
3. Add or import contacts and organize them into lists or segments. CSV and XLSX imports create pending contacts, even when source consent fields are mapped. Confirm evidence before marking a contact subscribed.
4. Choose a library template, create a design in Email Builder, or import HTML. Use `{{first_name}}`, `{{last_name}}`, `{{full_name}}`, `{{email}}`, `{{company}}`, `{{country}}`, and `{{unsubscribe_url}}`. A fallback can be specified as `{{first_name | default: "there"}}`.
5. Create a campaign, select lists or a saved segment, and review the eligible count. A test email goes only to the signed-in user's email address. Queue the campaign or choose a time and IANA time zone.

Keep the backend running to submit scheduled campaigns. The desktop window can be closed. Overdue schedules are processed when the backend next starts. Queue counts and recipient states persist. The worker checks subscription and suppression before submission, spaces attempts per account, and uses exponential backoff for temporary SMTP failures. Submissions interrupted before acceptance was recorded are marked **uncertain** and need to be reconciled against the provider log before any deliberate resend.

## Template library and email builder

Templates, drafts, favorites, and version history are stored in SQLite. The builder can import HTML and export a standalone HTML file with uploaded images embedded. Uploaded media is stored in the `media` directory next to the backend database. Keep that directory with the SQLite backup when transferring a workspace. Deleting an image from the library archives the asset so older designs and campaign snapshots can still use it.

Use **Check email** to find missing links, image sources, alt text, or an unsubscribe link. **Check live URLs** makes HEAD requests to up to 12 public HTTP(S) destinations and reports redirects or inconclusive responses separately. Test messages use the selected verified SMTP account and the single recipient entered in the dialog.

## Public HTTPS service

The backend also serves signup forms, unsubscribe links, and provider events at `http://127.0.0.1:3001` by default. These routes use the same backend database as the desktop API. To publish them, copy `backend/.env.example` to `backend/.env` if it does not already exist and set `PUBLIC_URL` to your HTTPS origin with no trailing slash. Set `PORT` to change the public listener port.

Configure your HTTPS reverse proxy to forward to the public listener on port 3001. Keep the desktop API on port 3002 private. Use `TRUST_PROXY=1` only for a single trusted reverse proxy that overwrites forwarding headers. Exclude URL tokens in access logs or redact paths for unsubscribe, redirects, tracking pixels, and confirmations.

- **Unsubscribe.** The email body links to a confirmation page. The mail headers support the one-click HTTPS POST. Sender identification, a business address, and unsubscribe information are added to every campaign. Ensure the provider’s DKIM signature covers both unsubscribe headers for one-click inbox support. [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)
- **Tracking.** Turn on open pixels or click redirects in Settings before queuing a campaign. Messages identify when engagement tracking is active. Mail privacy features and automated link scanners can affect engagement counts.
- **Signup.** Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` for your public hostname. Configure the `CONFIRM_SMTP_*` variables to send double-opt-in confirmations. Then publish a form and copy its iframe embed. GET requests show the confirmation page. Only its explicit POST opts the subscriber in. [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- **Mailgun events.** Set `MAILGUN_WEBHOOK_SIGNING_KEY` and register `/api/webhooks/mailgun` for delivered, failed, and complaint events. The service validates signatures and links feedback to the outbound Message-ID and recipient. [Mailgun webhook security](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks)
- **Other provider events.** A provider adapter can POST to `/api/provider-events` with `Authorization: Bearer <PROVIDER_WEBHOOK_SECRET>`. Use a random secret of at least 32 characters. Send `id` (the provider’s unique event ID), `provider`, `messageId` (the original Message-ID), `event` (`delivered`, `bounce`, or `complaint`), and optionally `recipient`. A bounce must include `category` (`hard`, `soft`, `invalid_email`, `mailbox_full`, `domain_error`, `temporary`, or `delivery_failure`). Only explicitly identified hard bounces, invalid addresses, and complaints trigger suppression.

SMTP acceptance is tracked as **submitted**. Confirmed delivery totals are populated by provider events. No public URL, CAPTCHA keys, SMTP credentials, signing certificate, or provider webhook is supplied by the installer.

## Reports and backups

Reports export to CSV, Excel, or PDF. Analytics and report date filters use UTC. Individual campaign statistics show submission outcomes and recorded engagement or delivery events. The Activity Logs and Notifications pages show workspace events.

Use Settings to take an online SQLite backup or schedule daily backups while the backend runs. The Super Admin can restore a backup from a supported earlier version or the current version. Restore preserves newer suppression records, signs out all sessions, and cancels restored active campaigns to avoid duplicate sends. Backups contain personal data and account hashes, and the SMTP secrets remain encrypted with the backend key. Store backups and the media directory in an access-controlled folder.

## Verify and build

```powershell
cd backend
npm test
cd ../frontend
npm run lint
npm run make
```

On Windows x64, Forge bundles the Electron app and Electron Builder produces the NSIS installer at `frontend/dist/installer/Bulk-Mail-Sender-Pro-Setup-1.0.0-x64.exe`. The build requires access to the Electron and NSIS download sources on first use. The installer contains the Electron frontend. Run the separate backend on the same machine for the installed app to connect. The local build is unsigned. [Electron Builder NSIS documentation](https://www.electron.build/v26/docs/nsis/)

The test suites use temporary or in-memory databases. SMTP, CAPTCHA, and confirmation delivery use injected test transports. No test sends a real campaign or requires real provider credentials.
