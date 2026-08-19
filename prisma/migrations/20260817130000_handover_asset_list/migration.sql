-- Data migration: add the {{assetList}} placeholder to the asset_handover email
-- template so the acknowledgement email itemises the assigned assets with their
-- category (clearer for the recipient than a bare count). The list HTML is built
-- in code (sendHandover) and injected at send time.
--
-- Inserts {{assetList}} immediately before {{actionButton}}, absorbing an
-- optional <br/> right before the button so the spacing matches the seed. The
-- NOT LIKE guard keeps this idempotent and leaves any operator-edited body that
-- already references the placeholder untouched.

UPDATE notification_templates
SET body = regexp_replace(body, '(<br/>)?\{\{actionButton\}\}', '{{assetList}}{{actionButton}}'),
    variables = variables::jsonb || '["assetList"]'::jsonb
WHERE key = 'asset_handover'
  AND body NOT LIKE '%{{assetList}}%';
