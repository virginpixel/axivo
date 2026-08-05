"use client";

import { useRef, useState } from "react";
import { Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

/**
 * Backup & restore (Settings → System Health). Download a portable .axivo file
 * of all data + uploaded files, or restore one onto this installation. Restore
 * is destructive and limited to System Administrators.
 */
export function BackupRestore({ canRestore }: { canRestore: boolean }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);

  function download() {
    setDownloading(true);
    // The response is an attachment, so this triggers a save without navigating.
    window.location.href = "/api/backup/export";
    setTimeout(() => setDownloading(false), 4000);
  }

  async function restore() {
    if (!file || !confirm) return;
    setRestoring(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/backup/restore", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: { rows: number; files: number; fromVersion: string };
      };
      if (res.ok && data.ok) {
        setDone(true);
        toast("success", "Restore complete. Signing you out…");
        // Sessions were cleared by the restore; send the user to sign in again.
        setTimeout(() => {
          window.location.href = "/login";
        }, 2500);
      } else {
        toast("error", data.error ?? "The restore failed.");
        setRestoring(false);
      }
    } catch {
      toast("error", "The restore failed. Please try again.");
      setRestoring(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup &amp; restore</CardTitle>
        <CardDescription>
          Download a portable backup of all your data (records and uploaded files) as a single
          <span className="font-register"> .axivo</span> file. Use it to move Axivo to another
          server, or to restore after a reinstall.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Button variant="outline" onClick={download} loading={downloading} disabled={done}>
            <Download className="h-4 w-4" /> Download backup (.axivo)
          </Button>
          <p className="text-xs text-muted-foreground">
            The backup does not include security keys, so encrypted values (such as the SMTP
            password) must be re-entered after restoring onto a new installation.
          </p>
        </div>

        {canRestore ? (
          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Restoring replaces all current data with the backup&apos;s contents. This cannot be
              undone.
            </p>

            {done ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Restore complete. Redirecting to sign in…
              </p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".axivo"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="h-4 w-4"
                  />
                  I understand this will replace all current data.
                </label>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={restore}
                  loading={restoring}
                  disabled={!file || !confirm}
                >
                  <Upload className="h-4 w-4" /> Restore from backup
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Restoring a backup is limited to System Administrators.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
