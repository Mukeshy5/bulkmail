import { recordActivity } from './operations.js';
import {
  blockLink,
  renderDesign,
  sanitizeEmailMarkup,
} from './email-design.js';
import {
  archiveMedia,
  cropMedia,
  listMedia,
  mediaImage,
  portableHtml,
  uploadMedia,
} from './email-media-service.js';
import { inspectEmail } from './email-validation.js';
import { sendTemplateTest } from './delivery-service.js';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  prepareTemplateInput,
  restoreTemplateVersion,
  setTemplateFavorite,
  templateVersions,
  updateEmailTemplate,
} from './email-template-service.js';

const problem = (error) => ({ ok: false, error });
export function registerTemplateStudio(register, db, decrypt) {
  const read = 'workspace.read';
  const edit = 'workspace.edit';
  register('email-templates:list', read, (_input, user) =>
    listEmailTemplates(db, user.id),
  );
  register('email-templates:get', read, (id) => getEmailTemplate(db, id));
  register('email-templates:favorite', read, (input, user) =>
    setTemplateFavorite(db, user.id, input),
  );
  register('email-templates:create', edit, async (input, user) => {
    const prepared = await prepareTemplateInput(input);
    return prepared.ok
      ? createEmailTemplate(db, user.id, prepared.input)
      : prepared;
  });
  register('email-templates:update', edit, async ({ id, input }, user) => {
    const prepared = await prepareTemplateInput(input);
    return prepared.ok
      ? updateEmailTemplate(db, user.id, id, prepared.input)
      : prepared;
  });
  register('email-templates:duplicate', edit, (id, user) =>
    duplicateEmailTemplate(db, user.id, id),
  );
  register('email-templates:delete', edit, (id, user) =>
    deleteEmailTemplate(db, user.id, id),
  );
  register('email-templates:versions', read, (id) => templateVersions(db, id));
  register('email-templates:restore-version', edit, (input, user) =>
    restoreTemplateVersion(db, user.id, input),
  );
  register('email-templates:render', read, (input) =>
    renderDesign(input?.design, input?.designSettings),
  );
  register('email-templates:link', read, (input) => ({
    ok: true,
    url: blockLink(input || {}),
  }));
  register('email-templates:inspect', read, (input) => inspectEmail(db, input));
  register('email-templates:portable', read, async (input) => {
    if (
      typeof input?.html !== 'string' ||
      Buffer.byteLength(input.html) > 500 * 1024
    )
      return problem('Enter HTML up to 500 KB.');
    try {
      return {
        ok: true,
        html: await portableHtml(
          db,
          sanitizeEmailMarkup(input.html),
          input.preview === true,
        ),
      };
    } catch {
      return problem(
        'An embedded image is missing or the email contains more than 12 MB of images.',
      );
    }
  });
  register('email-templates:export-html', read, async (input) => {
    if (
      typeof input?.html !== 'string' ||
      Buffer.byteLength(input.html) > 500 * 1024
    )
      return problem('Enter HTML up to 500 KB.');
    try {
      const html = await portableHtml(db, sanitizeEmailMarkup(input.html));
      const name =
        typeof input.name === 'string'
          ? input.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 100)
          : '';
      return {
        ok: true,
        file: { name: (name || 'email') + '.html', format: 'html', text: html },
      };
    } catch {
      return problem(
        'An embedded image is missing or the email contains more than 12 MB of images.',
      );
    }
  });
  register('email-templates:test', 'campaign.send', async (input, user) => {
    const cutoff = new Date(Date.now() - 60000).toISOString();
    if (
      db
        .prepare(
          "SELECT 1 FROM activity_log WHERE actor_user_id = ? AND action IN ('template.test','campaign.test') AND created_at >= ?",
        )
        .get(user.id, cutoff)
    ) {
      return problem('Wait one minute before sending another test email.');
    }
    recordActivity(
      db,
      user.id,
      'template.test',
      'email_template',
      null,
      'Template test requested.',
    );
    return sendTemplateTest(db, input, { decrypt });
  });
  register('email-media:list', read, (search) => listMedia(db, search));
  register('email-media:get', read, (id) => mediaImage(db, id));
  register('email-media:upload', edit, (input) => uploadMedia(db, input));
  register('email-media:crop', edit, (input) => cropMedia(db, input));
  register('email-media:delete', edit, (id) => archiveMedia(db, id));
}
