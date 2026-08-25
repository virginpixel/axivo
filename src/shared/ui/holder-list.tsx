"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import * as PopoverPrimitive from "@radix-ui/react-popover";

export interface Holder {
  id: string;
  name: string;
}

/**
 * Current holders of an asset, kept to one line: the first holder by name, then
 * a "+N" chip for the rest. Shared equipment can have many holders, and listing
 * them all would stretch the row out of shape.
 *
 * The chip reveals the remainder on hover and on click, so it works with a
 * mouse and on touch, where there is no hover.
 */
export function HolderList({ holders }: { holders: Holder[] }) {
  const [open, setOpen] = useState(false);
  // Closing is delayed so the pointer can travel from chip to panel without the
  // panel vanishing on the way.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (holders.length === 0) return <span className="text-muted-foreground">None</span>;

  const [first, ...rest] = holders;

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <span className="flex items-center gap-1.5">
      <Link href={`/people/${first!.id}`} className="hover:underline">
        {first!.name}
      </Link>
      {rest.length > 0 ? (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              onMouseEnter={openNow}
              onMouseLeave={closeSoon}
              onPointerEnter={openNow}
              onPointerLeave={closeSoon}
              aria-label={`Show ${rest.length} more holder${rest.length > 1 ? "s" : ""}`}
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              +{rest.length}
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="start"
              sideOffset={6}
              collisionPadding={8}
              onMouseEnter={openNow}
              onMouseLeave={closeSoon}
              onPointerEnter={openNow}
              onPointerLeave={closeSoon}
              // Hover-opened panels must neither steal focus when opening nor
              // hand it back to the chip on close: returning focus leaves the
              // trigger ringed as though it had been tabbed to.
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="z-[200] min-w-44 rounded-lg border bg-popover p-1 shadow-pop"
            >
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Also assigned to
              </p>
              <ul>
                {rest.map((holder) => (
                  <li key={holder.id}>
                    <Link
                      href={`/people/${holder.id}`}
                      className="block rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      {holder.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      ) : null}
    </span>
  );
}
