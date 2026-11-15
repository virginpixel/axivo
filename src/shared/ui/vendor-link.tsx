import Link from "next/link";

/**
 * A vendor's name, linked to its record.
 *
 * Contracts and licence purchases hold a reference to the vendor rather than a
 * copy of its name, so the name shown here is always the vendor's current one
 * and the link always resolves - including for a vendor that has since been
 * made inactive, which keeps its page and its history.
 */
export function VendorLink({
  vendor,
  fallback = "None",
}: {
  vendor: { id: string; name: string } | null | undefined;
  fallback?: string;
}) {
  if (!vendor) return <>{fallback}</>;
  return (
    <Link href={`/settings/vendors/${vendor.id}`} className="hover:underline">
      {vendor.name}
    </Link>
  );
}
