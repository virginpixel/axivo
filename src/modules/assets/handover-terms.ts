/**
 * Single source of truth for the asset-handover terms of responsibility, shown
 * on the acknowledgement page and in the generated handover document, and hashed
 * into the acknowledgement evidence.
 *
 * Bump HANDOVER_TERMS_VERSION whenever the wording below changes. The version in
 * force at signing is stored on each handover, so what a given employee agreed
 * to can always be proven even after the terms are later revised.
 */
export const HANDOVER_TERMS_VERSION = "2026-11-15";

export interface HandoverTermsOptions {
  /** The company that owns the equipment. */
  companyName: string;
  /** Shared equipment is held by several people, each for their own period. */
  includesSharedAsset?: boolean;
  /** Department-held equipment is signed for by the head, not for personal use. */
  includesDepartmentAsset?: boolean;
  /** The signer is a tenant or contractor, not an employee. */
  signerIsThirdParty?: boolean;
  /** The third-party signer's own employer, named in their clauses. */
  signerCompanyName?: string | null;
}

/**
 * Build the terms for a handover. The owning company is named explicitly so each
 * company's handovers read correctly, and shared equipment gets an extra clause:
 * it may be held by several people, so each holder is answerable only for the
 * period it was in their care. Department-held equipment gets its own clause:
 * the signer is the department head, accepting it on the department's behalf
 * rather than for their personal use.
 *
 * A third party signs under different terms entirely. The employee wording ties
 * the undertaking to office work and to the end of employment, neither of which
 * applies to a tenant - and a document that says it does is worth less, not
 * more, if it is ever relied on. Their version binds the business they work for
 * instead of them personally, which is what makes it hold when their staff
 * change without us being told.
 */
export function handoverTerms(options: HandoverTermsOptions): string {
  const {
    companyName,
    includesSharedAsset = false,
    includesDepartmentAsset = false,
    signerIsThirdParty = false,
    signerCompanyName,
  } = options;
  // Named so the clauses read properly even if the employer was never recorded.
  const employer = signerCompanyName?.trim() || "the business I represent";

  const base = signerIsThirdParty
    ? `The asset/s listed above are the property of ${companyName} and have been handed to me ` +
      `for use by ${employer}. I am not an employee of ${companyName}. I accept the asset/s on ` +
      `behalf of ${employer} and I undertake to take care of them to the best possible extent. ` +
      `I accept responsibility for any loss of, or damage to, the asset/s while they are in our ` +
      `possession, other than fair wear and tear, and I understand that ${companyName} may ` +
      `recover the cost of such loss or damage. The asset/s remain the property of ` +
      `${companyName} at all times, and I am bound to return the specific asset/s when required ` +
      `by ${companyName} or when ${employer} stops operating at the property, whichever comes ` +
      `first.`
    : `The asset/s listed above are the property of ${companyName} and are in my possession for ` +
      `carrying out my office work. I undertake to take care of them to the best possible extent. ` +
      `I accept responsibility for any loss of, or damage to, the asset/s while they are in my ` +
      `possession, other than fair wear and tear, and I understand that the company may recover the ` +
      `cost of such loss or damage from me in accordance with company policy. I am bound to return ` +
      `the specific asset/s when required by the company or at the termination of my employment.`;

  const clauses = [base];
  if (signerIsThirdParty) {
    // The point of the whole arrangement: we do not see their hiring and
    // leaving, so responsibility has to sit with the business, not the person
    // who happened to be at the counter on the day.
    clauses.push(
      `If somebody else at ${employer} takes over the use of the asset/s, ${employer} remains ` +
        `responsible for them, and I will inform the IT department of the change.`,
    );
  }
  if (includesSharedAsset) {
    clauses.push(
      `Asset/s marked as shared are used by more than one person, and my responsibility ` +
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
