import { describe, it, expect } from "vitest";
import { handoverTerms } from "@/modules/assets/handover-terms";

/**
 * The terms are hashed into each acknowledgement as evidence, so the wording is
 * worth asserting rather than eyeballing: the employee text must keep saying
 * what it has always said, and a third party must never be handed an
 * undertaking about their "office work" or "termination of employment" with a
 * company that does not employ them.
 */
describe("asset handover terms of responsibility", () => {
  const company = "Crossroads Maldives";

  it("binds an employee for the term of their employment", () => {
    const terms = handoverTerms({ companyName: company });
    expect(terms).toContain(`property of ${company}`);
    expect(terms).toContain("carrying out my office work");
    expect(terms).toContain("at the termination of my employment");
    expect(terms).not.toContain("third party");
  });

  it("binds a third party's employer instead of their employment", () => {
    const terms = handoverTerms({
      companyName: company,
      signerIsThirdParty: true,
      signerCompanyName: "Shop 12",
    });
    expect(terms).toContain(`property of ${company}`);
    expect(terms).toContain("for use by Shop 12");
    expect(terms).toContain(`I am not an employee of ${company}`);
    expect(terms).toContain("I accept the asset/s on behalf of Shop 12");
    expect(terms).toContain("stops operating at the property");
    // Neither of these applies to somebody we do not employ.
    expect(terms).not.toContain("office work");
    expect(terms).not.toContain("termination of my employment");
  });

  it("keeps the outlet responsible when its own staff change", () => {
    const terms = handoverTerms({
      companyName: company,
      signerIsThirdParty: true,
      signerCompanyName: "Shop 12",
    });
    expect(terms).toContain("If somebody else at Shop 12 takes over the use of the asset/s");
    expect(terms).toContain("Shop 12 remains responsible for them");
    expect(terms).toContain("inform the IT department");
  });

  it("still reads properly when the employer was never recorded", () => {
    const terms = handoverTerms({ companyName: company, signerIsThirdParty: true });
    expect(terms).toContain("for use by the business I represent");
    expect(terms).not.toContain("null");
    expect(terms).not.toContain("undefined");
  });

  it("adds the shared-equipment clause only when shared assets are listed", () => {
    expect(handoverTerms({ companyName: company, includesSharedAsset: true })).toContain(
      "used by more than one person",
    );
    expect(handoverTerms({ companyName: company })).not.toContain("used by more than one person");
  });

  it("adds the department clause for equipment held by a department", () => {
    const terms = handoverTerms({ companyName: company, includesDepartmentAsset: true });
    expect(terms).toContain("issued to that department rather than to me personally");
    expect(handoverTerms({ companyName: company })).not.toContain("issued to that department");
  });
});
