"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically refreshes the current server-rendered page so new events
 * (requests, approvals, notifications) appear without a manual reload.
 * Pauses while the tab is hidden.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
