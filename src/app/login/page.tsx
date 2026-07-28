import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth/session";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const branding = await getSetting<{ systemName?: string; logoStorageKey?: string }>(
    SETTING_KEYS.BRANDING,
  );
  const systemName = branding.systemName || "Axivo";

  /*
   * The screen is split the way the application itself is: an ink rail beside a
   * paper working area. Signing in is therefore a preview of the shell you are
   * about to enter rather than an unrelated splash.
   *
   * It also solves a real problem. A customer's logo is their own artwork and is
   * frequently dark - the Crossroads mark is deep gold - so placing it on the
   * ink ground made an uploaded logo look like it had failed to load. The logo
   * now sits on the paper side, where any mark reads.
   */
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Ink panel: identity and context. Decorative, so it yields on small
          screens to a slim band rather than pushing the form below the fold. */}
      <section
        aria-hidden
        className="relative hidden overflow-hidden bg-rail lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--rail-border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--rail-border)) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(110% 80% at 20% 0%, black 10%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(110% 80% at 20% 0%, black 10%, transparent 72%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="h-5 w-[3px] rounded-full bg-primary" />
          <span className="font-display text-lg font-semibold tracking-tight text-rail-foreground">
            {systemName}
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-rail-foreground">
            The record of who has what, and who approved it.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-rail-muted">
            Access requests, assets, licences and clearances, each with the approval trail that
            authorised it.
          </p>
        </div>

        <p className="relative text-micro uppercase tracking-[0.14em] text-rail-muted/70">
          Internal system
        </p>
      </section>

      {/* Paper panel: the actual task. */}
      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            {branding.logoStorageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/api/branding/logo"
                alt={systemName}
                className="mb-6 max-h-14 w-auto max-w-[220px] object-contain object-left"
              />
            ) : (
              <span className="mb-6 block h-6 w-[3px] rounded-full bg-primary" aria-hidden />
            )}
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use your {systemName} portal account to continue.
            </p>
          </div>

          <LoginForm />

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Access is restricted to authorised IT portal users. Everything you do here is recorded
            in the audit log.
          </p>
        </div>
      </section>
    </main>
  );
}
