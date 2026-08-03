import { redirect } from "next/navigation";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { isFirstRun } from "@/modules/setup/service";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Set up Axivo" };
export const dynamic = "force-dynamic";

/**
 * First-run setup screen. Reachable only while no administrator exists; once
 * setup is done it redirects to sign-in so it can never mint extra admins.
 */
export default async function SetupPage() {
  if (!(await isFirstRun())) redirect("/login");
  const branding = await getSetting<{ systemName?: string; logoStorageKey?: string }>(
    SETTING_KEYS.BRANDING,
  );
  const systemName = branding.systemName || "Axivo";

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Ink panel: identity and reassurance while setting up. */}
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
            Let&apos;s set up your workspace.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-rail-muted">
            Create your organization and the first administrator account. You can add companies,
            departments and people once you&apos;re in.
          </p>
        </div>

        <p className="relative text-micro uppercase tracking-[0.14em] text-rail-muted/70">
          First-run setup
        </p>
      </section>

      {/* Paper panel: the setup form. */}
      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <span className="mb-6 block h-6 w-[3px] rounded-full bg-primary" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to {systemName}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This is a fresh installation. Create the first administrator to begin.
            </p>
          </div>

          <SetupForm />
        </div>
      </section>
    </main>
  );
}
