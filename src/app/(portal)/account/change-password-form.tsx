"use client";

import { useState } from "react";
import { changeOwnPasswordAction } from "@/modules/auth/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Label, FieldError } from "@/shared/ui/input";

export function ChangePasswordForm() {
  const { run, loading, fieldErrors } = useAction();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => changeOwnPasswordAction(form), {
          successMessage: "Password changed.",
          onSuccess: () => setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }),
        });
      }}
    >
      <div>
        <Label htmlFor="cur-password" required>Current password</Label>
        <Input
          id="cur-password" type="password" autoComplete="current-password" value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
        />
        <FieldError message={fieldErrors.currentPassword} />
      </div>
      <div>
        <Label htmlFor="new-password" required>New password</Label>
        <Input
          id="new-password" type="password" autoComplete="new-password" value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
        <FieldError message={fieldErrors.newPassword} />
      </div>
      <div>
        <Label htmlFor="confirm-password" required>Confirm new password</Label>
        <Input
          id="confirm-password" type="password" autoComplete="new-password" value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        />
        <FieldError message={fieldErrors.confirmPassword} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>Change password</Button>
      </div>
    </form>
  );
}
