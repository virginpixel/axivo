/**
 * Application error taxonomy (SDS Doc 02 Ch6): Validation, Business Rule,
 * Authorization, System. Internal details are never sent to clients; server
 * actions convert these into safe, human-readable responses.
 */

export type ErrorKind =
  | "validation"
  | "business_rule"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "system";

export class AppError extends Error {
  readonly kind: ErrorKind;
  /** Field-level validation messages, keyed by field name. */
  readonly fieldErrors?: Record<string, string>;

  constructor(kind: ErrorKind, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please correct the highlighted fields.", fieldErrors?: Record<string, string>) {
    super("validation", message, fieldErrors);
    this.name = "ValidationError";
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super("business_rule", message);
    this.name = "BusinessRuleError";
  }
}

export class AuthenticationError extends AppError {
  // Generic message by design (SDS Doc 05 Ch2): never reveal which part failed.
  constructor(message = "Invalid username or password.") {
    super("authentication", message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("authorization", message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super("not_found", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "This record was changed by someone else. Please refresh and try again.") {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many attempts. Please try again later.") {
    super("rate_limited", message);
    this.name = "RateLimitedError";
  }
}

/** Standard result envelope returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: ErrorKind; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Convert any thrown error into a safe ActionResult. AppErrors pass their
 * message through; unexpected errors are logged and replaced with a generic
 * message so implementation details never reach the client (Doc 05 Ch6).
 */
export function toActionError<T>(error: unknown): ActionResult<T> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, kind: error.kind, fieldErrors: error.fieldErrors };
  }
  console.error("[axivo] Unhandled error:", error);
  return { ok: false, error: "An unexpected error occurred. Please try again.", kind: "system" };
}
