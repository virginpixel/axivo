/**
 * Single source of truth for the asset-handover terms of responsibility, shown
 * on the acknowledgement page and in the generated handover document, and hashed
 * into the acknowledgement evidence.
 *
 * Bump HANDOVER_TERMS_VERSION whenever the wording below changes. The version in
 * force at signing is stored on each handover, so what a given employee agreed
 * to can always be proven even after the terms are later revised.
 */
export const HANDOVER_TERMS_VERSION = "2026-10-21";

/**
 * Build the terms for a handover. The owning company is named explicitly so each
 * company's handovers read correctly, and shared equipment gets an extra clause:
 * it may be held by several people, so each holder is answerable only for the
 * period it was in their care. Department-held equipment gets its own clause:
 * the signer is the department head, accepting it on the department's behalf
 * rather than for their personal use.
 */
export function handoverTerms(
  companyName: string,
  includesSharedAsset = false,
  includesDepartmentAsset = false,
): string {
  const base =
    `The asset/s listed above are the property of ${companyName} and are in my possession for ` +
    `carrying out my office work. I undertake to take care of them to the best possible extent. ` +
    `I accept responsibility for any loss of, or damage to, the asset/s while they are in my ` +
    `possession, other than fair wear and tear, and I understand that the company may recover the ` +
    `cost of such loss or damage from me in accordance with company policy. I am bound to return ` +
    `the specific asset/s when required by the company or at the termination of my employment.`;
  const clauses = [base];
  if (includesSharedAsset) {
    clauses.push(
      `Asset/s marked as shared are used by more than one employee, and my responsibility ` +
        `applies to the period during which they are in my care.`,
    );
  }
  if (includesDepartmentAsset) {
    clauses.push(
      `Asset/s shown as held by a department are issued to that department rather than to me ` +
        `personally. As its head I accept them on the department's behalf, and I am responsible ` +
        `for their safekeeping and proper use within the department and for their return when ` +
        `required by the company.`,
    );
  }
  return clauses.join(" ");
}
