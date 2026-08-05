"use client";

import { useState } from "react";
import { Globe, ShieldCheck, Power, ExternalLink } from "lucide-react";
import { enableTunnelAction, disableTunnelAction } from "@/modules/tunnel/actions";
import type { TunnelStatus } from "@/modules/tunnel/service";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input, Label } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";

/**
 * Remote access card (Settings). Lets an admin turn on Cloudflare Tunnel access
 * so approvers can reach Axivo from the internet. The tokens are handed to the
 * host agent (which writes them to the host .env and starts cloudflared); they
 * are never stored in the app database. Off = local HTTP only.
 */
export function TunnelAccessForm({ status }: { status: TunnelStatus }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(status.enabled);
  const [hostname, setHostname] = useState(status.hostname);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function enable(formData: FormData) {
    setBusy(true);
    try {
      const domain = String(formData.get("domain") ?? "").trim();
      const result = await enableTunnelAction({
        domain,
        tunnelToken: String(formData.get("tunnelToken") ?? "").trim(),
        apiToken: String(formData.get("apiToken") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
      });
      if (result.ok) {
        setEnabled(true);
        setHostname(domain);
        setStarted(true);
      } else {
        toast("error", result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const result = await disableTunnelAction();
      if (result.ok) {
        setEnabled(false);
        setHostname("");
        setStarted(true);
      } else {
        toast("error", result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" /> Remote access
        </CardTitle>
        <CardDescription>
          Reach Axivo from the internet through a Cloudflare Tunnel so approvers can act from
          anywhere. When on, the site is served over HTTPS with a trusted certificate (issued via
          Cloudflare DNS) — no port forwarding, no certificate warnings. When off, Axivo stays on
          your local network over HTTP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status.available ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Remote access requires the host update agent, which isn&apos;t available on this
            deployment. Re-run the installer on the server to enable it.
          </p>
        ) : enabled ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Remote access is on.
                {hostname ? (
                  <>
                    {" "}
                    Reachable at{" "}
                    <a
                      href={`https://${hostname}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      https://{hostname}
                    </a>
                    .
                  </>
                ) : null}
              </span>
            </p>
            {started ? (
              <p className="text-xs text-muted-foreground">
                Applying the change on the server — it may take a minute for the certificate to
                issue and the tunnel to connect.
              </p>
            ) : null}
            <Button variant="outline" size="sm" onClick={disable} loading={busy}>
              <Power className="h-4 w-4" /> Turn off remote access
            </Button>
          </div>
        ) : (
          <>
            {started ? (
              <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                Remote access turned off. Axivo is back to local HTTP only.
              </p>
            ) : null}
            <details className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Before you start: create a tunnel in Cloudflare
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Add your domain to Cloudflare (free plan is fine) and point its nameservers there.
                </li>
                <li>
                  In{" "}
                  <a
                    href="https://one.dash.cloudflare.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Zero Trust → Networks → Tunnels
                  </a>
                  , create a tunnel, add a public hostname (e.g. axivo.yourcompany.com) routing to{" "}
                  <span className="font-mono">http://caddy:80</span>, and copy the connector token.
                </li>
                <li>
                  Create an{" "}
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    API token
                  </a>{" "}
                  with the <span className="font-medium">Zone → DNS → Edit</span> permission for that
                  zone (used to issue the HTTPS certificate).
                </li>
                <li>
                  For access inside your LAN too, point the same hostname at Axivo&apos;s local IP on
                  your local DNS resolver (router / Pi-hole).
                </li>
              </ol>
            </details>
            <form action={enable} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="tunnel-domain">Public hostname</Label>
                <Input
                  id="tunnel-domain"
                  name="domain"
                  placeholder="axivo.yourcompany.com"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tunnel-token">Tunnel connector token</Label>
                <Input
                  id="tunnel-token"
                  name="tunnelToken"
                  type="password"
                  placeholder="eyJhIjoi…"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tunnel-api-token">Cloudflare API token (DNS edit)</Label>
                <Input
                  id="tunnel-api-token"
                  name="apiToken"
                  type="password"
                  placeholder="For issuing the HTTPS certificate"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tunnel-email">Contact email (for Let&apos;s Encrypt)</Label>
                <Input
                  id="tunnel-email"
                  name="email"
                  type="email"
                  placeholder="admin@yourcompany.com"
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" size="sm" loading={busy}>
                <ExternalLink className="h-4 w-4" /> Turn on remote access
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
