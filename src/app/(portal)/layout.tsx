import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth/session";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ToastProvider } from "@/shared/ui/toast";
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

  const [unreadNotifications, recentNotifications] = await Promise.all([
    db.inAppNotification.count({
      where: { systemUserId: user.userId, readAt: null },
    }),
    db.inAppNotification.findMany({
      where: { systemUserId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ]);

  const branding = await getSetting<{ systemName?: string }>(SETTING_KEYS.BRANDING);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar
          permissions={Array.from(user.permissions)}
          systemName={branding.systemName || "Axivo"}
          version={process.env.AXIVO_VERSION || "dev"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            displayName={user.displayName}
            username={user.username}
            roleName={user.systemRoleName}
            unreadCount={unreadNotifications}
            recentNotifications={recentNotifications.map((notification) => ({
              id: notification.id,
              title: notification.title,
              body: notification.body,
              link: notification.link,
              read: notification.readAt !== null,
              createdAt: notification.createdAt.toISOString(),
            }))}
            maintenanceEnabled={maintenance.enabled}
          />
          <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
            <div className="mx-auto w-full max-w-[100rem]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
