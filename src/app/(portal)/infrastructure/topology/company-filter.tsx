"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/shared/ui/input";

/** Picking a company shows its map straight away, without reloading the page. */
export function CompanyFilter({ companies, value }: { companies: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      aria-label="Filter by company"
      className="w-48"
      value={value}
      disabled={pending}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        if (event.target.value) params.set("company", event.target.value);
        else params.delete("company");
        params.delete("focus");
        const query = params.toString();
        startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
      }}
    >
      <option value="">All companies</option>
      {companies.map((company) => (
        <option key={company.id} value={company.id}>{company.name}</option>
      ))}
    </Select>
  );
}
