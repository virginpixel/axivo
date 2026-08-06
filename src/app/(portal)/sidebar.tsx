"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  AppWindow,
  KeyRound,
  Monitor,
  FileSignature,
  FormInput,
  GitBranch,
  Inbox,
  FolderOpen,
  BarChart3,
  Building2,
  Settings,
  Bell,
  ScrollText,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils";

/** Permission-filtered primary navigation (SDS Doc 03 Ch7). */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission: string;
}

/**
 * Section boundaries for the rail. Fifteen undifferentiated links are hard to
 * scan, so the list is banded by what the operator is doing: working the queue,
 * keeping the records, configuring how requests flow, looking things up, and
 * administering the system. The order of the items themselves is unchanged;
 * a section only labels where one band starts.
 */
const NAV_SECTIONS: { startsAt: string; label: string | null }[] = [
  { startsAt: "/dashboard", label: null },
  { startsAt: "/people", label: "Records" },
  { startsAt: "/forms", label: "Process" },
  { startsAt: "/documents", label: "Evidence" },
  { startsAt: "/organization", label: "Administration" },
];

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, permission: "reports.view" },
  { href: "/requests", label: "Requests", icon: <Inbox className="h-4 w-4" />, permission: "requests.view" },
  { href: "/people", label: "People", icon: <Users className="h-4 w-4" />, permission: "people.view" },
  { href: "/applications", label: "Applications", icon: <AppWindow className="h-4 w-4" />, permission: "applications.view" },
  { href: "/licenses", label: "Licenses", icon: <KeyRound className="h-4 w-4" />, permission: "licenses.view" },
  { href: "/assets", label: "Assets", icon: <Monitor className="h-4 w-4" />, permission: "assets.view" },
  { href: "/contracts", label: "Contracts", icon: <FileSignature className="h-4 w-4" />, permission: "contracts.view" },
  { href: "/forms", label: "Forms", icon: <FormInput className="h-4 w-4" />, permission: "forms.view" },
  { href: "/workflows", label: "Workflows", icon: <GitBranch className="h-4 w-4" />, permission: "workflows.view" },
  { href: "/documents", label: "Documents", icon: <FolderOpen className="h-4 w-4" />, permission: "documents.view" },
  { href: "/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, permission: "reports.view" },
  { href: "/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" />, permission: "notifications.view" },
  { href: "/audit", label: "Audit Logs", icon: <ScrollText className="h-4 w-4" />, permission: "audit.view" },
  { href: "/organization", label: "Organization", icon: <Building2 className="h-4 w-4" />, permission: "organization.view" },
  { href: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, permission: "settings.view" },
];

export function Sidebar({
  permissions,
  systemName,
  version,
}: {
  permissions: string[];
  systemName: string;
  version: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const permitted = new Set(permissions);
  // Only modules the user can access are displayed (Doc 03 Ch7).
  const items = NAV_ITEMS.filter((item) => permitted.has(item.permission));

  const sectionFor = new Map(NAV_SECTIONS.map((section) => [section.startsAt, section.label]));

  const nav = (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-3 scrollbar-thin">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const heading = sectionFor.get(item.href);
        return (
          <div key={item.href}>
            {heading ? (
              <p className="px-2.5 pb-1 pt-4 text-micro font-semibold uppercase tracking-[0.11em] text-rail-muted/70">
                {heading}
              </p>
            ) : null}
            <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md py-1.5 pl-3 pr-2.5 text-sm transition-colors",
                // The accent marks your position in the list; everything else
                // is a quiet shift in surface and ink.
                "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-opacity",
                active
                  ? "bg-rail-active font-medium text-rail-foreground before:opacity-100"
                  : "font-normal text-rail-muted before:opacity-0 hover:bg-rail-active/60 hover:text-rail-foreground",
              )}
            >
              <span className={cn("shrink-0 transition-opacity", active ? "opacity-100" : "opacity-70")}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="fixed left-3 top-3 z-40 rounded-md border border-input bg-card p-2 shadow-pop md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-rail/70 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-rail text-rail-foreground">
            <div className="flex items-center justify-between border-b border-rail-border px-4 py-3.5">
              <Wordmark systemName={systemName} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-[15rem] shrink-0 flex-col border-r border-rail-border bg-rail text-rail-foreground md:flex">
        <div className="flex h-14 items-center border-b border-rail-border px-4">
          <Link href="/dashboard" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Wordmark systemName={systemName} />
          </Link>
        </div>
        {nav}
        <div className="border-t border-rail-border px-4 py-2.5">
          <span className="text-micro uppercase tracking-[0.11em] text-rail-muted/70">
            {systemName} {version}
          </span>
        </div>
      </aside>
    </>
  );
}

/**
 * The wordmark. A single accent tick before the name gives the rail a fixed
 * point without turning the product name into a logo lockup it does not have.
 */
function Wordmark({ systemName }: { systemName: string }) {
  return (
    <span className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/axivo-icon.png" alt="" className="h-6 w-auto shrink-0" />
      <span className="font-display text-lg font-semibold tracking-tight text-rail-foreground">
        {systemName}
      </span>
    </span>
  );
}
