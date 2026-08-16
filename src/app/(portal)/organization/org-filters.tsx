"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Show-inactive toggle that updates the URL on change, so the filter row needs
 * no Apply button — selecting it navigates immediately, like the live search.
 */
export function ShowInactiveToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const checked = params.get("showInactive") === "1";

  function toggle() {
    const next = new URLSearchParams(params.toString());
    if (checked) next.delete("showInactive");
    else next.set("showInactive", "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={toggle} className="h-4 w-4 rounded" />
      Show inactive
    </label>
  );
}
