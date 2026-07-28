import Link from "next/link";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a request" };

/**
 * Public request portal, served at the site root (SDS Doc 22). Requesters are
 * the largest audience by far, so "/" is theirs; staff reach the portal through
 * /login. Individual forms stay at /r/<slug> so links already emailed out and
 * any form slug that happens to match a portal path keep working.
 */
export default async function PublicFormsIndexPage() {
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

  // Forms that belong to no company serve everybody, so they lead: a new joiner
  // should not have to know which company's section to look under before they
  // can find the all-in-one form.
  const allCompanyForms = forms.filter((form) => form.company === null);
  const byCompany = new Map<string, { name: string; forms: typeof forms }>();
  for (const form of forms) {
    if (!form.company) continue;
    const entry = byCompany.get(form.company.id) ?? { name: form.company.name, forms: [] as typeof forms };
    entry.forms.push(form);
    byCompany.set(form.company.id, entry);
  }

  return (
    <main className="min-h-screen bg-background py-10">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="mb-8 text-center">
          {branding.logoStorageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/branding/logo"
              alt=""
              className="mx-auto mb-3 max-h-16 w-auto"
            />
          ) : null}
          <p className="label-caps text-primary">{branding.systemName ?? "Axivo"}</p>
          <h1 className="mt-1.5 text-3xl font-semibold">Submit a request</h1>
          <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            Choose what you would like to request. No sign-in is required. You will receive updates
            by email.
          </p>
        </div>

        {forms.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            No request forms are published yet. Please contact your IT department.
          </div>
        ) : (
          <div className="space-y-6">
            {allCompanyForms.length > 0 ? (
              <section aria-label="Available to everyone">
                <h2 className="label-caps mb-2 text-muted-foreground">Available to everyone</h2>
                <ul className="space-y-2">
                  {allCompanyForms.map((form) => (
                    <li key={form.id}>
                      <FormLink form={form} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {Array.from(byCompany.values()).map((company) => (
              <section key={company.name} aria-label={company.name}>
                {byCompany.size > 1 || allCompanyForms.length > 0 ? (
                  <h2 className="label-caps mb-2 text-muted-foreground">{company.name}</h2>
                ) : null}
                <ul className="space-y-2">
                  {company.forms.map((form) => (
                    <li key={form.id}>
                      <FormLink form={form} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/login" className="hover:underline">Staff sign in</Link>
        </p>
      </div>
    </main>
  );
}

/** One selectable form. Shared so the all-company and per-company groups match. */
function FormLink({
  form,
}: {
  form: {
    slug: string;
    name: string;
    description: string | null;
    requestType: { kind: string };
  };
}) {
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
