import Link from "next/link";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ChevronRight, ArrowLeft, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a request" };

/**
 * Public request portal, served at the site root (SDS Doc 22). Requesters are
 * the largest audience by far, so "/" is theirs; staff reach the portal through
 * /login. The landing page is a company chooser: pick a company (or the
 * everyone-forms) to see its request forms. Selection is carried in the "c"
 * query param so no route can collide with a form slug at /r/<slug>. Individual
 * forms stay at /r/<slug> so already-emailed links keep working.
 */
export default async function PublicFormsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: selected } = await searchParams;
  const [forms, branding] = await Promise.all([
    db.form.findMany({
      where: { status: "PUBLISHED", isActive: true, deletedAt: null, company: { isActive: true } },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { id: true, name: true } },
        requestType: { select: { name: true, kind: true } },
      },
    }),
    getSetting<{ systemName?: string; logoStorageKey?: string }>(SETTING_KEYS.BRANDING),
  ]);

  // Forms that belong to no company serve everybody; they get their own group.
  const allCompanyForms = forms.filter((form) => form.company === null);
  const byCompany = new Map<string, Group>();
  for (const form of forms) {
    if (!form.company) continue;
    const entry =
      byCompany.get(form.company.id) ??
      ({ id: form.company.id, name: form.company.name, forms: [] } as Group);
    entry.forms.push(form);
    byCompany.set(form.company.id, entry);
  }

  const groups: Group[] = [];
  if (allCompanyForms.length > 0) {
    groups.push({ id: "all", name: "Available to everyone", forms: allCompanyForms });
  }
  groups.push(...byCompany.values());

  // With a single group there is nothing to choose, so skip straight to its
  // forms. Otherwise the landing view is the chooser and "c" selects a group.
  const singleGroup = groups.length === 1;
  const activeGroup = singleGroup
    ? groups[0]
    : selected
      ? (groups.find((group) => group.id === selected) ?? null)
      : null;

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
            {forms.length === 0
              ? "No request forms are published yet."
              : activeGroup
                ? "Choose a form below. No sign-in is required — you will receive updates by email."
                : "Select your company to see its request forms. No sign-in is required."}
          </p>
        </div>

        {forms.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            No request forms are published yet. Please contact your IT department.
          </div>
        ) : activeGroup ? (
          <div className="space-y-4">
            {!singleGroup ? (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> All companies
              </Link>
            ) : null}
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

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/login" className="hover:underline">Staff sign in</Link>
        </p>
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
