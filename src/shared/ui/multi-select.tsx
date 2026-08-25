"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * Searchable multi-select: the counterpart to Combobox for fields that take
 * several values (department heads, and any future list that outgrows a column
 * of checkboxes). Type to filter; clicking a row adds it as a chip and closes
 * the list, and a chosen value is removed through its chip.
 *
 * Mirrors Combobox on phones, where an anchored popover would sit under the
 * on-screen keyboard: there it opens as a full-screen sheet instead.
 */

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Secondary text shown under the label, e.g. the person's company. */
  hint?: string;
}

/** True on phone-width viewports, where the full-screen sheet is used. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function MultiSelect({
  options,
  values,
  onChange,
  id,
  placeholder = "Select...",
  searchPlaceholder = "Type to search...",
  emptyMessage = "No matches.",
  disabled,
  className,
}: {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const isMobile = useIsMobile();

  const selected = useMemo(
    () =>
      values
        .map((value) => options.find((option) => option.value === value))
        .filter((option): option is MultiSelectOption => !!option),
    [values, options],
  );

  // The list only ever adds: a chosen option leaves it and is removed via its
  // chip instead, so a click always means "add this one".
  const selectable = useMemo(
    () => options.filter((option) => !values.includes(option.value)),
    [options, values],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (option) => option.label.toLowerCase().includes(q) || option.hint?.toLowerCase().includes(q),
    );
  }, [selectable, query]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  /** Add a value and close, so each pick lands as a chip without a second click. */
  function add(value: string) {
    if (!values.includes(value)) onChange([...values, value]);
    setOpen(false);
  }

  function remove(value: string) {
    onChange(values.filter((entry) => entry !== value));
  }

  const trigger = (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-haspopup="listbox"
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 rounded-full border border-input bg-card px-4 py-1 text-left text-sm shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span className="truncate text-muted-foreground">{placeholder}</span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  const searchInput = (
    <input
      ref={inputRef}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={searchPlaceholder}
      className={cn("w-full bg-transparent text-sm outline-none", isMobile ? "h-11" : "h-9")}
      aria-controls={listId}
      aria-autocomplete="list"
    />
  );

  const list = (
    <ul
      id={listId}
      role="listbox"
      aria-multiselectable
      className={cn("overflow-y-auto p-1 scrollbar-thin", isMobile ? "min-h-0 flex-1" : "max-h-60")}
    >
      {filtered.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
      ) : (
        filtered.map((option) => (
          <li key={option.value} role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => add(option.value)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-3 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                isMobile ? "py-3" : "py-2",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {option.label}
                  {option.hint ? (
                    <span className="text-muted-foreground"> · {option.hint}</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        ))
      )}
    </ul>
  );

  const focusSearch = (event: Event) => {
    event.preventDefault();
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {isMobile ? (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
          <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/40" />
            <DialogPrimitive.Content
              onOpenAutoFocus={focusSearch}
              aria-label={placeholder}
              className="fixed inset-0 z-[200] flex h-[100dvh] flex-col bg-popover pt-[env(safe-area-inset-top)]"
            >
              <DialogPrimitive.Title className="sr-only">{placeholder}</DialogPrimitive.Title>
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {searchInput}
                <DialogPrimitive.Close className="shrink-0 rounded px-2 py-1 text-sm font-medium text-primary">
                  Done
                </DialogPrimitive.Close>
              </div>
              {list}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : (
        <PopoverPrimitive.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)} modal>
          <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="start"
              sideOffset={4}
              collisionPadding={8}
              onOpenAutoFocus={focusSearch}
              className="z-[200] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border bg-popover shadow-pop"
            >
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {searchInput}
              </div>
              {list}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      )}

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <li key={option.value}>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
                {option.label}
                {option.hint ? <span className="text-muted-foreground"> · {option.hint}</span> : null}
                <button
                  type="button"
                  onClick={() => remove(option.value)}
                  aria-label={`Remove ${option.label}`}
                  className="rounded-full hover:text-destructive"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
