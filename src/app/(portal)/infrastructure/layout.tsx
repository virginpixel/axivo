import { requirePermission } from "@/shared/auth/guard";
import { InfrastructureNav } from "./infrastructure-nav";

/** Infrastructure register and credential vault (SDS Doc 24). */
export default async function InfrastructureLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePermission("infrastructure.view");
  const tabs = [
    { href: "/infrastructure/network", label: "Network devices" },
    { href: "/infrastructure/servers", label: "Servers & hosts" },
    { href: "/infrastructure/credentials", label: "Credential vault" },
    ...(user.permissions.has("infrastructure.manage") ? [{ href: "/infrastructure/import", label: "Import" }] : []),
  ];
  return (
    <div>
      <InfrastructureNav tabs={tabs} />
      {children}
    </div>
  );
}
