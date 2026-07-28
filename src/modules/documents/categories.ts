/**
 * Document category names shared by server and client code. Kept out of
 * service.ts so client components can import a name without pulling the
 * database and storage layers into the browser bundle.
 */

/** Category that approved discard forms are filed under. */
export const DISPOSAL_CATEGORY = "Asset Disposal";

/** Human labels for DocumentKind, so "GENERATED_PDF" reads as "Generated PDF". */
const KIND_LABELS: Record<string, string> = {
  GENERATED_PDF: "Generated PDF",
  UPLOADED_FILE: "Uploaded file",
  IMAGE: "Image",
  SPREADSHEET: "Spreadsheet",
  WORD_DOCUMENT: "Word document",
  OTHER: "Other",
};

export function documentKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}
