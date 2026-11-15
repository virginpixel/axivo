import Link from "next/link";

/**
 * A vendor's name, linked to its record when one exists.
 *
 * Contracts and licence purchases store the vendor as free text rather than a
 * foreign key, because a vendor can be typed before anybody adds it to the
 * catalogue. So the link is resolved by name: matched, it goes to the vendor's
 * page, where the contact details and logo live; unmatched, it stays plain
 * text rather than offering a link that leads nowhere.
 */
export function VendorLink({
  name,
  vendorIds,
  fallback = "None",
}: {
  name: string | null | undefined;
  /** Vendor ids keyed by lower-cased name; see {@link vendorIdsByName}. */
  vendorIds: Record<string, string>;
  fallback?: string;
}) {
  if (!name) return <>{fallback}</>;
  const id = vendorIds[name.trim().toLowerCase()];
  if (!id) return <>{name}</>;
  return (
    <Link href={`/settings/vendors/${id}`} className="hover:underline">
      {name}
    </Link>
  );
}

/** Build the lookup {@link VendorLink} expects from a list of vendor records. */
export function vendorIdsByName(vendors: { id: string; name: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const vendor of vendors) map[vendor.name.trim().toLowerCase()] = vendor.id;
  return map;
}
