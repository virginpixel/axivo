"use client";

import { useState } from "react";
import { Pencil, RotateCw, XCircle, Eraser, Eye } from "lucide-react";
import {
  resendNotificationAction,
  cancelNotificationAction,
  saveTemplateAction,
  archiveFailedNotificationsAction,
} from "@/modules/notifications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function NotificationRowActions({
  notificationId,
  status,
}: {
  notificationId: string;
  status: string;
}) {
  const { run, loading } = useAction();
  return (
    <div className="flex justify-end gap-1">
      {status === "FAILED" || status === "DELIVERED" || status === "EXPIRED" ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Resend notification" title="Resend (creates a new delivery record)"
          onClick={() => run(() => resendNotificationAction(notificationId), { successMessage: "Notification re-queued." })}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      ) : null}
      {status === "QUEUED" ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Cancel notification" title="Cancel"
          onClick={() => run(() => cancelNotificationAction(notificationId), { successMessage: "Notification cancelled." })}
        >
          <XCircle className="h-4 w-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

export function ClearFailedButton() {
  const { run, loading } = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={() =>
        run(() => archiveFailedNotificationsAction(), {
          successMessage: "Failed notifications cleared from alerts.",
        })
      }
    >
      <Eraser className="h-4 w-4" /> Clear failed
    </Button>
  );
}

/** Substitute {{variables}} with sample values for the template preview. */
function renderPreview(template: string, variables: string[]): string {
  let output = template;
  for (const variable of variables) {
    output = output.replaceAll(`{{${variable}}}`, `<mark>${variable}</mark>`);
  }
  return output.replace(/\{\{\s*([\w.]+)\s*\}\}/g, "<mark>$1</mark>");
}

export function TemplateDialog({
  template,
}: {
  template: { key: string; name: string; type: string; subject: string; body: string; variables: string[] };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    name: template.name,
    subject: template.subject,
    body: template.body,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit template ${template.key}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Edit template: ${template.key}`}
        description="Saving creates a new template version; previously sent notifications remain unchanged."
        wide
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="tpl-name" required>Template name</Label>
            <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="tpl-subject" required>Subject</Label>
            <Input id="tpl-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <FieldError message={fieldErrors.subject} />
          </div>
          <div>
            <Label htmlFor="tpl-body" required>Body (HTML)</Label>
            <Textarea id="tpl-body" rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <FieldError message={fieldErrors.body} />
          </div>
          {template.variables.length > 0 ? (
            <HelperText>
              Available variables: {template.variables.map((variable) => `{{${variable}}}`).join(", ")}
            </HelperText>
          ) : null}
          {showPreview ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
              <p
                className="mb-2 border-b pb-2 text-sm font-semibold"
                dangerouslySetInnerHTML={{ __html: renderPreview(form.subject, template.variables) }}
              />
              <div
                className="text-sm [&_mark]:rounded [&_mark]:bg-primary/15 [&_mark]:px-1 [&_mark]:text-primary"
                dangerouslySetInnerHTML={{ __html: renderPreview(form.body, template.variables) }}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowPreview((current) => !current)}>
              <Eye className="h-4 w-4" /> {showPreview ? "Hide preview" : "Preview"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    saveTemplateAction({
                      key: template.key,
                      name: form.name,
                      type: template.type,
                      subject: form.subject,
                      body: form.body,
                    }),
                  { successMessage: "Template saved as a new version.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Save new version
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
