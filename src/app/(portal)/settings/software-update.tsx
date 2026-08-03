"use client";

import { useState } from "react";
import { RefreshCw, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import { checkForUpdatesAction, applyUpdateAction } from "@/modules/updates/actions";
import type { UpdateStatus } from "@/modules/updates/service";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

/**
 * Software update card (Settings). Shows the running version, checks GitHub for
 * a newer release on demand, and - when the host agent is present - applies the
 * update in one click (the app restarts on the new version).
 */
export function SoftwareUpdateForm({
  currentVersion,
  updaterAvailable,
}: {
  currentVersion: string;
  updaterAvailable: boolean;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [started, setStarted] = useState(false);

  async function check() {
    setChecking(true);
    setStarted(false);
    try {
      const result = await checkForUpdatesAction();
      if (result.ok) {
        setStatus(result.data);
        if (result.data.error) toast("error", result.data.error);
      } else {
        toast("error", result.error);
      }
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    if (!status?.latestVersion) return;
    setApplying(true);
    try {
      const result = await applyUpdateAction(status.latestVersion);
      if (result.ok) {
        setStarted(true);
      } else {
        toast("error", result.error);
        setApplying(false);
      }
    } catch {
      toast("error", "Could not start the update.");
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Software update</CardTitle>
        <CardDescription>
          Update Axivo in place. Your data is preserved and a database backup is taken automatically
          before each update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Current version</span>
          <span className="font-register font-medium">{currentVersion}</span>
        </div>

        {started ? (
          <p className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Update started. Axivo will restart on the new version and may be briefly unavailable —
            reload the page in a minute.
          </p>
        ) : status ? (
          status.updateAvailable ? (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm">
                Version <span className="font-register font-medium">{status.latestVersion}</span> is
                available.
                {status.releaseUrl ? (
                  <>
                    {" "}
                    <a
                      href={status.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Release notes
                    </a>
                  </>
                ) : null}
              </p>
              {updaterAvailable ? (
                <Button size="sm" onClick={apply} loading={applying}>
                  <ArrowUpCircle className="h-4 w-4" /> Update to {status.latestVersion}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  One-click update is not available on this deployment. Re-run the installer on the
                  server to update.
                </p>
              )}
            </div>
          ) : status.error ? null : (
            <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> You&apos;re on the latest version.
            </p>
          )
        ) : null}

        <Button variant="outline" size="sm" onClick={check} loading={checking} disabled={applying}>
          <RefreshCw className="h-4 w-4" /> Check for updates
        </Button>
      </CardContent>
    </Card>
  );
}
