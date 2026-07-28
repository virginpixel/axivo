"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * Searchable single-select dropdown (SDS Doc 03: consistent, accessible form
 * controls). A drop-in replacement for a native <select> when the option list
 * benefits from type-to-filter. Keyboard: type to filter, up/down to move,
 * Enter to select, Esc to close.
 *
 * The list renders as a Radix popover so it is never clipped by a scrolling
 * dialog and flips above the trigger when space below is tight. Using the Radix
 * primitive matters inside a modal: it joins the same focus/dismiss layer stack
 * as the dialog, which is what lets the search box take focus and clicks land.
 *
 * When `onCreate` is supplied, a "create" row appears while typing a value that
 * does not yet exist, letting the user add it inline.
 */

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary text shown under the label. */
  hint?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Text for the clear/none option; omit to hide it. */
  emptyLabel?: string;
  "aria-invalid"?: boolean;
  className?: string;
  /**
   * When provided, an "Add" row is shown for a typed value with no match.
   * Should create the entity and return the option to select (or null to abort).
   */
  onCreate?: (label: string) => Promise<{ value: string; label: string } | null>;
  /** Word used in the create row, e.g. "vendor" -> Add "Acme" as a new vendor. */
  createNoun?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  id,
  placeholder = "Select...",
  disabled,
  emptyLabel,
  className,
  onCreate,
  createNoun,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  // Locally-added options (created inline) so the label shows before a refresh.
  const [extra, setExtra] = useState<ComboboxOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const allOptions = useMemo(() => [...options, ...extra], [options, extra]);
  const selected = allOptions.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const list = emptyLabel ? [{ value: "", label: emptyLabel }, ...allOptions] : allOptions;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((option) => option.label.toLowerCase().includes(q) || option.hint?.toLowerCase().includes(q));
  }, [allOptions, query, emptyLabel]);

  const trimmedQuery = query.trim();
  const canCreate =
    !!onCreate &&
    trimmedQuery.length > 0 &&
    !allOptions.some((option) => option.label.toLowerCase() === trimmedQuery.toLowerCase());

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  function choose(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  async function create() {
    if (!onCreate || !trimmedQuery || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(trimmedQuery);
      if (created) {
        setExtra((current) => [...current, created]);
        onChange(created.value);
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)} modal>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-invalid={aria["aria-invalid"]}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1 text-left text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            aria["aria-invalid"] && "border-destructive",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          // The search box owns focus as soon as the panel opens.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-[200] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border bg-popover shadow-pop"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((current) => Math.min(current + 1, filtered.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const option = filtered[active];
                  if (option) choose(option.value);
                  else if (canCreate) void create();
                }
              }}
              placeholder="Type to search..."
              className="h-9 w-full bg-transparent text-sm outline-none"
              aria-controls={listId}
              aria-autocomplete="list"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto p-1 scrollbar-thin">
            {filtered.length === 0 && !canCreate ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches.</li>
            ) : (
              filtered.map((option, index) => (
                <li key={option.value || "__none__"} role="option" aria-selected={option.value === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm",
                      index === active ? "bg-accent text-accent-foreground" : "",
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate", !option.value && "text-muted-foreground")}>
                        {option.label}
                      </span>
                      {option.hint ? (
                        <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>
                      ) : null}
                    </span>
                    {option.value === value ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              ))
            )}
            {canCreate ? (
              <li>
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    {creating ? "Adding..." : `Add "${trimmedQuery}"${createNoun ? ` as a new ${createNoun}` : ""}`}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
