import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { LiveSearch } from "@/shared/ui/live-search";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Badge, StatusBadge } from "@/shared/ui/badge";
import { Input, Select } from "@/shared/ui/input";
import { formatDateTime } from "@/shared/utils";
import { UploadDocumentDialog, NewVersionDialog } from "./document-dialogs";
import { Download, Eye } from "lucide-react";
import { documentKindLabel } from "@/modules/documents/categories";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/** Central document repository (SDS Doc 12). */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; kind?: string; page?: string }>;
}) {
  const { user } = await requirePermission("documents.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("documents.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const where: Prisma.DocumentWhereInput = {
    ...companyScope,
    ...(params.category ? { categoryId: params.category } : {}),
    ...(params.kind ? { kind: params.kind as never } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const [documents, total, categories, companies, linkableAssets] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { name: true } },
        category: { select: { name: true } },
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        links: { where: { removedAt: null } },
      },
    }),
    db.document.count({ where }),
    db.documentCategory.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { name: "asc" },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Offered on upload so one form can be linked to every asset it covers.
    db.asset.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, assetTag: true, company: { select: { name: true } } },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Generated and uploaded documents with immutable version history and record links."
        actions={
          canManage ? (
            <UploadDocumentDialog
              companies={companies}
              categories={categories.map((category) => ({ id: category.id, name: category.name, companyId: category.companyId }))}
              assets={linkableAssets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                assetTag: asset.assetTag,
                companyName: asset.company.name,
              }))}
            />
          ) : undefined
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search documents" className="w-full sm:w-64" />
        <input type="hidden" name="q" value={q} />
        <Select name="category" defaultValue={params.category ?? ""} className="w-full sm:w-48" aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </Select>
        <Select name="kind" defaultValue={params.kind ?? ""} className="w-full sm:w-44" aria-label="Filter by type">
          <option value="">All types</option>
          <option value="GENERATED_PDF">Generated PDF</option>
          <option value="UPLOADED_FILE">Uploaded file</option>
          <option value="IMAGE">Image</option>
          <option value="SPREADSHEET">Spreadsheet</option>
          <option value="WORD_DOCUMENT">Word document</option>
          <option value="OTHER">Other</option>
        </Select>
        <button type="submit" className="h-9 rounded-md border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">Filter</button>
      </form>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents"
          description="Handover forms, clearance forms and uploads are stored here with full version history."
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Document</TH><TH>Category</TH><TH>Company</TH><TH>Type</TH><TH>Version</TH><TH>Links</TH><TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {documents.map((document) => {
                const latest = document.versions[0];
                return (
                  <TR key={document.id}>
                    <TD>
                      <span className="font-medium">{document.name}</span>
                      {latest ? (
                        <p className="text-xs text-muted-foreground">
                          {latest.fileName} · {(latest.fileSize / 1024).toFixed(0)} KB
                        </p>
                      ) : null}
                    </TD>
                    <TD>{document.category?.name ?? "None"}</TD>
                    <TD>{document.company.name}</TD>
                    <TD>
                      <Badge variant={document.isGenerated ? "primary" : "default"}>
                        {documentKindLabel(document.kind)}
                      </Badge>
                    </TD>
                    <TD>v{document.currentVersion}</TD>
                    <TD>{document.links.length}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(document.createdAt)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Viewable types open in the browser; the route sets
                            Content-Disposition inline for ?inline=1. */}
                        <a
                          href={`/api/documents/${document.id}/download?inline=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                          aria-label={`View ${document.name}`}
                          title="View in browser"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          href={`/api/documents/${document.id}/download`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                          aria-label={`Download ${document.name}`}
                          title="Download current version"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        {canManage && !document.isGenerated ? (
                          <NewVersionDialog documentId={document.id} documentName={document.name} />
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            buildHref={(p) => {
              const search = new URLSearchParams();
              if (q) search.set("q", q);
              if (params.category) search.set("category", params.category);
              if (params.kind) search.set("kind", params.kind);
              search.set("page", String(p));
              return `/documents?${search.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
