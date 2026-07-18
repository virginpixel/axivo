import { validateToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { ToastProvider } from "@/shared/ui/toast";
import { ActionShell, InvalidTokenNotice } from "../shell";
import { CredentialsReveal } from "./credentials-reveal";

export const dynamic = "force-dynamic";

/** Secure credential acknowledgement page (SDS Doc 08 Ch6). */
export default async function CredentialsActionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidTokenNotice reason="malformed" flow="credentials" />;

  const validation = await validateToken(token, "CREDENTIAL_ACKNOWLEDGEMENT");
  if (!validation.valid) {
    return <InvalidTokenNotice reason={validation.reason} flow="credentials" />;
  }

  const delivery = await db.credentialDelivery.findUnique({
    where: { id: validation.record.targetId },
    include: { application: true, person: true },
  });
  if (!delivery) return <InvalidTokenNotice reason="not_found" flow="credentials" />;
  if (delivery.status === "REVOKED") {
    return <InvalidTokenNotice reason="revoked" flow="credentials" />;
  }

  return (
    <ToastProvider>
      <ActionShell
        title="Your credentials are ready"
        subtitle={`${delivery.application.name} access for ${delivery.person.firstName} ${delivery.person.lastName}`}
      >
        <CredentialsReveal token={token} applicationName={delivery.application.name} />
      </ActionShell>
    </ToastProvider>
  );
}
