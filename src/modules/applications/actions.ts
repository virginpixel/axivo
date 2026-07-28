"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { ok, toActionError, ValidationError, NotFoundError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import {
  applicationSchema,
  applicationRoleSchema,
  credentialFieldSchema,
  assignmentSchema,
  updateAssignmentSchema,
  removeAssignmentSchema,
} from "./validators";

/** Applications server actions (SDS Doc 08). */

export async function createApplicationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const application = await service.createApplication(audit, parse(applicationSchema, raw));
    revalidatePath("/applications");
    return ok({ id: application.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateApplicationAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const application = await service.updateApplication(audit, id, parse(applicationSchema, raw));
    revalidatePath("/applications");
    return ok({ id: application.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setApplicationActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setApplicationActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createApplicationRoleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const role = await service.createApplicationRole(audit, parse(applicationRoleSchema, raw));
    revalidatePath("/applications");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateApplicationRoleAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const role = await service.updateApplicationRole(audit, id, parse(applicationRoleSchema, raw));
    revalidatePath("/applications");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setApplicationRoleActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setApplicationRoleActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveCredentialFieldAction(raw: unknown, fieldId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const field = await service.saveCredentialField(audit, parse(credentialFieldSchema, raw), fieldId);
    revalidatePath("/applications");
    return ok({ id: field.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCredentialFieldActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setCredentialFieldActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteApplicationAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const result = await service.deleteApplication(audit, id);
    revalidatePath("/applications");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createAssignmentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const assignment = await service.createAssignment(audit, parse(assignmentSchema, raw));
    revalidatePath("/applications");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Grant application access directly from an employee's page, with the signed
 * access form attached (Doc 08 Ch5, Doc 16).
 *
 * The attachment is required and enforced here rather than only in the browser:
 * access granted outside the request workflow has no approval trail of its own,
 * so the filed form is the only evidence that it was authorised. The document
 * is stored first and the assignment references it, so an assignment can never
 * exist without its paperwork.
 */
export async function addApplicationAccessWithFormAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(undefined, {
        file: "Attach the signed access form. Access granted outside a request needs it as evidence.",
      });
    }
    const input = parse(assignmentSchema, {
      personId: formData.get("personId"),
      applicationId: formData.get("applicationId"),
      applicationRoleId: formData.get("applicationRoleId") || undefined,
      username: formData.get("username") || undefined,
      notes: formData.get("notes") || undefined,
    });

    const person = await db.person.findFirst({
      where: { id: input.personId, deletedAt: null },
      include: { company: true },
    });
    if (!person) throw new NotFoundError("Employee not found.");
    const application = await db.application.findFirst({
      where: { id: input.applicationId, deletedAt: null },
    });
    if (!application) throw new NotFoundError("Application not found.");

    const documents = await import("@/modules/documents/service");
    const document = await documents.createUploadedDocument(audit, {
      companyId: person.companyId,
      name: `Access Form - ${application.name} - ${person.firstName} ${person.lastName}`,
      categoryName: "Access Forms",
      fileName: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      links: [{ entityType: "person", entityId: person.id }],
    });

    const assignment = await service.createAssignment(audit, {
      ...input,
      notes: [input.notes, `Access form: ${document.name}`].filter(Boolean).join(" · "),
    });
    revalidatePath("/applications");
    revalidatePath("/people", "layout");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Change somebody's role or request-field values from their own page, with the
 * authorising document attached. Accepts a pasted screenshot as well as a file,
 * since the evidence is usually an email somebody has on screen.
 */
export async function changeAssignmentAccessAction(
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const assignmentId = String(formData.get("assignmentId") ?? "");
    if (!assignmentId) throw new ValidationError(undefined, { assignmentId: "Missing assignment." });

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(undefined, {
        file: "Attach the approval as a PDF, an email file or a screenshot. A change made outside a request needs evidence.",
      });
    }

    const assignment = await db.applicationAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      include: { application: true, person: true },
    });
    if (!assignment) throw new NotFoundError("Assignment not found.");

    const documents = await import("@/modules/documents/service");
    const document = await documents.createUploadedDocument(audit, {
      companyId: assignment.person.companyId,
      name: `Role Change - ${assignment.application.name} - ${assignment.person.firstName} ${assignment.person.lastName}`,
      categoryName: "Role Change Evidence",
      fileName: file.name || "pasted-screenshot.png",
      content: Buffer.from(await file.arrayBuffer()),
      links: [{ entityType: "person", entityId: assignment.personId }],
    });

    const rawFields = formData.get("fieldData");
    await service.changeAssignmentAccess(audit, assignmentId, {
      applicationRoleId: (formData.get("applicationRoleId") as string) || null,
      fieldData: rawFields ? (JSON.parse(String(rawFields)) as Record<string, unknown>) : undefined,
      reason: (formData.get("reason") as string) || undefined,
      proofDocumentId: document.id,
    });
    revalidatePath("/people", "layout");
    revalidatePath("/applications");
    revalidatePath("/reports");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssignmentAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const assignment = await service.updateAssignment(audit, id, parse(updateAssignmentSchema, raw));
    revalidatePath("/applications");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setAssignmentStatusAction(
  id: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    await service.setAssignmentStatus(audit, id, status);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAssignmentAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const input = parse(removeAssignmentSchema, raw);
    await service.removeAssignment(audit, input.assignmentId, input.reason);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
