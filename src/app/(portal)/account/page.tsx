import { requireUser } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { formatDateTime } from "@/shared/utils";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await requireUser();
  const record = await db.systemUser.findUnique({
    where: { id: user.userId },
    include: { person: { include: { company: true, department: true } } },
  });
  const sessions = await db.session.count({
    where: { systemUserId: user.userId, revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
  });

  return (
    <div>
      <PageHeader title="My account" description="Your profile and security settings." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Name" value={user.displayName} />
              <Row label="Username" value={user.username} />
              <Row label="Email" value={user.email} />
              <Row label="System role" value={user.systemRoleName} />
              <Row label="Company" value={record?.person.company.name ?? "None"} />
              <Row label="Department" value={record?.person.department?.name ?? "None"} />
              <Row label="Last login" value={record?.lastLoginAt ? formatDateTime(record.lastLoginAt) : "None"} />
              <Row
                label="Password changed"
                value={record?.passwordChangedAt ? formatDateTime(record.passwordChangedAt) : "None"}
              />
              <Row label="Active sessions" value={String(sessions)} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Minimum 12 characters with uppercase, lowercase, number and special character. Other
              sessions are signed out after a change.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
