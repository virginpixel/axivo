import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import devices" };
export const dynamic = "force-dynamic";

/** Spreadsheet import with a preview step (SDS Doc 24). */
export default async function ImportPage() {
  const { user } = await requirePermission("infrastructure.manage");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const [companies, types] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.infraDeviceType.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
  ]);
  return (
    <div>
      <PageHeader
        title="Import devices"
        description="Bring in a network or server spreadsheet. You check how every row will land before anything is saved."
      />
      <ImportWizard
        companies={companies}
        types={types}
        canImportLogins={user.permissions.has("infrastructure.credentials.manage")}
      />
    </div>
  );
}
