import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth/session";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ToastProvider } from "@/shared/ui/toast";
import { brandingStyle, type BrandingConfig } from "@/shared/branding";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

/**
 * Authenticated portal shell (SDS Doc 03 Ch3/7): persistent left sidebar on
 * desktop, drawer on mobile, top header, scrollable content area. Only IT
 * portal users may enter (Doc 00 §5).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const maintenance = await getSetting<{ enabled: boolean; message: string }>(
    SETTING_KEYS.MAINTENANCE_MODE,
  );
  if (maintenance.enabled && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") {
    redirect("/login");
  }

  const unreadNotifications = await db.inAppNotification.count({
    where: { systemUserId: user.userId, readAt: null },
  });

  const branding = await getSetting<BrandingConfig>(SETTING_KEYS.BRANDING);

  return (
    <ToastProvider>
      <div
        className="flex min-h-screen"
        style={brandingStyle(branding) as React.CSSProperties}
      >
        <Sidebar
          permissions={Array.from(user.permissions)}
          systemName={branding.systemName || "Axivo"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            displayName={user.displayName}
            username={user.username}
            roleName={user.systemRoleName}
            unreadCount={unreadNotifications}
            maintenanceEnabled={maintenance.enabled}
          />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
