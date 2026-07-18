"use client";

import { useState } from "react";
import { LogOut, Send } from "lucide-react";
import {
  saveSecuritySettingsAction,
  saveSmtpAction,
  saveBrandingAction,
  saveNotificationSettingsAction,
  saveMaintenanceModeAction,
  saveUploadSettingsAction,
  forceLogoutSessionAction,
} from "@/modules/settings/actions";
import { testSmtpChannelAction } from "@/modules/notifications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

export function SecuritySettingsForm({
  current,
  readOnly,
}: {
  current: {
    sessionIdleMinutes: number;
    sessionAbsoluteHours: number;
    loginMaxAttempts: number;
    loginCooldownMinutes: number;
    tokenExpiryHours: number;
    credentialSecretExpiryHours: number;
    publicFormRatePerHour: number;
    passwordMinLength: number;
  };
  readOnly: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [form, setForm] = useState(current);

  const fields: { key: keyof typeof current; label: string; hint?: string }[] = [
    { key: "sessionIdleMinutes", label: "Session idle timeout (minutes)" },
    { key: "sessionAbsoluteHours", label: "Absolute session timeout (hours)" },
    { key: "loginMaxAttempts", label: "Failed logins before cooldown", hint: "Accounts are never permanently locked." },
    { key: "loginCooldownMinutes", label: "Login cooldown (minutes)" },
    { key: "tokenExpiryHours", label: "Secure email link expiry (hours)" },
    { key: "credentialSecretExpiryHours", label: "Temporary credential expiry (hours)" },
    { key: "publicFormRatePerHour", label: "Public form submissions per IP per hour" },
    { key: "passwordMinLength", label: "Minimum password length", hint: "Cannot be reduced below 12 (SDS baseline)." },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security policies</CardTitle>
        <CardDescription>Session, throttling, token and password settings (SDS Doc 05).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={`sec-${field.key}`}>{field.label}</Label>
              <Input
                id={`sec-${field.key}`}
                type="number"
                value={form[field.key]}
                readOnly={readOnly}
                onChange={(event) => setForm({ ...form, [field.key]: Number(event.target.value) })}
              />
              {field.hint ? <HelperText>{field.hint}</HelperText> : null}
              <FieldError message={fieldErrors[field.key]} />
            </div>
          ))}
        </div>
        {!readOnly ? (
          <div className="mt-4 flex justify-end">
            <Button
              loading={loading}
              onClick={() => run(() => saveSecuritySettingsAction(form), { successMessage: "Security settings saved." })}
            >
              Save security settings
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SmtpSettingsForm({
  current,
  readOnly,
}: {
  current: {
    host: string;
    port: number;
    encryption: string;
    authMethod: string;
    username: string;
    senderName: string;
    senderEmail: string;
    replyTo: string;
    hasPassword: boolean;
  } | null;
  readOnly: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [form, setForm] = useState({
    host: current?.host ?? "",
    port: current?.port ?? 587,
    encryption: current?.encryption ?? "tls",
    authMethod: current?.authMethod ?? "login",
    username: current?.username ?? "",
    password: "",
    senderName: current?.senderName ?? "Axivo",
    senderEmail: current?.senderEmail ?? "",
    replyTo: current?.replyTo ?? "",
  });
  const [testRecipient, setTestRecipient] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outgoing email (SMTP)</CardTitle>
        <CardDescription>
          Used for approvals, credential deliveries and reminders. The password is stored encrypted and never displayed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="smtp-host" required>SMTP server</Label>
            <Input id="smtp-host" value={form.host} readOnly={readOnly} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            <FieldError message={fieldErrors.host} />
          </div>
          <div>
            <Label htmlFor="smtp-port" required>Port</Label>
            <Input id="smtp-port" type="number" value={form.port} readOnly={readOnly} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="smtp-encryption" required>Encryption</Label>
            <Select id="smtp-encryption" value={form.encryption} disabled={readOnly} onChange={(e) => setForm({ ...form, encryption: e.target.value })}>
              <option value="none">None</option>
              <option value="tls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="smtp-auth" required>Authentication</Label>
            <Select id="smtp-auth" value={form.authMethod} disabled={readOnly} onChange={(e) => setForm({ ...form, authMethod: e.target.value })}>
              <option value="none">None</option>
              <option value="login">Username & password</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="smtp-username">Username</Label>
            <Input id="smtp-username" value={form.username} readOnly={readOnly} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="smtp-password">Password</Label>
            <Input
              id="smtp-password"
              type="password"
              value={form.password}
              readOnly={readOnly}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={current?.hasPassword ? "•••••••• (unchanged)" : ""}
              autoComplete="new-password"
            />
            <HelperText>Leave blank to keep the stored password.</HelperText>
          </div>
          <div>
            <Label htmlFor="smtp-sender-name" required>Sender name</Label>
            <Input id="smtp-sender-name" value={form.senderName} readOnly={readOnly} onChange={(e) => setForm({ ...form, senderName: e.target.value })} />
            <FieldError message={fieldErrors.senderName} />
          </div>
          <div>
            <Label htmlFor="smtp-sender-email" required>Sender email</Label>
            <Input id="smtp-sender-email" type="email" value={form.senderEmail} readOnly={readOnly} onChange={(e) => setForm({ ...form, senderEmail: e.target.value })} />
            <FieldError message={fieldErrors.senderEmail} />
          </div>
          <div>
            <Label htmlFor="smtp-reply-to">Reply-to</Label>
            <Input id="smtp-reply-to" type="email" value={form.replyTo} readOnly={readOnly} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
          </div>
        </div>
        {!readOnly ? (
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="smtp-test-recipient">Send test email to</Label>
                <Input
                  id="smtp-test-recipient"
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="you@example.com"
                  className="w-64"
                />
              </div>
              <Button
                variant="outline"
                loading={loading}
                disabled={!testRecipient}
                onClick={() =>
                  run(() => testSmtpChannelAction(testRecipient), { successMessage: "Test email delivered." })
                }
              >
                <Send className="h-4 w-4" /> Send test email
              </Button>
            </div>
            <Button
              loading={loading}
              onClick={() => run(() => saveSmtpAction(form), { successMessage: "SMTP settings saved." })}
            >
              Save SMTP settings
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BrandingForm({
  current,
  readOnly,
}: {
  current: { systemName: string; primaryColor: string; secondaryColor: string };
  readOnly: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [form, setForm] = useState(current);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Brand changes propagate across the application, emails and future generated PDFs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="brand-name" required>System name</Label>
          <Input id="brand-name" value={form.systemName} readOnly={readOnly} onChange={(e) => setForm({ ...form, systemName: e.target.value })} />
          <FieldError message={fieldErrors.systemName} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="brand-primary" required>Primary color</Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.primaryColor}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border"
                aria-label="Primary color picker"
              />
              <Input id="brand-primary" value={form.primaryColor} readOnly={readOnly} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
            </div>
            <FieldError message={fieldErrors.primaryColor} />
          </div>
          <div>
            <Label htmlFor="brand-secondary" required>Secondary color</Label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.secondaryColor}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border"
                aria-label="Secondary color picker"
              />
              <Input id="brand-secondary" value={form.secondaryColor} readOnly={readOnly} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} />
            </div>
            <FieldError message={fieldErrors.secondaryColor} />
          </div>
        </div>
        {!readOnly ? (
          <div className="flex justify-end">
            <Button loading={loading} onClick={() => run(() => saveBrandingAction(form), { successMessage: "Branding saved." })}>
              Save branding
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NotificationSettingsForm({
  current,
  readOnly,
}: {
  current: {
    reminderApprovalHours: number;
    reminderImplementationHours: number;
    reminderAckHours: number;
    notifyRequesterOnRejection: boolean;
    notifyRequesterOnFinalApproval: boolean;
    contractReminderDays: number[];
    licenseReminderDays: number[];
  };
  readOnly: boolean;
}) {
  const { run, loading } = useAction();
  const [form, setForm] = useState({
    ...current,
    contractDaysText: current.contractReminderDays.join(", "),
    licenseDaysText: current.licenseReminderDays.join(", "),
  });

  function parseDays(text: string): number[] {
    return text
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification & reminder settings</CardTitle>
        <CardDescription>Reminder schedules for approvals, acknowledgements and renewals (SDS Doc 14 Ch6).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="not-approval">Approval reminder after (hours, 0 = off)</Label>
            <Input id="not-approval" type="number" value={form.reminderApprovalHours} readOnly={readOnly}
              onChange={(e) => setForm({ ...form, reminderApprovalHours: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="not-impl">Implementation reminder after (hours)</Label>
            <Input id="not-impl" type="number" value={form.reminderImplementationHours} readOnly={readOnly}
              onChange={(e) => setForm({ ...form, reminderImplementationHours: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="not-ack">Acknowledgement reminder after (hours)</Label>
            <Input id="not-ack" type="number" value={form.reminderAckHours} readOnly={readOnly}
              onChange={(e) => setForm({ ...form, reminderAckHours: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="not-contract-days">Contract reminder days before expiry</Label>
            <Input id="not-contract-days" value={form.contractDaysText} readOnly={readOnly}
              onChange={(e) => setForm({ ...form, contractDaysText: e.target.value })} placeholder="60, 30, 14, 7" />
          </div>
          <div>
            <Label htmlFor="not-license-days">License reminder days before expiry</Label>
            <Input id="not-license-days" value={form.licenseDaysText} readOnly={readOnly}
              onChange={(e) => setForm({ ...form, licenseDaysText: e.target.value })} placeholder="60, 30, 14, 7" />
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.notifyRequesterOnRejection} disabled={readOnly}
              onChange={(e) => setForm({ ...form, notifyRequesterOnRejection: e.target.checked })} className="h-4 w-4" />
            Send rejection emails to requesters
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.notifyRequesterOnFinalApproval} disabled={readOnly}
              onChange={(e) => setForm({ ...form, notifyRequesterOnFinalApproval: e.target.checked })} className="h-4 w-4" />
            Send completion emails to requesters
          </label>
        </div>
        {!readOnly ? (
          <div className="flex justify-end">
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    saveNotificationSettingsAction({
                      reminderApprovalHours: form.reminderApprovalHours,
                      reminderImplementationHours: form.reminderImplementationHours,
                      reminderAckHours: form.reminderAckHours,
                      notifyRequesterOnRejection: form.notifyRequesterOnRejection,
                      notifyRequesterOnFinalApproval: form.notifyRequesterOnFinalApproval,
                      contractReminderDays: parseDays(form.contractDaysText),
                      licenseReminderDays: parseDays(form.licenseDaysText),
                    }),
                  { successMessage: "Notification settings saved." },
                )
              }
            >
              Save notification settings
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MaintenanceForm({
  current,
  readOnly,
}: {
  current: { enabled: boolean; message: string };
  readOnly: boolean;
}) {
  const { run, loading } = useAction();
  const [form, setForm] = useState(current);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance mode</CardTitle>
        <CardDescription>
          Blocks standard users while System Administrators retain access. Fully audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} disabled={readOnly}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4" />
          Maintenance mode enabled
        </label>
        <div>
          <Label htmlFor="maint-message">Maintenance message</Label>
          <Textarea id="maint-message" value={form.message} readOnly={readOnly}
            onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        {!readOnly ? (
          <div className="flex justify-end">
            <Button
              variant={form.enabled ? "destructive" : "primary"}
              loading={loading}
              onClick={() => run(() => saveMaintenanceModeAction(form), { successMessage: "Maintenance mode updated." })}
            >
              Save maintenance mode
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function UploadSettingsForm({
  current,
  readOnly,
}: {
  current: { maxMb: number; allowedTypes: string[] };
  readOnly: boolean;
}) {
  const { run, loading } = useAction();
  const [maxMb, setMaxMb] = useState(current.maxMb);
  const [typesText, setTypesText] = useState(current.allowedTypes.join(", "));

  return (
    <Card>
      <CardHeader>
        <CardTitle>File uploads</CardTitle>
        <CardDescription>Allowed types and maximum size for uploaded documents. Executables are always rejected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="upl-max">Maximum size (MB)</Label>
            <Input id="upl-max" type="number" value={maxMb} readOnly={readOnly} onChange={(e) => setMaxMb(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="upl-types">Allowed extensions</Label>
            <Input id="upl-types" value={typesText} readOnly={readOnly} onChange={(e) => setTypesText(e.target.value)} placeholder="pdf, docx, xlsx, jpg, png, zip" />
          </div>
        </div>
        {!readOnly ? (
          <div className="flex justify-end">
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    saveUploadSettingsAction({
                      maxMb,
                      allowedTypes: typesText.split(",").map((type) => type.trim()).filter(Boolean),
                    }),
                  { successMessage: "Upload settings saved." },
                )
              }
            >
              Save upload settings
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ForceLogoutButton({ sessionId }: { sessionId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Force logout"
      title="Force logout"
      onClick={() => run(() => forceLogoutSessionAction(sessionId), { successMessage: "Session revoked." })}
    >
      <LogOut className="h-4 w-4 text-destructive" />
    </Button>
  );
}
