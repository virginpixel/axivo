import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";

export interface AssetListRow {
  id: string;
  name: string;
  assetTag: string | null;
  status: string;
  category?: string | null;
  location?: string | null;
  company?: string | null;
}

/** Reusable card that lists assets for a catalog drill-down (manufacturer/model/vendor/category/location). */
export function AssetListCard({ title, assets }: { title: string; assets: AssetListRow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({assets.length})</CardTitle></CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <EmptyState title="No assets" description="No assets are recorded for this entry yet." />
        ) : (
          <Table>
            <THead>
              <TR><TH>Asset</TH><TH>Tag</TH><TH>Category</TH><TH>Location</TH><TH>Status</TH></TR>
            </THead>
            <TBody>
              {assets.map((asset) => (
                <TR key={asset.id}>
                  <TD className="font-medium">
                    <Link href={`/assets/${asset.id}`} className="hover:underline">{asset.name}</Link>
                  </TD>
                  <TD>{asset.assetTag ?? "None"}</TD>
                  <TD>{asset.category ?? "None"}</TD>
                  <TD>{asset.location ?? "None"}</TD>
                  <TD><StatusBadge status={asset.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
