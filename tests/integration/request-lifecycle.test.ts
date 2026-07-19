import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

/**
 * Integration test for the critical business workflow (SDS Doc 20 Ch3):
 * organization setup → workflow & form publishing → public submission →
 * approver resolution → approval via engine → implementation → credential
 * delivery → acknowledgement → request completion. Runs against a dedicated
 * PostgreSQL test database.
 */

const TEST_DB_URL = "postgresql://axivo:axivo@localhost:5432/axivo_integration?schema=public";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = TEST_DB_URL;
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SESSION_SECRET = "integration-session-secret-0123456789abcdef0123456789";
process.env.ENCRYPTION_KEY = "integration-encryption-key-0123456789abcdef0123456789";
process.env.TOKEN_SIGNING_KEY = "integration-token-key-0123456789abcdef0123456789abcd";
process.env.STORAGE_PATH = "./storage-integration-test";

// Deferred imports so env is set before module initialization.
let db: typeof import("@/shared/db").db;

const actor = { actorLabel: "integration-test" };

beforeAll(async () => {
  // Recreate the isolated integration database (dev container only), then
  // apply the version-controlled migrations with the production-safe command.
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS axivo_integration WITH (FORCE);" -c "CREATE DATABASE axivo_integration;"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  ({ db } = await import("@/shared/db"));
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

describe("end-to-end request lifecycle", () => {
  it("processes a request from public submission through approvals, implementation and acknowledgement", async () => {
    const orgService = await import("@/modules/organization/service");
    const peopleService = await import("@/modules/people/service");
    const appService = await import("@/modules/applications/service");
    const workflowDefs = await import("@/modules/workflow/definitions");
    const engine = await import("@/modules/workflow/engine");
    const formsService = await import("@/modules/forms/service");
    const requestsService = await import("@/modules/requests/service");
    const credentialsService = await import("@/modules/credentials/service");

    // --- Organization setup (Doc 06) ---
    const company = await orgService.createCompany(actor, {
      name: "Test Resort", code: "TR1", description: undefined, timezone: "UTC", currency: "USD",
    });
    const department = await orgService.createDepartment(actor, {
      companyId: company.id, name: "Front Office", description: undefined, headPersonIds: [],
    });
    const position = await db.position.create({
      data: { companyId: company.id, name: "Agent" },
    });

    const hodRole = await db.approvalRole.create({
      data: { name: "Department Head", key: "DEPARTMENT_HEAD", isSystem: true },
    });
    const itImplRole = await db.approvalRole.create({
      data: { name: "IT Implementation", key: "IT_IMPLEMENTATION", isSystem: true },
    });

    // --- People (Doc 07) ---
    const hod = await peopleService.createPerson(actor, {
      companyId: company.id, departmentId: department.id, positionId: undefined, locationId: undefined,
      employeeId: "E-100", firstName: "Head", lastName: "OfDept", email: "hod@test.local",
      personalEmail: undefined, phone: undefined, extension: undefined, employmentStatus: "ACTIVE",
    });
    const employee = await peopleService.createPerson(actor, {
      companyId: company.id, departmentId: department.id, positionId: undefined, locationId: undefined,
      employeeId: "E-200", firstName: "New", lastName: "Employee", email: "employee@test.local",
      personalEmail: undefined, phone: undefined, extension: undefined, employmentStatus: "ACTIVE",
    });
    const itPerson = await peopleService.createPerson(actor, {
      companyId: company.id, departmentId: department.id, positionId: undefined, locationId: undefined,
      employeeId: "E-300", firstName: "IT", lastName: "Support", email: "it@test.local",
      personalEmail: undefined, phone: undefined, extension: undefined, employmentStatus: "ACTIVE",
    });

    await orgService.assignDepartmentHead(actor, { departmentId: department.id, personId: hod.id });
    await orgService.assignApprovalRole(actor, {
      companyId: company.id, approvalRoleId: itImplRole.id, personId: itPerson.id,
    });

    // --- Application (Doc 08) ---
    const application = await appService.createApplication(actor, {
      companyId: company.id, name: "Email System", description: undefined, category: undefined,
      loginUrl: undefined, icon: undefined, allowMultipleAssignments: false, requiresLicense: false,
    });

    // --- Workflow: HOD approval → IT implementation (Doc 13) ---
    const workflow = await workflowDefs.createWorkflow(actor, {
      companyId: company.id,
      name: "Standard Access",
      description: undefined,
      isDefault: true,
      steps: [
        { stepName: "Department Head Approval", stepType: "APPROVAL", approvalRoleId: hodRole.id, approvalRule: "ANY", allowDelegation: true, commentsRequired: false },
        { stepName: "IT Implementation", stepType: "IT_IMPLEMENTATION", approvalRoleId: itImplRole.id, approvalRule: "ANY", allowDelegation: false, commentsRequired: false },
      ],
    });

    // --- Form (Doc 22): standard request types are auto-created per company ---
    const requestType = await db.requestType.findFirstOrThrow({
      where: { companyId: company.id, kind: "APPLICATION_ACCESS" },
    });
    const form = await formsService.createForm(actor, {
      companyId: company.id,
      requestTypeId: requestType.id,
      workflowId: workflow.id,
      name: "IT Access Request",
      description: undefined,
      confirmationMessage: "Thank you!",
      allowedAssetCategoryIds: [],
      fields: [
        { fieldKey: "justification", label: "Justification", fieldType: "TEXT", isRequired: true, placeholder: undefined, helpText: undefined, defaultValue: undefined, options: undefined, validation: undefined, visibilityRules: undefined },
      ],
    });
    await formsService.publishForm(actor, form.id);
    const published = await formsService.getPublicForm(
      (await db.form.findUniqueOrThrow({ where: { id: form.id } })).slug,
    );
    expect(published?.currentVersion?.publishedAt).toBeTruthy();

    // --- Public submission (Doc 09): matches people by email ---
    const submission = await requestsService.submitPublicRequest(
      { ...actor, ipAddress: "10.0.0.1" },
      {
        slug: published!.slug,
        requesterName: "Requester Person",
        requesterEmail: "requester@test.local",
        requesterEmployeeId: "E-900",
        requesterDepartmentId: department.id,
        requesterPositionId: position.id,
        requestedForName: "New Employee",
        requestedForEmail: "employee@test.local",
        requestedForEmployeeId: "E-200",
        requestedForDepartmentId: department.id,
        requestedForPositionId: position.id,
        fieldValues: { justification: "New hire" },
        items: [{ itemType: "APPLICATION", applicationId: application.id, applicationRoleId: undefined, assetCategoryId: undefined, description: undefined }],
        website: "",
      },
    );
    expect(submission.requestNumber).toMatch(/^REQ-\d{4}-\d{6}$/);

    const request = await db.request.findUniqueOrThrow({
      where: { id: submission.requestId },
      include: { items: { include: { workflowInstances: { include: { stepInstances: { include: { assignments: true } } } } } } },
    });
    expect(request.requestedForPersonId).toBe(employee.id);
    expect(request.requestedForDepartmentId).toBe(department.id);
    expect(request.items).toHaveLength(1);

    const instance = request.items[0]!.workflowInstances[0]!;
    const firstStep = instance.stepInstances.find((step) => step.stepOrder === 1)!;
    // Department Head resolved from the Requested For person's department (Doc 06 Ch3).
    expect(firstStep.status).toBe("ACTIVE");
    expect(firstStep.assignments.map((assignment) => assignment.personId)).toContain(hod.id);

    // An approval token was issued for the HOD.
    const token = await db.secureToken.findFirst({
      where: { purpose: "APPROVAL_ACTION", targetId: firstStep.id },
    });
    expect(token).toBeTruthy();

    // --- HOD approves (Doc 09 Ch6) ---
    await engine.applyApprovalAction(actor, {
      stepInstanceId: firstStep.id,
      actingPersonId: hod.id,
      action: "APPROVED",
      viaSecureToken: true,
    });

    // Item moves to implementation pending (final approval reached).
    const afterApproval = await db.requestItem.findUniqueOrThrow({ where: { id: request.items[0]!.id } });
    expect(afterApproval.status).toBe("IMPLEMENTATION_PENDING");
    const requestAfterApproval = await db.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(requestAfterApproval.status).toBe("IMPLEMENTATION_PENDING");

    // --- IT implementation with credential delivery (Doc 09 Ch8 / Doc 08 Ch6) ---
    const itUser = {
      userId: crypto.randomUUID(),
      personId: itPerson.id,
      username: "it.support",
      displayName: "IT Support",
      email: itPerson.email,
      companyId: company.id,
      systemRoleId: crypto.randomUUID(),
      systemRoleKey: "IT_SUPPORT",
      systemRoleName: "IT Support",
      permissions: new Set(["requests.implement"]) as never,
      sessionId: crypto.randomUUID(),
    };
    await requestsService.completeImplementation(actor, itUser as never, {
      requestItemId: request.items[0]!.id,
      username: "new.employee",
      temporaryPassword: "Temp-Pass-123!",
      credentialFields: [],
      licenseId: undefined,
      assetIds: [],
      notes: "Account created",
    });

    // Assignment created; delivery pending acknowledgement; item IMPLEMENTED.
    const assignment = await db.applicationAssignment.findFirstOrThrow({
      where: { personId: employee.id, applicationId: application.id },
    });
    expect(assignment.status).toBe("ACTIVE");
    expect(assignment.username).toBe("new.employee");

    const delivery = await db.credentialDelivery.findFirstOrThrow({
      where: { personId: employee.id, applicationId: application.id },
    });
    expect(delivery.secretCiphertext).toBeTruthy();
    const itemAfterImplementation = await db.requestItem.findUniqueOrThrow({ where: { id: request.items[0]!.id } });
    expect(itemAfterImplementation.status).toBe("IMPLEMENTED");

    // --- Employee acknowledges credentials: secret revealed exactly once ---
    const revealed = await credentialsService.acknowledgeAndReveal(actor, delivery.id);
    expect(revealed.temporarySecret).toBe("Temp-Pass-123!");
    const afterAck = await db.credentialDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(afterAck.status).toBe("ACKNOWLEDGED");
    expect(afterAck.secretCiphertext).toBeNull();
    const secondView = await credentialsService.acknowledgeAndReveal(actor, delivery.id);
    expect(secondView.temporarySecret).toBeNull();

    // --- Completion rules (Doc 09 Ch4): item completes after acknowledgement ---
    await requestsService.maybeCompleteItem(actor, request.items[0]!.id);
    const finalItem = await db.requestItem.findUniqueOrThrow({ where: { id: request.items[0]!.id } });
    expect(finalItem.status).toBe("COMPLETED");
    const finalRequest = await db.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(finalRequest.status).toBe("COMPLETED");
    expect(finalRequest.completedAt).toBeTruthy();

    // Immutable audit timeline exists (Doc 09 Ch9).
    const timeline = await requestsService.getRequestTimeline(request.id);
    expect(timeline.length).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it("rejection ends only the affected item; comments are mandatory", async () => {
    const engine = await import("@/modules/workflow/engine");
    // Build a second request with two items via direct service calls.
    const requestsService = await import("@/modules/requests/service");
    const form = await db.form.findFirstOrThrow({ where: { status: "PUBLISHED" } });
    const application = await db.application.findFirstOrThrow();
    const hod = await db.person.findFirstOrThrow({ where: { employeeId: "E-100" } });

    const department = await db.department.findFirstOrThrow({ where: { name: "Front Office" } });
    const position = await db.position.findFirstOrThrow({ where: { name: "Agent" } });
    const submission = await requestsService.submitPublicRequest(
      { ...actor, ipAddress: "10.0.0.2" },
      {
        slug: form.slug,
        requesterName: "Requester",
        requesterEmail: "requester2@test.local",
        requesterEmployeeId: "E-901",
        requesterDepartmentId: department.id,
        requesterPositionId: position.id,
        requestedForName: "New Employee",
        requestedForEmail: "employee@test.local",
        requestedForEmployeeId: "E-200",
        requestedForDepartmentId: department.id,
        requestedForPositionId: position.id,
        fieldValues: { justification: "Two items" },
        items: [
          { itemType: "APPLICATION", applicationId: application.id, applicationRoleId: undefined, assetCategoryId: undefined, description: undefined },
          { itemType: "GENERAL", applicationId: undefined, applicationRoleId: undefined, assetCategoryId: undefined, description: "Other request" },
        ],
        website: "",
      },
    );
    const request = await db.request.findUniqueOrThrow({
      where: { id: submission.requestId },
      include: { items: { include: { workflowInstances: { include: { stepInstances: true } } } } },
    });
    const [firstItem, secondItem] = request.items;
    const firstActive = firstItem!.workflowInstances[0]!.stepInstances.find((step) => step.status === "ACTIVE")!;

    // Comments mandatory for rejection (Doc 09 Ch6).
    await expect(
      engine.applyApprovalAction(actor, {
        stepInstanceId: firstActive.id,
        actingPersonId: hod.id,
        action: "REJECTED",
        viaSecureToken: false,
      }),
    ).rejects.toThrow(/Comments are required/);

    await engine.applyApprovalAction(actor, {
      stepInstanceId: firstActive.id,
      actingPersonId: hod.id,
      action: "REJECTED",
      comments: "Not needed",
      viaSecureToken: false,
    });

    const afterRejection = await db.request.findUniqueOrThrow({
      where: { id: request.id },
      include: { items: true },
    });
    const rejected = afterRejection.items.find((item) => item.id === firstItem!.id)!;
    const untouched = afterRejection.items.find((item) => item.id === secondItem!.id)!;
    expect(rejected.status).toBe("REJECTED");
    // The other item continues independently (Doc 09 Ch6).
    expect(untouched.status).toBe("PENDING_APPROVAL");
  }, 60_000);

  it("prevents license over-allocation atomically (Doc 10 Ch4)", async () => {
    const licensesService = await import("@/modules/licenses/service");
    const company = await db.company.findFirstOrThrow({ where: { code: "TR1" } });
    const application = await db.application.findFirstOrThrow();
    const [personA, personB] = await db.person.findMany({ where: { companyId: company.id }, take: 2 });

    const license = await licensesService.createLicense(actor, {
      companyId: company.id, applicationId: application.id, name: "Single Seat License",
      licenseType: "PERPETUAL", vendor: undefined, licenseKey: undefined, contractId: undefined, notes: undefined,
    });
    await licensesService.recordPurchase(actor, {
      licenseId: license.id, purchaseType: "NEW_PURCHASE", quantity: 1,
      purchaseDate: new Date(), startDate: undefined, expiryDate: undefined,
      price: undefined, currency: undefined, supplier: undefined, purchaseReference: undefined, notes: undefined,
    });

    await licensesService.assignLicense(actor, { licenseId: license.id, personId: personA!.id, notes: undefined });
    await expect(
      licensesService.assignLicense(actor, { licenseId: license.id, personId: personB!.id, notes: undefined }),
    ).rejects.toThrow(/No available seats/);

    // Removal returns the seat to the pool.
    const assignment = await db.licenseAssignment.findFirstOrThrow({ where: { licenseId: license.id, status: "ACTIVE" } });
    await licensesService.removeLicenseAssignment(actor, assignment.id);
    const availability = await licensesService.getLicenseAvailability(license.id);
    expect(availability.available).toBe(1);
  }, 60_000);

  it("enforces single active asset assignment and lifecycle rules (Doc 11)", async () => {
    const assetsService = await import("@/modules/assets/service");
    const company = await db.company.findFirstOrThrow({ where: { code: "TR1" } });
    const [personA, personB] = await db.person.findMany({ where: { companyId: company.id }, take: 2 });

    const category = await assetsService.createAssetCategory(actor, {
      companyId: company.id, name: "Laptop", description: undefined,
      requireHandoverAcceptance: false, requireClearanceRecovery: true,
    });
    const asset = await assetsService.createAsset(actor, {
      companyId: company.id, categoryId: category.id, name: "Test Laptop 1", assetTag: "LT-0001",
      serialNumber: undefined, manufacturer: undefined, model: undefined, locationId: undefined,
      supplier: undefined, purchaseDate: undefined, purchasePrice: undefined, currency: undefined,
      warrantyExpiry: undefined, notes: undefined,
    });

    const { assignment } = await assetsService.assignAsset(actor, {
      assetId: asset.id, personId: personA!.id, notes: undefined,
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe("ASSIGNED");

    // Second active assignment prohibited.
    await expect(
      assetsService.assignAsset(actor, { assetId: asset.id, personId: personB!.id, notes: undefined }),
    ).rejects.toThrow();

    // Return restores availability.
    await assetsService.returnAsset(actor, assignment.id);
    expect((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe("AVAILABLE");

    // Discard requires the disposal flow, not a direct status change.
    await expect(assetsService.setAssetStatus(actor, asset.id, "DISCARDED")).rejects.toThrow(/disposal process/);
  }, 60_000);

  it("issues, validates and consumes single-use secure tokens (Doc 05 Ch8)", async () => {
    const tokens = await import("@/shared/tokens/secure-tokens");
    const { token, record } = await tokens.issueToken({
      purpose: "REQUEST_VIEW",
      email: "someone@test.local",
      targetType: "request",
      targetId: crypto.randomUUID(),
    });

    const valid = await tokens.validateToken(token, "REQUEST_VIEW");
    expect(valid.valid).toBe(true);

    // Wrong purpose rejected.
    const wrongPurpose = await tokens.validateToken(token, "APPROVAL_ACTION");
    expect(wrongPurpose.valid).toBe(false);

    // Tampered signature rejected.
    const [random] = token.split(".");
    const forged = await tokens.validateToken(`${random}.forgedsignature`, "REQUEST_VIEW");
    expect(forged.valid).toBe(false);

    // Consumption makes it single-use.
    await tokens.consumeToken(record.id);
    const consumed = await tokens.validateToken(token, "REQUEST_VIEW");
    expect(consumed.valid).toBe(false);
    if (!consumed.valid) expect(consumed.reason).toBe("consumed");
  }, 60_000);

  it("temporarily throttles failed logins and resets after success (Doc 05 Ch7)", async () => {
    const throttle = await import("@/shared/auth/throttle");
    const ip = "192.0.2.10";
    const username = "throttle.target";

    expect((await throttle.checkLoginThrottle(ip, username)).blocked).toBe(false);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await throttle.recordLoginFailure(ip, username);
    }
    const blocked = await throttle.checkLoginThrottle(ip, username);
    expect(blocked.blocked).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // Successful login resets counters (no permanent lockout).
    await throttle.resetLoginThrottle(ip, username);
    expect((await throttle.checkLoginThrottle(ip, username)).blocked).toBe(false);
  }, 60_000);
});
