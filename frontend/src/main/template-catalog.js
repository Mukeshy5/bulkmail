const categories = {
  Business: [
    [
      'template-business-intro',
      'Business Introduction',
      'An introduction from our team',
      'Tell subscribers who you are and what your organization does.',
    ],
    [
      'company-announcement',
      'Company Announcement',
      'An update from our company',
      'Share what changed and when subscribers can expect to see it.',
    ],
    [
      'template-follow-up',
      'Client Follow-up',
      'Following up on our conversation',
      'Provide a short recap and outline next steps.',
    ],
    [
      'corporate-newsletter',
      'Corporate Newsletter',
      'News from across the business',
      'Summarize recent milestones and upcoming priorities.',
    ],
  ],
  Marketing: [
    [
      'template-promotion',
      'Promotional Offer',
      'A new offer for subscribers',
      'Describe the offer, who can use it, and when it ends.',
    ],
    [
      'template-product',
      'Product Launch',
      'Introducing our newest product',
      'Introduce the product and explain what subscribers can do with it.',
    ],
    [
      'special-discount',
      'Special Discount',
      'A subscriber discount',
      'Add your discount, eligibility details, and redemption instructions.',
    ],
    [
      'seasonal-campaign',
      'Seasonal Campaign',
      'What’s in season',
      'Highlight relevant products and your seasonal dates.',
    ],
  ],
  Newsletter: [
    [
      'weekly-newsletter',
      'Weekly Newsletter',
      'This week in review',
      'Share the three stories or updates your readers need this week.',
    ],
    [
      'template-newsletter',
      'Monthly Newsletter',
      'News for the month ahead',
      'Recap last month and highlight what readers can look forward to.',
    ],
    [
      'company-updates',
      'Company Updates',
      'What’s new at our company',
      'Share product and team updates with your subscribers.',
    ],
    [
      'blog-newsletter',
      'Blog Newsletter',
      'From the blog',
      'Introduce recent articles and give readers a reason to explore each one.',
    ],
  ],
  Events: [
    [
      'template-event',
      'Event Invitation',
      'You’re invited',
      'Add the venue, date, time, and RSVP details.',
    ],
    [
      'webinar-invitation',
      'Webinar Invitation',
      'Join our upcoming webinar',
      'Explain what attendees will learn and how to register.',
    ],
    [
      'conference-announcement',
      'Conference Announcement',
      'Save the date for our conference',
      'Introduce the agenda and share registration details.',
    ],
  ],
  'Customer Communication': [
    [
      'template-welcome',
      'Welcome Email',
      'Welcome to our community',
      'Introduce your team and explain what subscribers can expect.',
    ],
    [
      'thank-you-email',
      'Thank You Email',
      'Thank you',
      'Recognize a specific action or milestone and share what happens next.',
    ],
    [
      'customer-update',
      'Customer Update',
      'An update for customers',
      'Describe the change and how customers can get help.',
    ],
    [
      'feedback-request',
      'Feedback Request',
      'Tell us what you think',
      'Explain how you’ll use the feedback and how to send it.',
    ],
  ],
};
const colors = ['#1e3a8a', '#253768', '#294792', '#263761', '#155974'];

export function seedTemplateCatalog(db) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO email_templates (id, name, description, subject, html_body, text_body, is_system, created_at, updated_at, category) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET category = excluded.category',
  );
  const owner = db.prepare('SELECT id FROM email_templates WHERE name = ?');
  db.transaction(() => {
    Object.entries(categories).forEach(([category, rows], index) => {
      for (const [id, name, subject, copy] of rows) {
        let safeName = name;
        let suffix = 1;
        while (owner.get(safeName)?.id && owner.get(safeName).id !== id)
          safeName = name + ' (Starter ' + suffix++ + ')';
        const html =
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f8"><tr><td align="center" style="padding:24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;font-family:Arial,sans-serif;color:#182b4b"><tr><td style="background:' +
          colors[index] +
          ';padding:32px;color:#ffffff"><p style="font-size:13px;margin:0 0 12px">' +
          category +
          '</p><h1 style="font-size:28px;margin:0">' +
          subject +
          '</h1></td></tr><tr><td style="padding:32px"><p>Hello {{first_name | default: "there"}},</p><p>' +
          copy +
          '</p></td></tr><tr><td style="padding:18px 32px;background:#f4f7fb;font-size:13px"><a href="{{unsubscribe_url}}">Unsubscribe</a></td></tr></table></td></tr></table>';
        insert.run(
          id,
          safeName,
          copy,
          subject,
          html,
          'Hello {{first_name | default: "there"}},\n\n' +
            copy +
            '\n\nUnsubscribe: {{unsubscribe_url}}',
          now,
          now,
          category,
        );
      }
    });
  }).immediate();
}
