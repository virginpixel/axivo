"use client";

import Link from "next/link";
import { Bell, LogOut, UserRound, Wrench } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { logoutAction } from "@/modules/auth/actions";

export function Header({
  displayName,
  username,
  roleName,
  unreadCount,
  maintenanceEnabled,
}: {
  displayName: string;
  username: string;
  roleName: string;
  unreadCount: number;
  maintenanceEnabled: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b bg-card px-4 shadow-sm md:px-6">
      {maintenanceEnabled ? (
        <span className="mr-auto inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          <Wrench className="h-3.5 w-3.5" /> Maintenance mode active
        </span>
      ) : null}
      <Link
        href="/notifications/inbox"
        className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            aria-label="User menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
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
            className="z-50 min-w-48 rounded-md border bg-card p-1 shadow-lg"
          >
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{username}</span>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <Link
                href="/account"
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none hover:bg-accent"
              >
                <UserRound className="h-4 w-4" /> My account
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <button
                type="button"
                onClick={() => logoutAction()}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none hover:bg-accent"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
