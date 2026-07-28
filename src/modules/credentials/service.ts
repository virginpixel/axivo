import { db, type DbClient } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { encryptSecret, decryptSecret } from "@/shared/crypto/encryption";
import { issueToken, tokenActionUrl, revokeTokensForTarget } from "@/shared/tokens/secure-tokens";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { queueNotification } from "@/modules/notifications/service";

/**
 * Credential delivery (SDS Doc 05 Ch4, Doc 07 Ch9, Doc 08 Ch6).
 * Usernames and non-secret custom fields are stored permanently; the temporary
 * password is encrypted, revealed once through a secure acknowledgement link,
 * and automatically removed after the configured expiry. Credentials are never
 * emailed directly.
 */

const MODULE = "credentials";

export interface PrepareDeliveryInput {
  personId: string;
  applicationId: string;
  applicationAssignmentId?: string;
  requestItemId?: string;
  username: string;
  temporarySecret: string;
  customFields: { fieldName: string; fieldValue: string }[];
}

/**
 * Create a credential delivery inside the caller's transaction. The
 * acknowledgement email is sent by sendDeliveryEmail after commit.
 */
export async function prepareDelivery(
  context: AuditContext,
  tx: DbClient,
  input: PrepareDeliveryInput,
): Promise<string> {
  const person = await tx.person.findFirst({
    where: { id: input.personId, deletedAt: null },
  });
  if (!person) throw new NotFoundError("Employee not found.");
  if (!person.isActive) {
    throw new BusinessRuleError("Only active employees may receive credentials.");
  }
  const application = await tx.application.findFirst({
    where: { id: input.applicationId, deletedAt: null },
    include: { credentialFields: { where: { isActive: true, deletedAt: null } } },
  });
  if (!application) throw new NotFoundError("Application not found.");

  // Required custom fields must be completed before delivery (Doc 08 Ch4).
  const provided = new Map(input.customFields.map((f) => [f.fieldName.toLowerCase(), f.fieldValue]));
  const missing = application.credentialFields
    .filter((field) => field.isRequired)
    .filter((field) => {
      const value = provided.get(field.fieldName.toLowerCase());
      return value === undefined || value.trim() === "";
    });
  if (missing.length > 0) {
    throw new BusinessRuleError(
      `Required credential field(s) missing: ${missing.map((f) => f.fieldName).join(", ")}.`,
    );
  }

  const expiryHours = await getSetting<number>(SETTING_KEYS.CREDENTIAL_SECRET_EXPIRY_HOURS);
  const delivery = await tx.credentialDelivery.create({
    data: {
      personId: input.personId,
      applicationId: input.applicationId,
      applicationAssignmentId: input.applicationAssignmentId ?? null,
      requestItemId: input.requestItemId ?? null,
      username: input.username,
      secretCiphertext: encryptSecret(input.temporarySecret),
      secretExpiresAt: new Date(Date.now() + expiryHours * 3_600_000),
      status: "PENDING",
      createdById: context.actorUserId ?? null,
      fields: {
        create: input.customFields.map((field, index) => ({
          fieldName: field.fieldName,
          fieldValue: field.fieldValue,
          displayOrder: index,
        })),
      },
    },
  });
  await recordAudit(
    { ...context, companyId: person.companyId },
    {
      module: MODULE,
      eventType: "delivery.created",
      action: `Prepared credential delivery of "${application.name}" for ${person.firstName} ${person.lastName}`,
      targetType: "credential_delivery",
      targetId: delivery.id,
      targetLabel: application.name,
    },
    tx,
  );
  return delivery.id;
}

