"use client";

import { useState } from "react";
import { Check, Copy, DatabaseBackup } from "lucide-react";
import {
  requestConfigBackupAction, setBackupIncludedAction, saveBackupSettingsAction,
} from "@/modules/infrastructure/actions";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Label, Select } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

/** Start a backup now: one device, or every included device. */
export function BackupNowButton({ deviceId, label }: { deviceId?: string; label?: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={() =>
        run(() => requestConfigBackupAction(deviceId), {
          successMessage: deviceId
            ? "Backup started. Refresh in a minute to see the result."
            : "Backup started for every included device. It takes a few minutes.",
        })
      }
    >
      <DatabaseBackup className="h-4 w-4" /> {label ?? "Back up now"}
    </Button>
  );
}

/** Whether the nightly backup includes this device. */
export function BackupIncludedToggle({ deviceId, included }: { deviceId: string; included: boolean }) {
  const { run, loading } = useAction();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[hsl(var(--primary))]"
        checked={included}
        disabled={loading}
        onChange={(e) => {
          const next = e.target.checked;
          void run(() => setBackupIncludedAction(deviceId, next), {
            successMessage: next ? "Included in the nightly backup." : "Left out of the nightly backup.",
          });
        }}
      />
      Nightly backup
    </label>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** The schedule: on or off, and the hour. One setting for every company. */
export function BackupScheduleDialog({ enabled, hour, timeZone }: { enabled: boolean; hour: number; timeZone: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ enabled, hour });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm({ enabled, hour });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Change schedule</Button>
      </DialogTrigger>
      <DialogContent title="Nightly backup" description="One schedule for every company's devices.">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Back up every night
          </label>
          <div>
            <Label htmlFor="backup-hour">Start at</Label>
            <Select
              id="backup-hour"
              value={form.hour}
              disabled={!form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, hour: Number(e.target.value) }))}
            >
              {HOURS.map((value) => (
                <option key={value} value={value}>{hourLabel(value)}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{timeZone} time. A quiet hour is best; it only reads, but it does log in to every device.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() => run(() => saveBackupSettingsAction(form), { successMessage: "Schedule saved.", onSuccess: () => setOpen(false) })}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Copy a whole configuration, ready to paste into a new switch. */
export function CopyConfigButton({ text }: { text: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast("error", "Could not copy. Use Download instead.");
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}
