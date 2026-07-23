import { validateToken, peekToken } from "@/shared/tokens/secure-tokens";
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
  // Acknowledging consumes the token and the Server Action then re-renders this
  // page. Keep rendering the same component in that case: swapping the tree
  // would unmount the reveal and throw away the secrets the person just
  // uncovered, before they had a chance to copy them.
  const spent =
    !validation.valid && validation.reason === "consumed"
      ? await peekToken(token, "CREDENTIAL_ACKNOWLEDGEMENT")
      : null;
  if (!validation.valid && !spent) {
    return <InvalidTokenNotice reason={validation.reason} flow="credentials" />;
  }

  const deliveryId = validation.valid ? validation.record.targetId : spent!.targetId;
  const delivery = await db.credentialDelivery.findUnique({
    where: { id: deliveryId },
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
