"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeSetupAction } from "@/modules/setup/actions";
import { Button } from "@/shared/ui/button";
import { Input, Label, FieldError } from "@/shared/ui/input";

export function SetupForm() {
  const router = useRouter();
  const [values, setValues] = useState({
    organizationName: "",
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const result = await completeSetupAction(values);
      if (result.ok) {
        router.replace(result.data.redirectTo);
        router.refresh();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setLoading(false);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <Label htmlFor="organizationName" required>Organization name</Label>
        <Input
          id="organizationName"
          autoFocus
          value={values.organizationName}
          onChange={set("organizationName")}
          aria-invalid={!!fieldErrors.organizationName}
        />
        <FieldError message={fieldErrors.organizationName} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName" required>First name</Label>
          <Input id="firstName" value={values.firstName} onChange={set("firstName")} aria-invalid={!!fieldErrors.firstName} />
          <FieldError message={fieldErrors.firstName} />
        </div>
        <div>
          <Label htmlFor="lastName" required>Last name</Label>
          <Input id="lastName" value={values.lastName} onChange={set("lastName")} aria-invalid={!!fieldErrors.lastName} />
          <FieldError message={fieldErrors.lastName} />
        </div>
      </div>

      <div>
        <Label htmlFor="email" required>Work email</Label>
        <Input id="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={!!fieldErrors.email} />
        <FieldError message={fieldErrors.email} />
      </div>

      <div>
        <Label htmlFor="username" required>Username</Label>
        <Input id="username" autoComplete="username" value={values.username} onChange={set("username")} aria-invalid={!!fieldErrors.username} />
        <FieldError message={fieldErrors.username} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="password" required>Password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={values.password} onChange={set("password")} aria-invalid={!!fieldErrors.password} />
          <FieldError message={fieldErrors.password} />
        </div>
        <div>
          <Label htmlFor="confirmPassword" required>Confirm password</Label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} aria-invalid={!!fieldErrors.confirmPassword} />
          <FieldError message={fieldErrors.confirmPassword} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Create administrator and continue
      </Button>
    </form>
  );
}
