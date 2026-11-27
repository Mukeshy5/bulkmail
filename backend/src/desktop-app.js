import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import {
  getUser,
  needsSetup,
  newSession,
  revokeSession,
  sessionUser,
} from './admin-service.js';
import { loginUser, registerUser } from './auth-service.js';
import {
  bulkAssignTags,
  bulkDeleteContacts,
  createContact,
  createContactList,
  deleteContact,
  deleteContactList,
  exportContactsCsv,
  getContact,
  getContactListMembers,
  getDashboardSummary,
  listContactLists,
  listContacts,
  replaceContactListMembers,
  transferContacts,
  updateContact,
  updateContactList,
  updateContactStatuses,
} from './contacts-service.js';
import {
  importContacts,
  previewContactImport,
} from './contact-import-service.js';
import {
  createSmtpAccount,
  deleteSmtpAccount,
  listSmtpAccounts,
  setDefaultSmtpAccount,
  testSmtpAccount,
  updateSmtpAccount,
} from './smtp-service.js';
import { registerTemplateStudio } from './template-studio-routes.js';
import {
  createCampaignDraft,
  deleteCampaignDraft,
  duplicateCampaignDraft,
  getCampaign,
  listCampaigns,
  updateCampaignDraft,
} from './campaign-service.js';
import { notify } from './operations.js';
import { registerWorkspaceRoutes } from './workspace-routes.js';

const read = 'workspace.read';
const edit = 'workspace.edit';
const admin = 'workspace.admin';
const authOperations = new Set([
  'auth:register',
  'auth:login',
  'workspace:resetPassword',
]);
const importOperations = new Set([
  'contacts:preview-import',
  'contacts:import',
  'email-media:upload',
]);
const maxImportBytes = 10 * 1024 * 1024;
const bearer = /^Bearer ([a-zA-Z0-9_-]{43})$/;
const failed = (error) => ({ ok: false, error });

