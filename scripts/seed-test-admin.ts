import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

/**
 * Creates a throwaway System Administrator for driving the UI during local
 * testing. Intended for the local test stack only; the normal bootstrap in
 * prisma/seed.ts only runs when no system users exist at all.
 *
 * Usage: TEST_ADMIN_USERNAME=... TEST_ADMIN_PASSWORD=... npx tsx scripts/seed-test-admin.ts
 */

const prisma = new PrismaClient();

async function main() {
  const username = process.env.TEST_ADMIN_USERNAME;
  const password = process.env.TEST_ADMIN_PASSWORD;
  const email = process.env.TEST_ADMIN_EMAIL ?? `${username}@local.test`;
  if (!username || !password) {
    throw new Error("TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD are required.");
  }

  const company = await prisma.company.findFirstOrThrow({
    where: { deletedAt: null, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const role = await prisma.systemRole.findUniqueOrThrow({ where: { key: "SYSTEM_ADMINISTRATOR" } });

  const person = await prisma.person.upsert({
    where: { companyId_employeeId: { companyId: company.id, employeeId: "QA-TEST-001" } },
    create: {
      companyId: company.id,
      employeeId: "QA-TEST-001",
      firstName: "QA",
      lastName: "Tester",
      email,
    },
    update: {},
  });

  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const existing = await prisma.systemUser.findFirst({
    where: { OR: [{ username }, { personId: person.id }] },
  });
  if (existing) {
    await prisma.systemUser.update({
      where: { id: existing.id },
      data: { username, passwordHash, passwordChangedAt: new Date(), isEnabled: true, deletedAt: null },
    });
    console.log(`[test-admin] Reset password for existing user "${username}".`);
  } else {
    await prisma.systemUser.create({
      data: {
        personId: person.id,
        systemRoleId: role.id,
        username,
        passwordHash,
        passwordChangedAt: new Date(),
        isEnabled: true,
      },
    });
    console.log(`[test-admin] Created System Administrator "${username}" in company "${company.name}".`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
