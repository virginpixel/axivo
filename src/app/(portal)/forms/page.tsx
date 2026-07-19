import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Plus } from "lucide-react";
import { FormRowActions, CopyLinkButton } from "./form-actions-ui";

export const metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

/** Forms list (SDS Doc 22): draft/published/archived with public links. */
export default async function FormsPage() {
  const { user } = await requirePermission("forms.view");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("forms.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [forms] = await Promise.all([
    db.form.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        requestType: { select: { name: true, kind: true } },
        workflow: { select: { name: true } },
        currentVersion: { select: { versionNumber: true, publishedAt: true } },
        _count: { select: { requests: true } },
      },
    }),
  ]);

  const baseUrl = env().APP_URL.replace(/\/+$/, "");

  return (
    <div>
      <PageHeader
        title="Forms"
        description={`Public request forms — each published form is linked to exactly one workflow. Requesters can browse all published forms at ${baseUrl}/r.`}
        actions={
          canManage ? (
            <Link href="/forms/builder">
              <Button size="sm">
                <Plus className="h-4 w-4" /> New form
              </Button>
            </Link>
          ) : undefined
        }
      />

      {forms.length === 0 ? (
        <EmptyState
          title="No forms"
          description="Build a form and publish it to receive requests through its public link."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Form</TH><TH>Company</TH><TH>Request type</TH><TH>Workflow</TH><TH>Version</TH><TH>Requests</TH><TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {forms.map((form) => (
              <TR key={form.id}>
                <TD>
                  <span className="font-medium">{form.name}</span>
                  {form.status === "PUBLISHED" ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate">{`${baseUrl}/r/${form.slug}`}</span>
                      <CopyLinkButton url={`${baseUrl}/r/${form.slug}`} />
                    </p>
                  ) : null}
                </TD>
                <TD>{form.company.name}</TD>
                <TD>{form.requestType.name}</TD>
                <TD>{form.workflow.name}</TD>
                <TD>v{form.currentVersion?.versionNumber ?? "—"}</TD>
                <TD>{form._count.requests}</TD>
                <TD><StatusBadge status={form.status} /></TD>
                <TD className="text-right">
                  {canManage ? <FormRowActions formId={form.id} status={form.status} /> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

    </div>
  );
}
