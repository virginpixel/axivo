import { describe, it, expect } from "vitest";
import { validateSubmissionValues } from "@/modules/forms/submission-validation";
import type { FormField } from "@prisma/client";

function field(partial: Partial<FormField> & Pick<FormField, "fieldKey" | "label" | "fieldType">): FormField {
  return {
    id: crypto.randomUUID(),
    formVersionId: crypto.randomUUID(),
    placeholder: null,
    helpText: null,
    isRequired: false,
    defaultValue: null,
    options: null,
    validation: null,
    displayOrder: 0,
    visibilityRules: null,
    createdAt: new Date(),
    ...partial,
  } as FormField;
}

describe("server-side submission validation (SDS Doc 22)", () => {
  it("enforces required fields", () => {
    const fields = [field({ fieldKey: "reason", label: "Reason", fieldType: "TEXT", isRequired: true })];
    const { fieldErrors } = validateSubmissionValues(fields, {}, {});
    expect(fieldErrors.reason).toContain("required");
  });

  it("validates email format", () => {
    const fields = [field({ fieldKey: "manager_email", label: "Manager email", fieldType: "EMAIL" })];
    expect(validateSubmissionValues(fields, { manager_email: "not-an-email" }, {}).fieldErrors.manager_email).toBeDefined();
    const good = validateSubmissionValues(fields, { manager_email: "Boss@Example.COM" }, {});
    expect(good.fieldErrors.manager_email).toBeUndefined();
    expect(good.values.manager_email).toBe("boss@example.com");
  });

  it("validates number ranges from field configuration", () => {
    const fields = [
      field({
        fieldKey: "seats",
        label: "Seats",
        fieldType: "NUMBER",
        validation: { minValue: 1, maxValue: 10 } as never,
      }),
    ];
    expect(validateSubmissionValues(fields, { seats: "0" }, {}).fieldErrors.seats).toBeDefined();
    expect(validateSubmissionValues(fields, { seats: "11" }, {}).fieldErrors.seats).toBeDefined();
    expect(validateSubmissionValues(fields, { seats: "5" }, {}).values.seats).toBe(5);
  });

  it("rejects options not present in the field definition", () => {
    const fields = [
      field({ fieldKey: "office", label: "Office", fieldType: "DROPDOWN", options: ["HQ", "Resort"] as never }),
    ];
    expect(validateSubmissionValues(fields, { office: "Injected" }, {}).fieldErrors.office).toBeDefined();
    expect(validateSubmissionValues(fields, { office: "HQ" }, {}).values.office).toBe("HQ");
  });

  it("validates dates and times", () => {
    const fields = [
      field({ fieldKey: "start", label: "Start", fieldType: "DATE" }),
      field({ fieldKey: "at", label: "At", fieldType: "TIME" }),
    ];
    const bad = validateSubmissionValues(fields, { start: "31-12-2026", at: "25:00" }, {});
    expect(bad.fieldErrors.start).toBeDefined();
    expect(bad.fieldErrors.at).toBeDefined();
    const good = validateSubmissionValues(fields, { start: "2026-12-31", at: "23:45" }, {});
    expect(Object.keys(good.fieldErrors)).toHaveLength(0);
  });

  it("skips hidden fields entirely (visibility rules)", () => {
    const fields = [
      field({ fieldKey: "vpn", label: "VPN needed", fieldType: "YES_NO" }),
      field({
        fieldKey: "vpn_reason",
        label: "VPN reason",
        fieldType: "TEXT",
        isRequired: true,
        visibilityRules: { logic: "AND", conditions: [{ fieldKey: "vpn", operator: "EQUALS", value: "yes" }] } as never,
      }),
    ];
    // Hidden: no error even though required, and value not stored.
    const hidden = validateSubmissionValues(fields, { vpn: "no" }, {});
    expect(hidden.fieldErrors.vpn_reason).toBeUndefined();
    expect("vpn_reason" in hidden.values).toBe(false);
    // Visible: required is enforced.
    const visible = validateSubmissionValues(fields, { vpn: "yes" }, {});
    expect(visible.fieldErrors.vpn_reason).toBeDefined();
  });

  it("validates file uploads for type and size", () => {
    const fields = [
      field({
        fieldKey: "attachment",
        label: "Attachment",
        fieldType: "FILE_UPLOAD",
        validation: { allowedFileTypes: ["pdf"], maxFileSizeMb: 1 } as never,
      }),
    ];
    expect(
      validateSubmissionValues(fields, {}, { attachment: { fileName: "malware.exe", size: 100 } }).fieldErrors.attachment,
    ).toBeDefined();
    expect(
      validateSubmissionValues(fields, {}, { attachment: { fileName: "big.pdf", size: 2 * 1024 * 1024 } }).fieldErrors.attachment,
    ).toBeDefined();
    expect(
      validateSubmissionValues(fields, {}, { attachment: { fileName: "ok.pdf", size: 1024 } }).fieldErrors.attachment,
    ).toBeUndefined();
  });
});
