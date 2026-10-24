"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * A small "kebab" (three-dot) actions menu. Consolidates a row's actions into
 * one control so tables stay clean.
 *
 * The panel is portalled to the body: tables scroll horizontally
 * (`overflow-x-auto`), which CSS turns into a vertical clip as well, so a panel
 * rendered inside the row is cut off on the last rows and stretches the table's
 * scroll area. Portalling also lets the menu flip above the trigger when it is
 * near the bottom of the viewport.
 *
 * Non-modal: menu items here open dialogs, and a modal menu would still own
 * focus and pointer events as the dialog appears.
 */
export function ActionMenu({
  label = "Actions",
  align = "right",
  children,
}: {
  label?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align === "right" ? "end" : "start"}
          sideOffset={4}
          collisionPadding={8}
          // Returning focus to the trigger would pull it straight back out of a
          // dialog opened by the item that was just chosen.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-[200] min-w-[11rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A single item inside an {@link ActionMenu}. */
export function ActionMenuItem({
  onClick,
  icon,
  tone = "default",
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={() => onClick()}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm outline-none transition-colors",
        tone === "destructive"
          ? "text-destructive focus:bg-destructive/10 data-[highlighted]:bg-destructive/10"
          : "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
      )}
    >
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      {children}
    </DropdownMenu.Item>
  );
}
