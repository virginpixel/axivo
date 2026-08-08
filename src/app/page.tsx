import Link from "next/link";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ChevronRight, ArrowLeft, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a request" };

/**
 * Public request portal, served at the site root (SDS Doc 22). Requesters are
 * the largest audience by far, so "/" is theirs; staff reach the portal through
 * /login directly. When more than one company publishes forms the landing page
 * is a company chooser (pick a company to see its forms); with a single company
 * the forms are listed straight away. Selection rides in the "c" query param so
 * it can never collide with a form slug at /r/<slug>, where the forms live so
 * already-emailed links keep working.
 */
export default async function PublicFormsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: selected } = await searchParams;
  const [companies, forms, branding] = await Promise.all([
    db.company.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.form.findMany({
      // Include all-company forms (companyId null) alongside company-bound ones.
      where: {
        status: "PUBLISHED",
        isActive: true,
        deletedAt: null,
        OR: [{ companyId: null }, { company: { isActive: true } }],
      },
      orderBy: { name: "asc" },
      include: {
        company: { select: { id: true, name: true } },
        requestType: { select: { name: true, kind: true } },
      },
    }),
    getSetting<{ systemName?: string; logoStorageKey?: string }>(SETTING_KEYS.BRANDING),
  ]);

  // An all-company form belongs under every company, so a requester finds it
  // whichever property they pick. Each group is that company's own forms plus
  // the shared ones, sorted together by name.
  const allCompanyForms = forms.filter((form) => form.company === null);
  const groups: Group[] = [];
  for (const company of companies) {
    const own = forms.filter((form) => form.company?.id === company.id);
    const groupForms = [...own, ...allCompanyForms].sort((a, b) => a.name.localeCompare(b.name));
    if (groupForms.length > 0) groups.push({ id: company.id, name: company.name, forms: groupForms });
  }

  // The chooser only earns its place when more than one company has forms.
  const showChooser = groups.length > 1;

  const activeGroup =
    showChooser && selected ? (groups.find((group) => group.id === selected) ?? null) : null;

  const subtitle =
    forms.length === 0
      ? "No request forms are published yet."
      : showChooser && !activeGroup
        ? "Select your company to see its request forms."
        : "Choose a form below.";

  return (
    <main className="min-h-screen bg-background py-10">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="mb-8 text-center">
          {branding.logoStorageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/branding/logo" alt="" className="mx-auto mb-3 max-h-16 w-auto" />
          ) : null}
          <p className="label-caps text-primary">{branding.systemName ?? "Axivo"}</p>
          <h1 className="mt-1.5 text-3xl font-semibold">Submit a request</h1>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {forms.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            No request forms are published yet. Please contact your IT department.
          </div>
        ) : !showChooser ? (
          <ul className="space-y-2">
            {forms.map((form) => (
              <li key={form.id}>
                <FormLink form={form} />
              </li>
            ))}
          </ul>
        ) : activeGroup ? (
          <div className="space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> All companies
            </Link>
            <h2 className="text-lg font-semibold">{activeGroup.name}</h2>
            <ul className="space-y-2">
              {activeGroup.forms.map((form) => (
                <li key={form.id}>
                  <FormLink form={form} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/?c=${group.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{group.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {group.forms.length} form{group.forms.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

interface Group {
  id: string;
  name: string;
  forms: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    requestType: { kind: string };
  }[];
}

/** One selectable form. */
function FormLink({ form }: { form: Group["forms"][number] }) {
  const kindLabel =
    form.requestType.kind === "ASSET_REQUEST"
      ? "Asset request"
      : form.requestType.kind === "ASSET_CHECKOUT"
        ? "Asset checkout"
        : form.requestType.kind === "ROLE_CHANGE"
          ? "Access change"
          : "Application access";
  return (
    <Link
      href={`/r/${form.slug}`}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60"
    >
      <span>
        <span className="block font-semibold">{form.name}</span>
        <span className="block text-xs text-muted-foreground">
          {kindLabel}
          {form.description ? ` · ${form.description}` : ""}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
