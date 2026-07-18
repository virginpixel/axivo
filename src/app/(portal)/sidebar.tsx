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
}: {
  permissions: string[];
  systemName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const permitted = new Set(permissions);
  // Only modules the user can access are displayed (Doc 03 Ch7).
  const items = NAV_ITEMS.filter((item) => permitted.has(item.permission));

  const nav = (
    <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-thin">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-secondary-foreground/70 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="fixed left-3 top-3 z-40 rounded-md border bg-card p-2 shadow md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-secondary">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-lg font-bold text-white">{systemName}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-white/70 hover:text-white"
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
      <aside className="hidden w-60 shrink-0 flex-col bg-secondary md:flex">
        <div className="px-6 py-5">
          <Link href="/dashboard" className="text-xl font-bold text-white">
            {systemName}
          </Link>
        </div>
        {nav}
      </aside>
    </>
  );
}
