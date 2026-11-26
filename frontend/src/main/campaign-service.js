import { randomUUID } from 'node:crypto';

const campaignTypes = new Set([
  'marketing',
  'newsletter',
  'promotion',
  'announcement',
  'customer_update',
  'transactional',
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function hasHeaderControls(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function campaignFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    campaignType: row.campaign_type,
    subject: row.subject,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    replyToEmail: row.reply_to_email,
    recipientListId: row.recipient_list_id,
    recipientListName: row.recipient_list_name,
    templateId: row.template_id,
    templateName: row.template_name,
    smtpAccountId: row.smtp_account_id,
    smtpAccountName: row.smtp_account_name,
    status: row.status,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordActivity(database, actorUserId, action, id, description) {
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
      'campaign',
      id,
      description,
      new Date().toISOString(),
    );
}

function validateDraft(database, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Enter the campaign details.' };
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input.description === 'string' ? input.description.trim() : '';
  const campaignType = input.campaignType || 'marketing';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
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
  const recipientListId =
    typeof input.recipientListId === 'string' && input.recipientListId
      ? input.recipientListId
      : null;
  const templateId =
    typeof input.templateId === 'string' && input.templateId
      ? input.templateId
      : null;
  const smtpAccountId =
    typeof input.smtpAccountId === 'string' && input.smtpAccountId
      ? input.smtpAccountId
      : null;
  if (
    (input.recipientListId != null &&
      typeof input.recipientListId !== 'string') ||
    (input.templateId != null && typeof input.templateId !== 'string') ||
    (input.smtpAccountId != null && typeof input.smtpAccountId !== 'string')
  ) {
    return { ok: false, error: 'Select valid campaign settings.' };
  }

  if (!name || name.length > 150 || hasHeaderControls(name)) {
    return { ok: false, error: 'Enter a campaign name up to 150 characters.' };
  }
  if (description.length > 1000) {
    return {
      ok: false,
      error: 'Campaign descriptions can be up to 1,000 characters.',
    };
  }
  if (!campaignTypes.has(campaignType)) {
    return { ok: false, error: 'Choose a supported campaign type.' };
  }
  if (subject.length > 200 || hasHeaderControls(subject)) {
    return { ok: false, error: 'Email subjects can be up to 200 characters.' };
  }
  if (senderName.length > 150 || hasHeaderControls(senderName)) {
    return { ok: false, error: 'Sender names can be up to 150 characters.' };
  }
  if (
    senderEmail &&
    (senderEmail.length > 254 || !emailPattern.test(senderEmail))
  ) {
    return { ok: false, error: 'Enter a valid sender email address.' };
  }
  if (
    replyToEmail &&
    (replyToEmail.length > 254 || !emailPattern.test(replyToEmail))
  ) {
    return { ok: false, error: 'Enter a valid reply-to email address.' };
  }
  if (
    recipientListId &&
    !database
      .prepare('SELECT id FROM contact_lists WHERE id = ?')
      .get(recipientListId)
  ) {
    return { ok: false, error: 'Select an existing recipient list.' };
  }
  if (
    templateId &&
    !database
      .prepare('SELECT id FROM email_templates WHERE id = ?')
      .get(templateId)
  ) {
    return { ok: false, error: 'Select an existing email template.' };
  }
  if (
    smtpAccountId &&
    !database
      .prepare('SELECT id FROM smtp_accounts WHERE id = ? AND is_enabled = 1')
      .get(smtpAccountId)
  ) {
    return { ok: false, error: 'Select an enabled SMTP account.' };
  }

  return {
    ok: true,
    campaign: {
      name,
      description,
      campaignType,
      subject,
      senderName,
      senderEmail,
      replyToEmail,
      recipientListId,
      templateId,
      smtpAccountId,
    },
  };
}

const campaignSelect = `SELECT
    campaigns.*,
    contact_lists.name AS recipient_list_name,
    email_templates.name AS template_name,
    smtp_accounts.name AS smtp_account_name
  FROM campaigns
  LEFT JOIN contact_lists ON contact_lists.id = campaigns.recipient_list_id
  LEFT JOIN email_templates ON email_templates.id = campaigns.template_id
  LEFT JOIN smtp_accounts ON smtp_accounts.id = campaigns.smtp_account_id`;

export function listCampaigns(database, search = '') {
  const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const rows = database
    .prepare(
      `${campaignSelect}
       WHERE (? = '' OR campaigns.name LIKE ? OR campaigns.description LIKE ?)
       ORDER BY campaigns.updated_at DESC`,
    )
    .all(term, `%${term}%`, `%${term}%`);
  return { ok: true, campaigns: rows.map(campaignFromRow) };
}

export function getCampaign(database, id) {
  const row = database
    .prepare(`${campaignSelect} WHERE campaigns.id = ?`)
    .get(id);
  return row
    ? { ok: true, campaign: campaignFromRow(row) }
    : { ok: false, error: 'Campaign not found.' };
}

export function createCampaignDraft(database, actorUserId, input) {
  const validated = validateDraft(database, input);
  if (!validated.ok) return validated;
  const id = randomUUID();
  const now = new Date().toISOString();
  const campaign = validated.campaign;
  const create = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO campaigns (
          id, created_by, name, description, campaign_type, subject,
          sender_name, sender_email, reply_to_email, recipient_list_id,
          template_id, smtp_account_id, status, created_at, updated_at
        ) VALUES (
          @id, @actorUserId, @name, @description, @campaignType, @subject,
          @senderName, @senderEmail, @replyToEmail, @recipientListId,
          @templateId, @smtpAccountId, 'draft', @now, @now
        )`,
      )
      .run({ id, actorUserId, ...campaign, now });
    recordActivity(
      database,
      actorUserId,
      'campaign.created',
      id,
      `Campaign draft "${campaign.name}" created`,
    );
  });
  create.immediate();
  return getCampaign(database, id);
}

export function updateCampaignDraft(database, actorUserId, id, input) {
  const current = database
    .prepare('SELECT id, name, status FROM campaigns WHERE id = ?')
    .get(id);
  if (!current) return { ok: false, error: 'Campaign not found.' };
  if (current.status !== 'draft') {
    return { ok: false, error: 'Only draft campaigns can be edited.' };
  }
  const validated = validateDraft(database, input);
  if (!validated.ok) return validated;
  const campaign = validated.campaign;
  const update = database.transaction(() => {
    const result = database
      .prepare(
        `UPDATE campaigns SET
          name = @name,
          description = @description,
          campaign_type = @campaignType,
          subject = @subject,
          sender_name = @senderName,
          sender_email = @senderEmail,
          reply_to_email = @replyToEmail,
          recipient_list_id = @recipientListId,
          template_id = @templateId,
          smtp_account_id = @smtpAccountId,
          updated_at = @now
        WHERE id = @id AND status = 'draft'`,
      )
      .run({ id, ...campaign, now: new Date().toISOString() });
    if (!result.changes) return false;
    recordActivity(
      database,
      actorUserId,
      'campaign.updated',
      id,
      `Campaign draft "${campaign.name}" updated`,
    );
    return true;
  });
  if (!update.immediate()) {
    return { ok: false, error: 'Only draft campaigns can be edited.' };
  }
  return getCampaign(database, id);
}

export function duplicateCampaignDraft(database, actorUserId, id) {
  const source = database
    .prepare('SELECT * FROM campaigns WHERE id = ?')
    .get(id);
  if (!source) return { ok: false, error: 'Campaign not found.' };
  return createCampaignDraft(database, actorUserId, {
    name: `${source.name} copy`.slice(0, 150),
    description: source.description,
    campaignType: source.campaign_type,
    subject: source.subject,
    senderName: source.sender_name,
    senderEmail: source.sender_email,
    replyToEmail: source.reply_to_email,
    recipientListId: source.recipient_list_id,
    templateId: source.template_id,
    smtpAccountId: source.smtp_account_id,
  });
}

export function deleteCampaignDraft(database, actorUserId, id) {
  const campaign = database
    .prepare('SELECT id, name, status FROM campaigns WHERE id = ?')
    .get(id);
  if (!campaign) return { ok: false, error: 'Campaign not found.' };
  if (campaign.status !== 'draft') {
    return { ok: false, error: 'Only draft campaigns can be deleted.' };
  }
  const remove = database.transaction(() => {
    const result = database
      .prepare("DELETE FROM campaigns WHERE id = ? AND status = 'draft'")
      .run(id);
    if (!result.changes) return false;
    recordActivity(
      database,
      actorUserId,
      'campaign.deleted',
      id,
      `Campaign draft "${campaign.name}" deleted`,
    );
    return true;
  });
  if (!remove.immediate()) {
    return { ok: false, error: 'Only draft campaigns can be deleted.' };
  }
  return { ok: true };
}
