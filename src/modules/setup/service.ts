import { db } from "@/shared/db";
import {
  hashPassword,
  validatePasswordAgainstPolicy,
  type PasswordPolicy,
} from "@/shared/crypto/password";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { provisionCompanyDefaults } from "@/modules/organization/provisioning";
import { BusinessRuleError, ValidationError } from "@/shared/errors";
import type { SetupInput } from "./validators";

/**
 * First-run setup (SDS Doc 00 productization): with no system users yet, the
 * app hands the first visitor a one-time page to create the organization and
 * the founding System Administrator, instead of shipping a default account.
 */

/** True until the first administrator exists. */
export async function isFirstRun(): Promise<boolean> {
  return (await db.systemUser.count()) === 0;
}

/**
 * Create the organization, the first System Administrator and their person
 * record. Refuses once any user exists, so it cannot be used to mint extra
 * admins. Returns the new user id so the caller can start a session.
 */
export async function completeSetup(input: SetupInput): Promise<{ systemUserId: string }> {
  if (!(await isFirstRun())) {
    throw new BusinessRuleError("Setup has already been completed.");
  }

  const policy = await getSetting<PasswordPolicy>(SETTING_KEYS.PASSWORD_POLICY);
  const problems = validatePasswordAgainstPolicy(input.password, policy);
  if (problems.length > 0) {
    throw new ValidationError(undefined, { password: problems.join(" ") });
  }

  const adminRole = await db.systemRole.findFirst({ where: { key: "SYSTEM_ADMINISTRATOR" } });
  if (!adminRole) {
    throw new BusinessRuleError(
      "Baseline system data is missing. The database migration/seed must run before setup.",
    );
  }
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    // Re-check inside the transaction so two concurrent submissions cannot both
    // create a founding admin.
    if ((await tx.systemUser.count()) > 0) {
      throw new BusinessRuleError("Setup has already been completed.");
    }

    const company = await tx.company.create({
      data: {
        name: input.organizationName.trim(),
        timezone: input.timezone,
        currency: "USD",
      },
    });
    await provisionCompanyDefaults(tx, company.id);

    // The org-wide display timezone is a global setting (Settings → General),
    // so seed it from the setup choice too; the company row keeps its own copy.
    const generalValue = {
      defaultTimezone: input.timezone,
      defaultCurrency: "USD",
      dateFormat: "yyyy-MM-dd",
      timeFormat: "HH:mm",
    };
    const existingGeneral = await tx.systemSetting.findFirst({
      where: { key: SETTING_KEYS.GENERAL, scope: "GLOBAL" },
    });
    if (existingGeneral) {
      await tx.systemSetting.update({
        where: { id: existingGeneral.id },
        data: { value: generalValue },
      });
    } else {
      await tx.systemSetting.create({
        data: {
          key: SETTING_KEYS.GENERAL,
          category: "system",
          scope: "GLOBAL",
          value: generalValue,
        },
      });
    }

    const person = await tx.person.create({
      data: {
        companyId: company.id,
        employeeId: input.employeeId.trim(),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim(),
      },
    });
    const user = await tx.systemUser.create({
      data: {
        personId: person.id,
        systemRoleId: adminRole.id,
        username: input.username.trim(),
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        module: "system",
        eventType: "system.setup_completed",
        action: `First-run setup: created organization "${company.name}" and administrator "${input.username.trim()}"`,
        actorLabel: input.username.trim(),
        companyId: company.id,
      },
    });

    return { systemUserId: user.id };
  });
}
