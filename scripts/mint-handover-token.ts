import { PrismaClient } from "@prisma/client";
import { issueToken } from "../src/shared/tokens/secure-tokens";

/**
 * Local testing helper: mint a secure handover-acknowledgement token WITHOUT
 * sending an email, so the acknowledgement page can be opened and inspected.
 * Local test stack only.
 *
 * Usage: HANDOVER_ID=... npx tsx scripts/mint-handover-token.ts
 */
const prisma = new PrismaClient();

async function main() {
  const handoverId = process.env.HANDOVER_ID;
  if (!handoverId) throw new Error("HANDOVER_ID is required.");
  const handover = await prisma.handover.findUniqueOrThrow({
    where: { id: handoverId },
    include: { person: true },
  });
  const { token } = await issueToken({
    purpose: "ASSET_HANDOVER",
    email: handover.person.email,
    personId: handover.person.id,
    targetType: "handover",
    targetId: handover.id,
  });
  console.log(`TOKEN=${token}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