/** Send (or send again) the secure acknowledgement email for a delivery. */
export async function sendDeliveryEmail(
  context: AuditContext,
  deliveryId: string,
  overrideEmail?: string,
): Promise<void> {
  const delivery = await db.credentialDelivery.findUnique({
    where: { id: deliveryId },
    include: { person: true, application: true },
  });
  if (!delivery) throw new NotFoundError("Credential delivery not found.");
  if (delivery.status === "REVOKED") {
    throw new BusinessRuleError("This delivery has been revoked.");
  }
  // A one-off address is used when IT resends to somewhere other than the
  // profile email; the profile is left unchanged.
  const recipientEmail = overrideEmail?.trim() || delivery.person.email;
  const { token } = await issueToken({
    purpose: "CREDENTIAL_ACKNOWLEDGEMENT",
    email: recipientEmail,
    personId: delivery.personId,
    targetType: "credential_delivery",
    targetId: deliveryId,
  });
  const url = await tokenActionUrl("/action/credentials", token);
  await queueNotification({
    companyId: delivery.person.companyId,
    eventType: "CREDENTIAL_DELIVERY",
    subject: `Your access to ${delivery.application.name} is ready`,
    body: [
      `Dear ${delivery.person.firstName},`,
      ``,
      `Your access to <strong>${delivery.application.name}</strong> has been set up.`,
      `For security, your credentials are not included in this email.`,
      ``,
      `<a href="${url}">View your credentials securely</a>`,
      ``,
      `The temporary password can be viewed once and expires automatically. If the link expires, contact IT to resend it.`,
    ].join("<br/>"),
    recipients: [
      {
        email: recipientEmail,
        name: `${delivery.person.firstName} ${delivery.person.lastName}`,
        personId: delivery.personId,
      },
    ],
    entityType: "credential_delivery",
    entityId: deliveryId,
  });
  await db.credentialDelivery.update({
    where: { id: deliveryId },
    data: { status: "DELIVERED", sentAt: new Date() },
  });
  await recordAudit(
    { ...context, companyId: delivery.person.companyId },
    {
      module: MODULE,
      eventType: "delivery.sent",
      action: `Sent credential acknowledgement email for "${delivery.application.name}"${overrideEmail ? ` to ${recipientEmail}` : ""}`,
      targetType: "credential_delivery",
      targetId: deliveryId,
    },
  );
}

export interface RevealedCredentials {
  applicationName: string;
  loginUrl: string | null;
  username: string;
  temporarySecret: string | null;
  secretExpiresAt: Date | null;
  fields: { fieldName: string; fieldValue: string }[];
}

/**
 * Acknowledge the delivery and reveal the credentials exactly once
 * (Doc 08 Ch6). Subsequent visits see username and non-secret fields only.
 */
export async function acknowledgeAndReveal(
  context: AuditContext,
  deliveryId: string,
): Promise<RevealedCredentials> {
  const delivery = await db.credentialDelivery.findUnique({
    where: { id: deliveryId },
    include: { person: true, application: true, fields: { orderBy: { displayOrder: "asc" } } },
  });
  if (!delivery) throw new NotFoundError("Credential delivery not found.");
  if (delivery.status === "REVOKED") {
    throw new BusinessRuleError("This credential delivery has been revoked. Contact IT.");
  }

  const now = new Date();
  const secretAvailable =
    delivery.secretCiphertext !== null &&
    delivery.secretExpiresAt !== null &&
    delivery.secretExpiresAt > now &&
    delivery.viewedAt === null;

  let temporarySecret: string | null = null;
  if (secretAvailable) {
    temporarySecret = decryptSecret(delivery.secretCiphertext!);
  }

  await db.$transaction(async (tx) => {
    await tx.credentialDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: delivery.acknowledgedAt ?? now,
        viewedAt: secretAvailable ? now : delivery.viewedAt,
        // Single-use viewing: remove the ciphertext once revealed (Doc 05 Ch4).
        secretCiphertext: secretAvailable ? null : delivery.secretCiphertext,
      },
    });
    await recordAudit(
      { ...context, companyId: delivery.person.companyId },
      {
        module: MODULE,
        eventType: "delivery.acknowledged",
        action: `Credentials for "${delivery.application.name}" acknowledged by ${delivery.person.firstName} ${delivery.person.lastName}${secretAvailable ? " (secret revealed)" : ""}`,
        targetType: "credential_delivery",
        targetId: deliveryId,
      },
      tx,
    );
  });

  return {
    applicationName: delivery.application.name,
    loginUrl: delivery.application.loginUrl,
    username: delivery.username,
    temporarySecret,
    secretExpiresAt: delivery.secretExpiresAt,
    fields: delivery.fields.map((field) => ({ fieldName: field.fieldName, fieldValue: field.fieldValue })),
  };
}

