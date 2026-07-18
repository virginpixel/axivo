import Link from "next/link";
import { requireUser } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { EmptyState } from "@/shared/ui/table";
import { formatDateTime } from "@/shared/utils";
import { MarkAllReadButton } from "./inbox-ui";

export const metadata = { title: "My notifications" };
export const dynamic = "force-dynamic";

/** Personal in-app notification inbox (SDS Doc 14 Ch3). */
export default async function InboxPage() {
  const { user } = await requireUser();
  const notifications = await db.inAppNotification.findMany({
    where: { systemUserId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div>
      <PageHeader
        title="My notifications"
        description={unread > 0 ? `${unread} unread notification(s).` : "You're all caught up."}
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />
      {notifications.length === 0 ? (
        <EmptyState title="No notifications" description="Implementation tasks and system alerts assigned to you appear here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-lg border bg-card p-4 ${notification.readAt ? "opacity-70" : "border-primary/40"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {!notification.readAt ? (
                      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                    ) : null}
                    {notification.title}
                  </p>
                  {notification.body ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(notification.createdAt)}</p>
                </div>
                {notification.link ? (
                  <Link href={notification.link} className="shrink-0 text-sm text-primary hover:underline">
                    Open
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
