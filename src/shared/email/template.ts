/**
 * The chrome every Axivo email is wrapped in (SDS Doc 14 Ch5).
 *
 * Deliberately free of database and server imports: the Notifications page
 * renders a preview with this exact function, so what an administrator sees
 * before saving a template is what the recipient receives. Previously the
 * preview showed the bare template body while delivery added a header and
 * footer nobody could see, which is how the two drifted apart.
 */

export interface EmailChrome {
  /** Absolute URL of the brand logo, or null when none is configured. */
  logoUrl: string | null;
  systemName: string;
  primaryColor: string;
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

/**
 * Wrap a rendered template body in the email chrome. The brand logo sits
 * centred above the greeting rather than inside a coloured bar carrying the
 * product name: a recipient should see the organisation writing to them, not
 * the software that sent it. The brand colour survives as a thin top rule.
 */
export function wrapEmail(subject: string, bodyHtml: string, chrome: EmailChrome): string {
  const header = chrome.logoUrl
    ? `<img src="${escapeHtmlAttribute(chrome.logoUrl)}" alt="${escapeHtmlAttribute(chrome.systemName)}" style="max-height:36px;max-width:150px;height:auto;width:auto;display:inline-block;" />`
    : `<span style="font-size:18px;font-weight:bold;color:${escapeHtmlAttribute(chrome.primaryColor)};">${escapeHtmlText(chrome.systemName)}</span>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="border-top:3px solid ${escapeHtmlAttribute(chrome.primaryColor)};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:28px 32px 4px 32px;">${header}</td></tr>
        <tr><td style="padding:16px 32px 32px 32px;color:#1f2937;font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;color:#6b7280;font-size:11px;">
          This is an automated message from ${escapeHtmlText(chrome.systemName)} regarding "${escapeHtmlText(subject)}". Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