/**
 * Whether the stored temporary secret can still be re-sent as-is. Once the
 * employee has opened the link, or the retention window lapsed, the plaintext is
 * unrecoverable and IT must supply a fresh password. Exported so the UI can show
 * the right resend affordance instead of letting the user hit the error.
 */
export function isStoredSecretResendable(
  delivery: { secretCiphertext: string | null; secretExpiresAt: Date | null; viewedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    delivery.secretCiphertext !== null &&
    delivery.secretExpiresAt !== null &&
    delivery.secretExpiresAt > now &&
    delivery.viewedAt === null
  );
}

/**
 * Resend credentials (Doc 05 Ch4): while the previous secret is valid IT may
 * resend it or replace it; once expired a new password is mandatory.
 */
export async function resendDelivery(
  context: AuditContext,
  deliveryId: string,
  newSecret?: string,
  overrideEmail?: string,
): Promise<void> {
  const delivery = await db.credentialDelivery.findUnique({
    where: { id: deliveryId },
    include: { person: true, application: true },
  });
  if (!delivery) throw new NotFoundError("Credential delivery not found.");
  if (delivery.status === "REVOKED") {
    throw new BusinessRuleError("Revoked deliveries cannot be resent. Create a new delivery.");
  }
  const now = new Date();
  const secretStillValid = isStoredSecretResendable(delivery, now);

  if (!secretStillValid && !newSecret) {
    throw new BusinessRuleError(
      "The previous temporary password has expired or was already viewed. Enter a new temporary password to resend.",
    );
  }

  const expiryHours = await getSetting<number>(SETTING_KEYS.CREDENTIAL_SECRET_EXPIRY_HOURS);
  await db.$transaction(async (tx) => {
    await revokeTokensForTarget("credential_delivery", deliveryId, tx);
    await tx.credentialDelivery.update({
      where: { id: deliveryId },
      data: newSecret
        ? {
            secretCiphertext: encryptSecret(newSecret),
            secretExpiresAt: new Date(now.getTime() + expiryHours * 3_600_000),
            viewedAt: null,
            status: "PENDING",
          }
        : { status: "PENDING" },
    });
    await recordAudit(
      { ...context, companyId: delivery.person.companyId },
      {
        module: MODULE,
        eventType: "delivery.resent",
        action: `Resent credentials for "${delivery.application.name}" to ${delivery.person.firstName} ${delivery.person.lastName}${newSecret ? " with a new temporary password" : ""}`,
        targetType: "credential_delivery",
        targetId: deliveryId,
      },
      tx,
    );
  });
  await sendDeliveryEmail(context, deliveryId, overrideEmail);
}

export async function revokeDelivery(context: AuditContext, deliveryId: string): Promise<void> {
  const delivery = await db.credentialDelivery.findUnique({
    where: { id: deliveryId },
    include: { person: true, application: true },
  });
  if (!delivery) throw new NotFoundError("Credential delivery not found.");
  if (delivery.status === "REVOKED") return;
  await db.$transaction(async (tx) => {
    await revokeTokensForTarget("credential_delivery", deliveryId, tx);
    await tx.credentialDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: context.actorUserId ?? null,
        secretCiphertext: null,
      },
    });
    await recordAudit(
      { ...context, companyId: delivery.person.companyId },
      {
        module: MODULE,
        eventType: "delivery.revoked",
        action: `Revoked credential delivery of "${delivery.application.name}" for ${delivery.person.firstName} ${delivery.person.lastName}`,
        targetType: "credential_delivery",
        targetId: deliveryId,
      },
      tx,
    );
  });
}

/** Worker job: expire secrets past their window (Doc 04 Ch12 purging). */
export async function expireOverdueSecrets(): Promise<number> {
  const now = new Date();
  const overdue = await db.credentialDelivery.findMany({
    where: {
      secretCiphertext: { not: null },
      secretExpiresAt: { lt: now },
    },
    select: { id: true, status: true },
  });
  for (const delivery of overdue) {
    await db.credentialDelivery.update({
      where: { id: delivery.id },
      data: {
        secretCiphertext: null,
        status: delivery.status === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "EXPIRED",
      },
    });
  }
  return overdue.length;
}
