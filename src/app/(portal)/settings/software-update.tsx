"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import {
  checkForUpdatesAction,
  applyUpdateAction,
  updateProgressAction,
} from "@/modules/updates/actions";
import type { UpdateStatus } from "@/modules/updates/service";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

/**
 * Software update card (Settings). Shows the running version, checks GitHub for
 * a newer release on demand, and - when the host agent is present - applies the
 * update in one click. While the update runs it polls the agent for progress
 * and reloads the page automatically once the app is back on the new version.
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
  // Progress of an in-flight update (0-100), the current step label, and a flag
  // once the new version is up so the page can reload.
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [done, setDone] = useState(false);
  const [slow, setSlow] = useState(false);
  const targetRef = useRef<string | null>(null);

  async function check() {
    setChecking(true);
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
    setProgress(5);
    setStep("Starting the update");
    setSlow(false);
    try {
      const result = await applyUpdateAction(status.latestVersion);
      if (result.ok) {
        targetRef.current = status.latestVersion;
      } else {
        toast("error", result.error);
        setApplying(false);
      }
    } catch {
      toast("error", "Could not start the update.");
      setApplying(false);
    }
  }

  // Poll the agent for progress once an update is applying, and reload when the
  // app comes back on the target version.
  const poll = useCallback(async () => {
    const target = targetRef.current;
    if (!target) return;
    try {
      const result = await updateProgressAction();
      if (result.ok) {
        if (result.data.currentVersion === target) {
          setProgress(100);
          setStep("Done. Reloading…");
          setDone(true);
          setTimeout(() => window.location.reload(), 1200);
          return;
        }
        const derived = deriveStep(result.data.log);
        // Never move the bar backwards.
        setProgress((current) => Math.max(current, derived.pct));
        setStep(derived.label);
      } else {
        // The web container is being recreated - it can't answer right now.
        setProgress((current) => Math.max(current, 82));
        setStep("Restarting Axivo on the new version…");
      }
    } catch {
      setProgress((current) => Math.max(current, 82));
      setStep("Restarting Axivo on the new version…");
    }
  }, []);

  useEffect(() => {
    if (!applying || done) return;
    const interval = setInterval(poll, 2500);
    const slowTimer = setTimeout(() => setSlow(true), 4 * 60 * 1000);
    poll();
    return () => {
      clearInterval(interval);
      clearTimeout(slowTimer);
    };
  }, [applying, done, poll]);

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

        {applying ? (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {done ? "Update complete" : `Updating to ${targetRef.current}`}
              </span>
              <span className="text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Update progress"
            >
              <div
                className={`h-full rounded-full bg-primary transition-[width] duration-700 ease-out ${
                  done ? "" : "animate-pulse"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              )}
              {step}
            </p>
            {slow && !done ? (
              <p className="text-xs text-muted-foreground">
                This is taking longer than usual. If the page doesn&apos;t come back on its own,{" "}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-primary underline"
                >
                  reload
                </button>{" "}
                in a moment.
              </p>
            ) : null}
          </div>
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
                <Button size="sm" onClick={apply}>
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

        {!applying ? (
          <Button variant="outline" size="sm" onClick={check} loading={checking}>
            <RefreshCw className="h-4 w-4" /> Check for updates
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Map the agent's task log to a coarse progress percentage and a friendly label. */
function deriveStep(log: string): { pct: number; label: string } {
  if (/Pruning old backups/.test(log)) return { pct: 78, label: "Finishing up" };
  if (/Recreating services/.test(log)) return { pct: 70, label: "Applying the update" };
  if (/Pulling images/.test(log)) return { pct: 40, label: "Downloading the new version" };
  if (/Pinning version/.test(log)) return { pct: 22, label: "Preparing" };
  if (/Backing up the database/.test(log)) return { pct: 12, label: "Backing up your data" };
  return { pct: 8, label: "Starting the update" };
}
