-- Approval emails now identify both parties beyond a bare name: an approver
-- needs the employee ID to be sure which "Ahmed" this is, plus the company -
-- and for a third party, the firm they actually work for.
-- Idempotent: the guard skips templates already carrying the new placeholders.

UPDATE notification_templates
SET body = replace(
      body,
      'Requested for: <strong>{{requestedForName}}</strong>',
      'Requested by: <strong>{{requesterName}}</strong> ({{requesterDetails}})<br/>Requested for: <strong>{{requestedForName}}</strong> ({{requestedForDetails}})'
    ),
    variables = variables::jsonb
      || '["requestedForDetails","requesterName","requesterDetails"]'::jsonb
WHERE key = 'approval_required'
  AND body NOT LIKE '%{{requestedForDetails}}%';
