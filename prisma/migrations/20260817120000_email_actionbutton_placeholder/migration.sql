-- Data migration: switch the action-email templates from an inline button
-- table to a {{actionButton}} placeholder. The button HTML is now generated in
-- code (emailButton) as a "bulletproof" VML button so it renders as a rounded
-- pill in Outlook on Windows (Word engine) instead of collapsing to plain text.
-- Idempotent: once the table is gone the pattern no longer matches.

UPDATE notification_templates
SET body = regexp_replace(body, '<table role="presentation" width="100%".*?</table>', '{{actionButton}}', 'g'),
    variables = replace(variables::text, '"actionUrl"', '"actionButton"')::jsonb
WHERE key IN (
  'approval_required',
  'correction_requested',
  'credential_delivery',
  'asset_handover',
  'implementation_required',
  'reminder'
);
