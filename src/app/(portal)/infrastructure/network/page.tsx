import { requirePermission } from "@/shared/auth/guard";
import { DeviceRegister, type RegisterParams } from "../device-register";

export const metadata = { title: "Network devices" };
export const dynamic = "force-dynamic";

export default async function NetworkDevicesPage({ searchParams }: { searchParams: Promise<RegisterParams> }) {
  const { user } = await requirePermission("infrastructure.view");
  return <DeviceRegister kind="NETWORK" user={user} params={await searchParams} />;
}
