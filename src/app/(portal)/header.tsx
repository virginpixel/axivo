"use client";

import Link from "next/link";
import { Bell, LogOut, UserRound, Wrench } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { logoutAction } from "@/modules/auth/actions";
import { markInAppReadAction } from "@/modules/notifications/actions";
import { useRouter } from "next/navigation";

export interface HeaderNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function Header({
  displayName,
  username,
  roleName,
  unreadCount,
  recentNotifications,
  maintenanceEnabled,
}: {
  displayName: string;
  username: string;
  roleName: string;
  unreadCount: number;
  recentNotifications: HeaderNotification[];
  maintenanceEnabled: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b bg-card/85 px-4 backdrop-blur-md md:px-6">
      {maintenanceEnabled ? (
        <span className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
          <Wrench className="h-3.5 w-3.5" /> Maintenance mode active
        </span>
      ) : null}
      <DropdownMenu.Root
        onOpenChange={(open) => {
          // Opening the bell marks the shown notifications as read.
          if (open && unreadCount > 0) {
            void markInAppReadAction().then(() => router.refresh());
          }
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-semibold tabular-nums leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-96 rounded-lg border bg-popover p-1 shadow-pop"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="label-caps text-muted-foreground">Notifications</span>
              <Link href="/notifications/inbox" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <DropdownMenu.Separator className="h-px bg-border" />
            {recentNotifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                {recentNotifications.map((notification) => (
                  <DropdownMenu.Item key={notification.id} asChild>
                    <Link
                      href={notification.link ?? "/notifications/inbox"}
                      className="flex cursor-pointer flex-col gap-0.5 rounded px-3 py-2 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {!notification.read ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        ) : null}
                        <span className="truncate">{notification.title}</span>
                      </span>
                      {notification.body ? (
                        <span className="truncate text-xs text-muted-foreground">{notification.body}</span>
                      ) : null}
                      <span className="font-register text-[11px] text-muted-foreground">
                        {notification.createdAt.replace("T", " ").slice(0, 16)} UTC
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </div>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-accent"
            aria-label="User menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tracking-wide text-primary-foreground">
              {displayName
                .split(" ")
                .map((part) => part.charAt(0))
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span className="hidden text-left md:block">
              <span className="block text-sm font-medium leading-tight">{displayName}</span>
              <span className="block text-xs leading-tight text-muted-foreground">{roleName}</span>
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-52 rounded-lg border bg-popover p-1 shadow-pop"
          >
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Signed in as <span className="font-register font-medium text-foreground">{username}</span>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <Link
                href="/account"
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                <UserRound className="h-4 w-4 text-muted-foreground" /> My account
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={() => logoutAction()}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
