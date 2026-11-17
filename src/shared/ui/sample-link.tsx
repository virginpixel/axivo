import { Download } from "lucide-react";

/** "Download a sample" for a spreadsheet import: the headings it reads, with example rows. */
export function SampleLink({ kind, label = "Download a sample" }: { kind: string; label?: string }) {
  return (
    <a
      href={`/api/samples/${kind}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <Download className="h-4 w-4" /> {label}
    </a>
  );
}
