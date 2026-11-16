"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, Pencil, Plus, Unlink } from "lucide-react";
import {
  createCredentialSetAction,
  updateCredentialSetAction,
  revealPasswordAction,
  linkCredentialAction,
  linkCredentialToDevicesAction,
  unlinkCredentialAction,
} from "@/modules/infrastructure/actions";
import { CREDENTIAL_PURPOSES } from "@/modules/infrastructure/validators";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { MultiSelect } from "@/shared/ui/multi-select";
import { Dialog, DialogContent, DialogTrigger, ConfirmDialog } from "@/shared/ui/dialog";

export interface CredentialSetRecord {
  id: string;
  companyId: string | null;
  name: string;
  username: string | null;
  notes: string | null;
  hasPassword: boolean;
}

/** Value used by the company picker for "shared with every company". */
const SHARED = "__shared__";

export function CredentialSetDialog({
  companies,
  canShare,
  set,
  trigger = "icon",
}: {
  companies: { id: string; name: string }[];
  /** Only a System Administrator may create or edit a set shared by all companies. */
  canShare: boolean;
  set?: CredentialSetRecord;
  trigger?: "icon" | "button";
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () => ({
    companyId: set ? (set.companyId ?? SHARED) : companies.length === 1 && !canShare ? companies[0]!.id : "",
    name: set?.name ?? "",
    username: set?.username ?? "",
    password: "",
    notes: set?.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const [showPassword, setShowPassword] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(initial());
      setShowPassword(false);
    }
    setOpen(next);
  }

  async function submit() {
    const payload = {
      companyId: form.companyId === SHARED ? null : form.companyId || null,
      name: form.name,
      username: form.username,
      notes: form.notes,
      ...(form.password ? { password: form.password } : {}),
    };
    await run(() => (set ? updateCredentialSetAction(set.id, payload) : createCredentialSetAction(payload)), {
      successMessage: set ? (form.password ? "Saved, with the new password." : "Saved.") : "Credential set created.",
      onSuccess: () => {
        setForm((prev) => ({ ...prev, password: "" }));
        setOpen(false);
      },
    });
  }

  const companyOptions = [
    ...(canShare ? [{ value: SHARED, label: "Shared - every company" }] : []),
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {set ? (
          trigger === "button" ? (
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> Edit</Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label={`Edit ${set.name}`}><Pencil className="h-4 w-4" /></Button>
          )
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New credential set</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={set ? `Edit ${set.name}` : "New credential set"}
        description="One login that any number of devices can use. The password is stored encrypted."
      >
        <div className="grid gap-3">
          <div>
            <Label htmlFor="cs-company" required>Company</Label>
            <Combobox
              id="cs-company"
              value={form.companyId}
              disabled={!!set && set.companyId === null && !canShare}
              placeholder="Select company"
              options={companyOptions}
              onChange={(value) => setForm({ ...form, companyId: value })}
            />
            <FieldError message={fieldErrors.companyId} />
          </div>
          <div>
            <Label htmlFor="cs-name" required>Name</Label>
            <Input id="cs-name" value={form.name} placeholder="e.g. CXR switch admin" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="cs-username">Username</Label>
            <Input id="cs-username" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <FieldError message={fieldErrors.username} />
          </div>
          <div>
            <Label htmlFor="cs-password">{set ? "New password" : "Password"}</Label>
            <div className="relative">
              <Input
                id="cs-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="pr-10"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <HelperText>
              {set
                ? set.hasPassword
                  ? "Leave blank to keep the current password."
                  : "No password is stored yet."
                : "Optional. You can add it later."}
            </HelperText>
            <FieldError message={fieldErrors.password} />
          </div>
          <div>
            <Label htmlFor="cs-notes">Notes</Label>
            <Textarea id="cs-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <HelperText>Do not put passwords here: notes are not encrypted.</HelperText>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading}>{set ? "Save changes" : "Create"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const REVEAL_SECONDS = 30;

/**
 * Reveal a stored password for 30 seconds. Each click is a fresh, audited
 * request; the value is dropped from memory when it hides.
 */
export function RevealPassword({ id, compact = false }: { id: string; compact?: boolean }) {
  const { toast } = useToast();
  const [password, setPassword] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function hide() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPassword(null);
    setLeft(0);
    setCopied(false);
  }

  async function reveal() {
    setLoading(true);
    try {
      const result = await revealPasswordAction(id);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setPassword(result.data.password);
      setLeft(REVEAL_SECONDS);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setLeft((value) => {
          if (value <= 1) {
            hide();
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      toast("error", "Copy was blocked by the browser. Select the password and copy it instead.");
    }
  }

  if (!password) {
    return (
      <Button variant="outline" size="sm" onClick={reveal} loading={loading} aria-label="Reveal password">
        <Eye className="h-4 w-4" /> {compact ? "Reveal" : "Reveal password"}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="select-all rounded-md border bg-muted px-2 py-1 font-mono text-sm">{password}</code>
      <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy password">
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="sm" onClick={hide}>Hide ({left}s)</Button>
    </span>
  );
}

/** Link one credential set to the device being viewed. */
export function LinkCredentialDialog({
  deviceId,
  sets,
}: {
  deviceId: string;
  sets: { id: string; name: string; username: string | null; shared: boolean }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [credentialSetId, setCredentialSetId] = useState("");
  const [purpose, setPurpose] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) { setCredentialSetId(""); setPurpose(""); } setOpen(next); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Link2 className="h-4 w-4" /> Link a login</Button>
      </DialogTrigger>
      <DialogContent title="Link a login" description="Pick the credential set this device uses. Create new ones in the Credential vault.">
        <div className="grid gap-3">
          <div>
            <Label htmlFor="link-set" required>Credential set</Label>
            <Combobox
              id="link-set"
              value={credentialSetId}
              placeholder="Select credential set"
              options={sets.map((s) => ({
                value: s.id,
                label: s.name,
                hint: [s.username ? `User ${s.username}` : "No username", s.shared ? "Shared" : null].filter(Boolean).join(" · "),
              }))}
              onChange={setCredentialSetId}
            />
            <FieldError message={fieldErrors.credentialSetId} />
          </div>
          <PurposeField value={purpose} onChange={setPurpose} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            disabled={!credentialSetId}
            onClick={() =>
              run(() => linkCredentialAction({ deviceId, credentialSetId, purpose }), {
                successMessage: "Login linked.",
                onSuccess: () => setOpen(false),
              })
            }
          >
            Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Link a credential set to many devices at once, from the set's own page. */
export function LinkDevicesDialog({
  credentialSetId,
  devices,
}: {
  credentialSetId: string;
  devices: { id: string; name: string; hint: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [purpose, setPurpose] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) { setDeviceIds([]); setPurpose(""); } setOpen(next); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Link2 className="h-4 w-4" /> Link devices</Button>
      </DialogTrigger>
      <DialogContent title="Link devices" description="Every device picked here will use this login." wide>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="link-devices" required>Devices</Label>
            <MultiSelect
              id="link-devices"
              values={deviceIds}
              placeholder="Select devices"
              options={devices.map((d) => ({ value: d.id, label: d.name, hint: d.hint }))}
              onChange={setDeviceIds}
            />
            <FieldError message={fieldErrors.deviceIds} />
          </div>
          <PurposeField value={purpose} onChange={setPurpose} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            disabled={deviceIds.length === 0}
            onClick={() =>
              run(() => linkCredentialToDevicesAction({ credentialSetId, deviceIds, purpose }), {
                successMessage: `Linked to ${deviceIds.length} device${deviceIds.length === 1 ? "" : "s"}.`,
                onSuccess: () => setOpen(false),
              })
            }
          >
            Link {deviceIds.length > 0 ? deviceIds.length : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PurposeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const known = (CREDENTIAL_PURPOSES as readonly string[]).includes(value) || value === "";
  const [custom, setCustom] = useState(!known);
  return (
    <div>
      <Label htmlFor="link-purpose">Used for</Label>
      {custom ? (
        <Input id="link-purpose" value={value} placeholder="e.g. SNMP" onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Select
          id="link-purpose"
          value={value}
          onChange={(e) => {
            if (e.target.value === "__other__") {
              setCustom(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">Not specified</option>
          {CREDENTIAL_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>{purpose}</option>
          ))}
          <option value="__other__">Something else...</option>
        </Select>
      )}
    </div>
  );
}

export function UnlinkCredentialButton({ linkId, label }: { linkId: string; label: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Unlink ${label}`} title="Unlink" onClick={() => setOpen(true)}>
        <Unlink className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Unlink this login?"
        message={`"${label}" stays in the vault; only this device stops pointing at it.`}
        confirmLabel="Unlink"
        loading={loading}
        onConfirm={() => run(() => unlinkCredentialAction(linkId), { successMessage: "Unlinked.", onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

export function NoPasswordNote() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <KeyRound className="h-3.5 w-3.5" /> No password stored
    </span>
  );
}
