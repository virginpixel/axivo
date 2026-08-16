-- Data migration: refresh the default action-email templates so the editable
-- Notifications templates carry the centred pill CTA button (and the approval
-- template shows the requested item details). Emails now render from these
-- templates, so existing installs need the updated defaults; the seed uses an
-- empty upsert-update and never refreshes them. Runs once per database.

UPDATE notification_templates SET body = 'Dear {{approverName}},<br/><br/>Your approval is required for request <strong>{{requestNumber}}</strong>.<br/>Item: <strong>{{itemLabel}}</strong><br/>Requested for: <strong>{{requestedForName}}</strong>{{itemDetails}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">Review request</a></td></tr></table>',
    variables = '["approverName","itemLabel","requestedForName","requestNumber","itemDetails","actionUrl"]'::jsonb
WHERE key = 'approval_required';

UPDATE notification_templates SET body = 'Dear {{requesterName}},<br/><br/>An approver requested a correction for <strong>{{itemLabel}}</strong> on request <strong>{{requestNumber}}</strong>.<br/>Comments: {{comments}}<br/><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">Review &amp; correct item</a></td></tr></table>'
WHERE key = 'correction_requested';

UPDATE notification_templates SET body = 'Dear {{employeeName}},<br/><br/>Your access to <strong>{{applicationName}}</strong> has been set up. For security your credentials are not included in this email.<br/><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">View credentials</a></td></tr></table>'
WHERE key = 'credential_delivery';

UPDATE notification_templates SET body = 'Dear {{employeeName}},<br/><br/>{{assetCount}} company asset(s) have been assigned to you. Please review and acknowledge receipt.<br/><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">Review &amp; acknowledge</a></td></tr></table>'
WHERE key = 'asset_handover';

UPDATE notification_templates SET body = 'Dear {{recipientName}},<br/><br/><strong>{{itemLabel}}</strong> on request <strong>{{requestNumber}}</strong> has completed approval and is ready for IT to implement.<br/>Requested for: {{requestedForName}}<br/><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">Open request</a></td></tr></table>'
WHERE key = 'implementation_required';

UPDATE notification_templates SET body = 'This is a reminder that an action assigned to you on request <strong>{{requestNumber}}</strong> is still pending.<br/><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="{{actionUrl}}" style="display:inline-block;background:#3f53ca;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;line-height:1;padding:14px 30px;border-radius:999px;">Open pending action</a></td></tr></table>'
WHERE key = 'reminder';
