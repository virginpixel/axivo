"use client";

import { useState } from "react";
import { ShieldCheck, Copy, AlertTriangle } from "lucide-react";
import { acknowledgeCredentialsAction } from "@/modules/requests/actions";
import type { RevealedCredentials } from "@/modules/credentials/service";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

export function CredentialsReveal({
  token,
  applicationName,
}: {
  token: string;
  applicationName: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setLoading(true);
    setError(null);
    try {
      const result = await acknowledgeCredentialsAction(token);
      if (result.ok) {
        setRevealed(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", `${label} copied to clipboard.`);
    } catch {
      toast("error", "Could not copy to clipboard.");
    }
  }

  if (!revealed) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Acknowledge receipt to view your credentials</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            By continuing you confirm receipt of your {applicationName} access. The temporary
            password is shown <strong>once</strong>. Store it in a safe place and change it at
            first login.
          </p>
          {error ? (
            <p className="mx-auto mt-4 max-w-md rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="mt-5" size="lg" loading={loading} onClick={acknowledge}>
            Acknowledge and view credentials
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="rounded-md bg-success/10 px-4 py-3 text-sm text-success">
          Receipt acknowledged. Your credentials are shown below.
        </div>
        <CredentialRow label="Application" value={revealed.applicationName} />
        {revealed.loginUrl ? (
          <CredentialRow
            label="Login URL"
            value={revealed.loginUrl}
            action={
              <a href={revealed.loginUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                Open
              </a>
            }
          />
        ) : null}
        <CredentialRow
          label="Username"
          value={revealed.username}
          action={
            <button type="button" onClick={() => copy(revealed.username, "Username")} aria-label="Copy username">
              <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          }
        />
        {revealed.temporarySecret ? (
          <>
            <CredentialRow
              label="Temporary password"
              value={revealed.temporarySecret}
              mono
              action={
                <button
                  type="button"
                  onClick={() => copy(revealed.temporarySecret!, "Temporary password")}
                  aria-label="Copy temporary password"
                >
                  <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              }
            />
            <p className="flex items-start gap-2 rounded-md bg-warning/10 px-4 py-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              This password is shown only once and cannot be viewed again. Change it immediately
              after your first login.
            </p>
          </>
        ) : (
          <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            The temporary password is no longer available (already viewed or expired). Contact IT if
            you still need it, they can issue a new one.
          </p>
        )}
        {revealed.fields.length > 0 ? (
          <div className="border-t pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional information
            </h3>
            {revealed.fields.map((field) => (
              <CredentialRow key={field.fieldName} label={field.fieldName} value={field.fieldValue} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CredentialRow({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`truncate text-sm ${mono ? "font-mono font-semibold" : ""}`}>{value}</p>
      </div>
      {action}
    </div>
  );
}
