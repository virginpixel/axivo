import Link from "next/link";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";

export const dynamic = "force-dynamic";

/**
 * Most people who land on a bad URL here are requesters following a stale or
 * mistyped link, so the page points them at the request portal rather than
 * leaving them at a dead end.
 */
export default async function NotFound() {
  const branding = await getSetting<{ systemName?: string; logoStorageKey?: string }>(
    SETTING_KEYS.BRANDING,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center">
        {branding.logoStorageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/branding/logo" alt="" className="mx-auto mb-4 max-h-16 w-auto" />
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {branding.systemName ?? "Axivo"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">This page does not exist</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The link may be out of date, or the request form it pointed to is no longer published.
          You can still submit a request from the list of available forms.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Submit a request
          </Link>
          <Link href="/login" className="text-xs text-muted-foreground hover:underline">
            Staff sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
