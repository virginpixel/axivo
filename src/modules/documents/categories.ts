/**
 * Document category names shared by server and client code. Kept out of
 * service.ts so client components can import a name without pulling the
 * database and storage layers into the browser bundle.
 */

/** Category that approved discard forms are filed under. */
export const DISPOSAL_CATEGORY = "Asset Disposal";
