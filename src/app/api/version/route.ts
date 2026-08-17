/**
 * Public running-version endpoint. Used by the Software Update card to detect
 * when the app comes back on the new version after a one-click update: a plain
 * GET survives the container swap, whereas a server action would fail because
 * its action id no longer matches the freshly built bundle.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { version: process.env.AXIVO_VERSION || "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
