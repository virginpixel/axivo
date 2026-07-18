import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Plus } from "lucide-react";
import { FormRowActions, RequestTypeDialog, CopyLinkButton } from "./form-actions-ui";

export const metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

/** Forms list (SDS Doc 22): draft/published/archived with public links. */
export default async function FormsPage() {
  const { user } = await requirePermission("forms.view");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("forms.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [forms, requestTypes, companies] = await Promise.all([
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
    db.requestType.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { name: "asc" },
      include: { company: { select: { name: true } } },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const baseUrl = env().APP_URL.replace(/\/+$/, "");

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Public request forms. Each published form is linked to exactly one workflow."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <RequestTypeDialog companies={companies} />
              <Link href="/forms/builder">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New form
                </Button>
              </Link>
            </div>
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

      <section aria-label="Request types" className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Request types</h2>
        {requestTypes.length === 0 ? (
          <EmptyState title="No request types" description="Request types define which kind of items a form collects." />
        ) : (
          <Table>
            <THead>
              <TR><TH>Name</TH><TH>Company</TH><TH>Kind</TH><TH>Status</TH></TR>
            </THead>
            <TBody>
              {requestTypes.map((requestType) => (
                <TR key={requestType.id}>
                  <TD className="font-medium">{requestType.name}</TD>
                  <TD>{requestType.company.name}</TD>
                  <TD>{requestType.kind.replace(/_/g, " ")}</TD>
                  <TD><StatusBadge status={requestType.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
