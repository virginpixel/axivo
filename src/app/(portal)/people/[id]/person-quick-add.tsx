"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addApplicationAccessWithFormAction } from "@/modules/applications/actions";
import { assignAssetAction } from "@/modules/assets/actions";
import { assignLicenseAction } from "@/modules/licenses/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { Input, Label, FieldError, HelperText } from "@/shared/ui/input";

/**
 * Grant access, equipment or a licence seat straight from an employee's page,
 * instead of navigating to each module in turn to do the same job.
 *
 * Application access alone demands an attachment: it is the one of the three
 * that carries no approval trail when granted this way, so the signed form is
 * the evidence. Assets and licences are physical or countable and are already
 * evidenced by the assignment record itself.
 */

export function AddApplicationAccessDialog({
  personId,
  applications,
}: {
  personId: string;
  applications: { id: string; name: string; roles: { id: string; name: string }[] }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [applicationRoleId, setApplicationRoleId] = useState("");
  const [username, setUsername] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const selected = applications.find((application) => application.id === applicationId);

  function reset() {
    setApplicationId("");
    setApplicationRoleId("");
    setUsername("");
    setFile(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" /> Add access
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add application access"
        description="Use this when access was granted outside a request. The signed access form is required as the record of who authorised it."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="qa-application" required>Application</Label>
            <Combobox
              id="qa-application"
              value={applicationId}
              onChange={(value) => {
                setApplicationId(value);
                setApplicationRoleId("");
              }}
              options={applications.map((application) => ({
                value: application.id,
                label: application.name,
              }))}
              placeholder="Select an application"
            />
            <FieldError message={fieldErrors.applicationId} />
          </div>

          {selected && selected.roles.length > 0 ? (
            <div>
              <Label htmlFor="qa-role">Access role</Label>
              <Combobox
                id="qa-role"
                value={applicationRoleId}
                onChange={setApplicationRoleId}
                options={selected.roles.map((role) => ({ value: role.id, label: role.name }))}
                placeholder="Select a role"
              />
              <FieldError message={fieldErrors.applicationRoleId} />
            </div>
          ) : null}

          <div>
            <Label htmlFor="qa-username">Username</Label>
            <Input id="qa-username" value={username} onChange={(event) => setUsername(event.target.value)} />
            <FieldError message={fieldErrors.username} />
          </div>

          <div>
            <Label htmlFor="qa-file" required>Signed access form</Label>
            <Input
              id="qa-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.eml,.msg,.doc,.docx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <FieldError message={fieldErrors.file} />
            <HelperText>
              A PDF, an email file or a screenshot. Filed against this employee&apos;s documents.
            </HelperText>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!applicationId || !file}
              onClick={() => {
                const formData = new FormData();
                formData.set("personId", personId);
                formData.set("applicationId", applicationId);
                if (applicationRoleId) formData.set("applicationRoleId", applicationRoleId);
                if (username.trim()) formData.set("username", username.trim());
                if (file) formData.set("file", file);
                return run(() => addApplicationAccessWithFormAction(formData), {
                  successMessage: "Access added and the form filed.",
                  onSuccess: () => {
                    reset();
                    setOpen(false);
                  },
                });
              }}
            >
              Add access
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddAssetAssignmentDialog({
  personId,
  assets,
}: {
  personId: string;
  assets: { id: string; label: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" /> Assign asset
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign an asset" description="Only assets that are currently available can be assigned.">
        {assets.length === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            No available assets in this company.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="qa-asset" required>Asset</Label>
              <Combobox
                id="qa-asset"
                value={assetId}
                onChange={setAssetId}
                options={assets.map((asset) => ({ value: asset.id, label: asset.label }))}
                placeholder="Search by name or tag"
              />
              <FieldError message={fieldErrors.assetId} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                loading={loading}
                disabled={!assetId}
                onClick={() =>
                  run(() => assignAssetAction({ assetId, personId }), {
                    successMessage: "Asset assigned.",
                    onSuccess: () => {
                      setAssetId("");
                      setOpen(false);
                    },
                  })
                }
              >
                Assign
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddLicenseAssignmentDialog({
  personId,
  licenses,
}: {
  personId: string;
  licenses: { id: string; label: string; available: number }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [licenseId, setLicenseId] = useState("");

  const selected = licenses.find((license) => license.id === licenseId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" /> Assign licence
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign a licence seat">
        {licenses.length === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            No licences with seats available in this company.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="qa-license" required>Licence</Label>
              <Combobox
                id="qa-license"
                value={licenseId}
                onChange={setLicenseId}
                options={licenses.map((license) => ({
                  value: license.id,
                  label: `${license.label} (${license.available} free)`,
                }))}
                placeholder="Select a licence"
              />
              <FieldError message={fieldErrors.licenseId} />
              {selected ? <HelperText>{selected.available} seat(s) available.</HelperText> : null}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                loading={loading}
                disabled={!licenseId}
                onClick={() =>
                  run(() => assignLicenseAction({ licenseId, personId }), {
                    successMessage: "Licence seat assigned.",
                    onSuccess: () => {
                      setLicenseId("");
                      setOpen(false);
                    },
                  })
                }
              >
                Assign
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
