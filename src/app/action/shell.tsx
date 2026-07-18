import type { ReactNode } from "react";

/** Shared layout for secure email action pages. */
export function ActionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background py-8">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Axivo</p>
          <h1 className="mt-1 text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

/** Friendly page for expired/invalid links (SDS Doc 05 Ch8). */
export function InvalidTokenNotice({ reason, flow }: { reason: string; flow: string }) {
  const message =
    reason === "expired"
      ? "This secure link has expired."
      : reason === "consumed"
        ? "This secure link has already been used."
        : reason === "revoked"
          ? "This secure link is no longer valid because the related record has moved on."
          : "This secure link is invalid.";
  return (
    <ActionShell title="Link not available">
      <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
        <p className="text-sm">{message}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {flow === "credentials"
            ? "Contact your IT department to resend your credentials."
            : "If you still need to act on this, contact your IT department and ask them to resend the notification."}
        </p>
      </div>
    </ActionShell>
  );
}
