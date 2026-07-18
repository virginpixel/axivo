import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { getSmtpConfig, decryptSmtpPassword, type SmtpConfig } from "@/shared/settings/settings";
import { BusinessRuleError } from "@/shared/errors";

/**
 * SMTP delivery (SDS Doc 17 Ch5). Configuration lives in system settings with
 * the password encrypted at rest. All queued emails are sent by the background
 * worker; the web app only sends synchronously for the "Send Test Email"
 * administrative function.
 */

export interface OutgoingEmail {
  to: { email: string; name?: string | null }[];
  subject: string;
  html: string;
  text?: string;
}

function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === "ssl",
    requireTLS: config.encryption === "tls",
    auth:
      config.authMethod === "login" && config.username
        ? { user: config.username, pass: decryptSmtpPassword(config) ?? "" }
        : undefined,
  });
}

export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) {
    throw new BusinessRuleError("SMTP is not configured. Ask a System Administrator to configure email settings.");
  }
  const transport = buildTransport(config);
  const mail: Mail.Options = {
    from: { name: config.senderName, address: config.senderEmail },
    replyTo: config.replyTo || undefined,
    to: message.to.map((recipient) =>
      recipient.name ? { name: recipient.name, address: recipient.email } : recipient.email,
    ),
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  await transport.sendMail(mail);
}

export interface SmtpTestResult {
  connectionOk: boolean;
  authenticationOk: boolean;
  deliveryOk: boolean;
  error?: string;
}

/** Verify SMTP configuration and deliver a test email (Doc 17 Ch5). */
export async function testSmtp(
  config: SmtpConfig,
  testRecipient: string,
): Promise<SmtpTestResult> {
  const result: SmtpTestResult = { connectionOk: false, authenticationOk: false, deliveryOk: false };
  try {
    const transport = buildTransport(config);
    await transport.verify();
    result.connectionOk = true;
    result.authenticationOk = true;
    await transport.sendMail({
      from: { name: config.senderName, address: config.senderEmail },
      to: testRecipient,
      subject: "Axivo SMTP test",
      text: "This is a test email confirming your Axivo SMTP configuration works correctly.",
    });
    result.deliveryOk = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown SMTP error";
  }
  return result;
}
