/**
 * Single source of truth for the asset-handover terms of responsibility, shown
 * on the acknowledgement page and in the generated handover document, and hashed
 * into the acknowledgement evidence.
 *
 * Bump HANDOVER_TERMS_VERSION whenever the wording below changes. The version in
 * force at signing is stored on each handover, so what a given employee agreed
 * to can always be proven even after the terms are later revised.
 */
export const HANDOVER_TERMS_VERSION = "2026-08-3";

/**
 * Build the terms for a handover. The owning company is named explicitly so each
 * company's handovers read correctly, and shared equipment gets an extra clause:
 * it may be held by several people, so each holder is answerable only for the
 * period it was in their care.
 */
export function handoverTerms(companyName: string, includesSharedAsset = false): string {
  const base =
    `The asset/s listed above are the property of ${companyName} and are in my possession for ` +
    `carrying out my office work. I undertake to take care of them to the best possible extent. ` +
    `I accept responsibility for any loss of, or damage to, the asset/s while they are in my ` +
    `possession, other than fair wear and tear, and I understand that the company may recover the ` +
    `cost of such loss or damage from me in accordance with company policy. I am bound to return ` +
    `the specific asset/s when required by the company or at the termination of my employment.`;
  if (!includesSharedAsset) return base;
  return (
    `${base} Asset/s marked as shared are used by more than one employee, and my responsibility ` +
    `applies to the period during which they are in my care.`
  );
}
