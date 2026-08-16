"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "./dialog";
import { useAction } from "./use-action";
import type { ActionResult } from "@/shared/errors";

/**
 * Standard delete control: a destructive trigger plus a confirm dialog, wired
 * to a soft-delete server action. The action refuses when the record is still
 * in use and surfaces that message through the toast, so the guard lives in one
 * place server-side and every call site behaves the same.
 */
export function DeleteButton({
  action,
  id,
  entityLabel,
  message,
  successMessage,
  redirectTo,
  variant = "icon",
}: {
  /** Soft-delete server action, invoked with the record id. */
  action: (id: string) => Promise<ActionResult<unknown>>;
  id: string;
  entityLabel: string;
  message?: string;
  successMessage?: string;
  /** When set, navigate here after a successful delete (detail pages). */
  redirectTo?: string;
  variant?: "icon" | "button";
}) {
  const { run, loading } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          aria-label={`Delete ${entityLabel}`}
          title="Delete"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${entityLabel}?`}
        message={
          message ??
          `This removes "${entityLabel}". It can only be deleted when nothing still uses it; history is preserved.`
        }
        confirmLabel="Delete"
        loading={loading}
        onConfirm={() =>
          run(() => action(id), {
            successMessage: successMessage ?? `${entityLabel} deleted.`,
            onSuccess: () => {
              setOpen(false);
              if (redirectTo) router.push(redirectTo);
            },
          })
        }
      />
    </>
  );
}
