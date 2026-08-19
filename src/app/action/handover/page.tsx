import { validateToken, peekToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { ToastProvider } from "@/shared/ui/toast";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { formatDate } from "@/shared/utils";
import { ActionShell, InvalidTokenNotice } from "../shell";
import { HandoverAcknowledge } from "./handover-acknowledge";

export const dynamic = "force-dynamic";

/** Secure asset handover acknowledgement page (SDS Doc 11 Ch6). */
export default async function HandoverActionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidTokenNotice reason="malformed" flow="handover" />;

  const validation = await validateToken(token, "ASSET_HANDOVER");
  // Acknowledging consumes the token and re-renders this page; the acknowledged
  // state below is the right thing to show, not an expiry error.
  const spent =
    !validation.valid && validation.reason === "consumed"
      ? await peekToken(token, "ASSET_HANDOVER")
      : null;
  if (!validation.valid && !spent) {
    return <InvalidTokenNotice reason={validation.reason} flow="handover" />;
  }

  const handover = await db.handover.findUnique({
    where: { id: validation.valid ? validation.record.targetId : spent!.targetId },
    include: {
      person: true,
      assets: { include: { assetAssignment: { include: { asset: { include: { category: true } } } } } },
    },
  });
  if (!handover) return <InvalidTokenNotice reason="not_found" flow="handover" />;

  const alreadyAcknowledged = handover.status === "ACKNOWLEDGED";

  return (
    <ToastProvider>
      <ActionShell
        title="Asset handover acknowledgement"
        subtitle={`For ${handover.person.firstName} ${handover.person.lastName}`}
      >
        <div className="space-y-4">
          {/* Desktop keeps the full table; phones get one stacked card per asset
              so every detail is readable without horizontal scrolling. */}
          <div className="hidden sm:block">
            <Table>
              <THead>
                <TR>
                  <TH>Asset</TH>
                  <TH>Category</TH>
                  <TH>Serial number</TH>
                  <TH>Manufacturer</TH>
                  <TH>Model</TH>
                  <TH>Assigned</TH>
                </TR>
              </THead>
              <TBody>
                {handover.assets.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="font-medium">{entry.assetAssignment.asset.name || entry.assetAssignment.asset.assetTag || "Asset"}</TD>
                    <TD>{entry.assetAssignment.asset.category.name}</TD>
                    <TD>{entry.assetAssignment.asset.serialNumber ?? "None"}</TD>
                    <TD>{entry.assetAssignment.asset.manufacturer ?? "None"}</TD>
                    <TD>{entry.assetAssignment.asset.model ?? "None"}</TD>
                    <TD>{formatDate(entry.assetAssignment.assignedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="space-y-3 sm:hidden">
            {handover.assets.map((entry) => {
              const asset = entry.assetAssignment.asset;
              const details: { label: string; value: string }[] = [
                { label: "Category", value: asset.category.name },
                { label: "Serial number", value: asset.serialNumber ?? "None" },
                { label: "Manufacturer", value: asset.manufacturer ?? "None" },
                { label: "Model", value: asset.model ?? "None" },
                { label: "Assigned", value: formatDate(entry.assetAssignment.assignedAt) },
              ];
              return (
                <div key={entry.id} className="rounded-lg border bg-card p-4">
                  <p className="font-medium">{asset.name || asset.assetTag || "Asset"}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {details.map((detail) => (
                      <div key={detail.label}>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{detail.label}</dt>
                        <dd className="mt-0.5 break-words">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Terms of responsibility</h3>
            I hereby acknowledge that I have received the above mentioned asset/s. I understand that
            this/these asset/s belong to Dream Islands Development 2 Pvt. Ltd and is/are under my
            possession for carrying out my office work. I hereby assure that I will take care of the
            assets of the company to the best possible extent. Also, I am bound to return the
            specific asset/s when required by the company or at the termination of my employment.
          </div>

          {alreadyAcknowledged ? (
            <p className="rounded-md bg-success/10 px-4 py-3 text-center text-sm text-success">
              This handover was acknowledged on{" "}
              {handover.acknowledgedAt?.toISOString().slice(0, 10)}. No further action is required.
            </p>
          ) : (
            <HandoverAcknowledge token={token} />
          )}
        </div>
      </ActionShell>
    </ToastProvider>
  );
}