function uploadedFile(input) {
  const base64 = input?.fileData;
  if (
    typeof base64 !== 'string' ||
    base64.length > Math.ceil(maxImportBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length % 4 !== 0
  ) {
    return null;
  }
  const fileData = Buffer.from(base64, 'base64');
  return fileData.length <= maxImportBytes ? { ...input, fileData } : null;
}

export function createDesktopApp(
  db,
  {
    encrypt,
    decrypt,
    isRestoring = () => false,
    restoreWithWorker = (run) => run(),
  },
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  const operations = new Map();
  const register = (name, permission, run) =>
    operations.set(name, { permission, run });

  register('auth:needs-setup', null, () => ({
    ok: true,
    needsSetup: needsSetup(db),
  }));
  register('auth:register', null, (input) =>
    registerUser(db, input, { setupOnly: true }),
  );
  register('auth:login', null, async (input, _user, token) => {
    const result = await loginUser(db, input);
    if (!result.ok) return result;
    const user = getUser(db, result.user.id);
    if (!user) return failed('The account is no longer active.');
    revokeSession(db, token);
    return {
      ok: true,
      user,
      token: newSession(db, user, input.remember === true),
    };
  });
  register('auth:current-user', null, (_input, user) => ({ ok: true, user }));
  register('auth:logout', null, (_input, _user, token) => {
    revokeSession(db, token);
    return { ok: true };
  });

  register('contacts:dashboard', read, () => getDashboardSummary(db));
  register('contacts:list', read, (input) => listContacts(db, input));
  register('contacts:get', read, (id) => getContact(db, id));
  register('contacts:create', edit, (input, user) =>
    createContact(db, user.id, input),
  );
  register('contacts:update', edit, ({ id, input }, user) =>
    updateContact(db, user.id, id, input),
  );
  register('contacts:delete', edit, (id, user) =>
    deleteContact(db, user.id, id),
  );
  register('contacts:bulk-delete', edit, (ids, user) =>
    bulkDeleteContacts(db, user.id, ids),
  );
  register('contacts:bulk-tag', edit, ({ ids, tags }, user) =>
    bulkAssignTags(db, user.id, ids, tags),
  );
  register('contacts:bulk-status', edit, (input, user) =>
    updateContactStatuses(db, user.id, input),
  );
  register('contacts:export', read, (filters) => {
    const result = exportContactsCsv(db, filters);
    if (!result.ok) return result;
    return {
      ok: true,
      count: result.count,
      file: { name: 'contacts.csv', format: 'csv', text: result.csv },
    };
  });
  register('contacts:preview-import', read, (input) => {
    const file = uploadedFile(input);
    return file
      ? previewContactImport(file)
      : failed('Choose a valid CSV or XLSX file up to 10 MB.');
  });
  register('contacts:import', edit, async (input, user) => {
    const file = uploadedFile(input);
    if (!file) return failed('Choose a valid CSV or XLSX file up to 10 MB.');
    const result = await importContacts(db, user.id, file);
    if (result.ok) notify(db, 'import.completed', 'Contact import completed.');
    return result;
  });

  register('contact-lists:list', read, (search) =>
    listContactLists(db, search),
  );
  register('contact-lists:create', edit, (input, user) =>
    createContactList(db, user.id, input),
  );
  register('contact-lists:update', edit, ({ id, input }, user) =>
    updateContactList(db, user.id, id, input),
  );
  register('contact-lists:delete', edit, (id, user) =>
    deleteContactList(db, user.id, id),
  );
  register('contact-lists:get-members', read, (id) =>
    getContactListMembers(db, id),
  );
  register(
    'contact-lists:replace-members',
    edit,
    ({ listId, contactIds }, user) =>
      replaceContactListMembers(db, user.id, listId, contactIds),
  );
  register('contact-lists:transfer', edit, (input, user) =>
    transferContacts(db, user.id, input),
  );

  register('smtp-accounts:list', read, () => listSmtpAccounts(db));
  register('smtp-accounts:create', admin, (input, user) =>
    createSmtpAccount(db, user.id, input, encrypt),
  );
  register('smtp-accounts:update', admin, ({ id, input }, user) =>
    updateSmtpAccount(db, user.id, id, input, encrypt),
  );
  register('smtp-accounts:delete', admin, (id, user) =>
    deleteSmtpAccount(db, user.id, id),
  );
  register('smtp-accounts:set-default', admin, (id, user) =>
    setDefaultSmtpAccount(db, user.id, id),
  );
  register('smtp-accounts:test', admin, async (id, user) => {
    try {
      const result = await testSmtpAccount(db, user.id, id, {
        decryptSecret: decrypt,
      });
      if (!result.ok) notify(db, 'smtp.error', result.error);
      return result;
    } catch (error) {
      if (error.code !== 'BULK_MAIL_LEGACY_SECRET') throw error;
      return failed(
        'Re-enter and save this SMTP account’s credentials, then test again.',
      );
    }
  });

  registerTemplateStudio(register, db, decrypt);

  register('campaigns:list', read, (search) => listCampaigns(db, search));
  register('campaigns:get', read, (id) => getCampaign(db, id));
  register('campaigns:create', edit, (input, user) =>
    createCampaignDraft(db, user.id, input),
  );
  register('campaigns:update', edit, ({ id, input }, user) =>
    updateCampaignDraft(db, user.id, id, input),
  );
  register('campaigns:duplicate', edit, (id, user) =>
    duplicateCampaignDraft(db, user.id, id),
  );
  register('campaigns:delete', edit, (id, user) =>
    deleteCampaignDraft(db, user.id, id),
  );

  registerWorkspaceRoutes(register, { db, decrypt, restoreWithWorker });

  const json = express.json({ limit: '1mb' });
  const importJson = express.json({ limit: '15mb' });
  const throttleAuth = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    handler: (_request, response) =>
      response
        .status(429)
        .json(failed('Too many authentication attempts. Try again later.')),
  });
  app.get('/health', (_request, response) =>
    response.json({ ok: true, service: 'bulk-mail-desktop', version: 1 }),
  );
  app.post(
    '/api/desktop/:group/:action',
    (request, response, next) => {
      if (
        !['localhost', '127.0.0.1'].includes(request.hostname) ||
        request.get('Origin') !== undefined ||
        request.get('X-Bulk-Mail-Client') !== 'desktop-v1'
      ) {
        return response
          .status(403)
          .json(
            failed(
              'Desktop API requests must come from the local application.',
            ),
          );
      }
      const name = request.params.group + ':' + request.params.action;
      const operation = operations.get(name);
      if (!operation)
        return response
          .status(404)
          .json(failed('Desktop operation not found.'));
      if (isRestoring())
        return response
          .status(503)
          .json(
            failed('The backend is restoring a backup. Try again shortly.'),
          );
      const token = bearer.exec(request.get('Authorization') || '')?.[1];
      const user = sessionUser(db, token);
      if (operation.permission && !user)
        return response
          .status(401)
          .json(failed('Sign in before using the workspace.'));
      if (
        operation.permission &&
        !user.permissions.includes(operation.permission)
      ) {
        return response
          .status(403)
          .json(failed('Your role does not have permission for this action.'));
      }
      response.locals.operation = operation;
      response.locals.token = token;
      response.locals.user = user;
      if (authOperations.has(name))
        return throttleAuth(request, response, next);
      return next();
    },
    (request, response, next) => {
      const name = request.params.group + ':' + request.params.action;
      return (importOperations.has(name) ? importJson : json)(
        request,
        response,
        next,
      );
    },
    async (request, response) => {
      const { operation, user, token } = response.locals;
      if (isRestoring())
        return response
          .status(503)
          .json(
            failed('The backend is restoring a backup. Try again shortly.'),
          );
      return response.json(
        await operation.run(request.body?.input, user, token),
      );
    },
  );
  app.use((_request, response) =>
    response.status(404).json(failed('Desktop operation not found.')),
  );
  app.use((error, _request, response, _next) => {
    if (error.status === 413)
      return response.status(413).json(failed('The request is too large.'));
    if (
      error.status === 400 ||
      error instanceof TypeError ||
      error instanceof RangeError
    ) {
      return response
        .status(400)
        .json(failed('Check the request fields and try again.'));
    }
    console.error('Desktop API request failed:', error.code || error.name);
    return response
      .status(500)
      .json(failed('The backend could not complete this operation.'));
  });
  return app;
}
