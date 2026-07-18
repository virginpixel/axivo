"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/shared/ui/toast";
import type { ActionResult } from "@/shared/errors";

/**
 * Client helper for invoking server actions with consistent loading, toast
 * and inline-field-error handling (SDS Doc 03 Ch5/8).
 */
export function useAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async <T,>(
      action: () => Promise<ActionResult<T>>,
      options: { successMessage?: string; onSuccess?: (data: T) => void } = {},
    ): Promise<boolean> => {
      setLoading(true);
      setFieldErrors({});
      try {
        const result = await action();
        if (result.ok) {
          if (options.successMessage) toast("success", options.successMessage);
          options.onSuccess?.(result.data);
          router.refresh();
          return true;
        }
        setFieldErrors(result.fieldErrors ?? {});
        toast("error", result.error);
        return false;
      } catch {
        toast("error", "An unexpected error occurred. Please try again.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [router, toast],
  );

  return { run, loading, fieldErrors, setFieldErrors };
}

/** Read all values of a form into a plain object, grouping repeated names into arrays. */
export function formDataToObject(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const result: Record<string, unknown> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value !== "string") continue;
    if (key in result) {
      const existing = result[key];
      result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      result[key] = value;
    }
  }
  return result;
}
