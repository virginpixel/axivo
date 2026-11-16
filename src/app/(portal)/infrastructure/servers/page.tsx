import { requirePermission } from "@/shared/auth/guard";
import { DeviceRegister, type RegisterParams } from "../device-register";

export const metadata = { title: "Servers & hosts" };
export const dynamic = "force-dynamic";

export default async function ServersPage({ searchParams }: { searchParams: Promise<RegisterParams> }) {
  const { user } = await requirePermission("infrastructure.view");
  return <DeviceRegister kind="SERVER" user={user} params={await searchParams} />;
}
