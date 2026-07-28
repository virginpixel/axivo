import { PrismaClient } from "@prisma/client";

/**
 * Local-only helper: create an approval-only workflow and a published Asset
 * Checkout form so the checkout flow can be exercised end to end.
 *
 * A checkout needs no IT implementation step - once it is approved the employee
 * simply takes the equipment they already hold - so the workflow is a single
 * approval. Intended for the local test stack.
 */

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirstOrThrow({
    where: { deletedAt: null, isActive: true, name: "Crossroads" },
  });
  const requestType = await prisma.requestType.findFirstOrThrow({
    where: { companyId: company.id, kind: "ASSET_CHECKOUT", deletedAt: null },
  });
  const approvalRole = await prisma.approvalRole.findFirstOrThrow({
    where: { key: "DEPARTMENT_HEAD" },
  });

  let workflow = await prisma.workflow.findFirst({
    where: { companyId: company.id, name: "Checkout Approval", deletedAt: null },
  });
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        companyId: company.id,
        name: "Checkout Approval",
        description: "Single approval; nothing for IT to implement afterwards.",
        isActive: true,
        versions: {
          create: {
            versionNumber: 1,
            isActive: true,
            steps: {
              create: [
                {
                  stepOrder: 1,
                  stepName: "Department Head Approval",
                  stepType: "APPROVAL",
                  approvalRoleId: approvalRole.id,
                  approvalRule: "ANY",
                  allowDelegation: true,
                },
              ],
            },
          },
        },
      },
    });
    console.log(`[checkout-form] Created workflow "${workflow.name}".`);
  }

  const existing = await prisma.form.findFirst({
    where: { companyId: company.id, name: "Take Equipment On Leave", deletedAt: null },
  });
  if (existing) {
    console.log(`[checkout-form] Form already exists at /r/${existing.slug}`);
    return;
  }

  const version = await prisma.formVersion.create({
    data: { versionNumber: 1, publishedAt: new Date(), form: {
      create: {
        companyId: company.id,
        requestTypeId: requestType.id,
        workflowId: workflow.id,
        name: "Take Equipment On Leave",
        description: "Ask permission to take your assigned equipment off site.",
        slug: `take-equipment-on-leave-${Math.random().toString(36).slice(2, 8)}`,
        status: "PUBLISHED",
        confirmationMessage: "Your request has gone to your department head.",
      },
    } },
    include: { form: true },
  });
  await prisma.form.update({
    where: { id: version.formId },
    data: { currentVersionId: version.id },
  });
  console.log(`[checkout-form] Published form at /r/${version.form.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
