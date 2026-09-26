/**
 * Typed, user-safe errors.
 *
 * Every error that can reach a client is constructed here. The rules:
 *
 *  - `message` is written for the person using the product, not for a developer.
 *  - Internal detail (stack, Convex error text, document ids, storage ids) is
 *    never placed in `message`.
 *  - `code` lets the UI react precisely (re-enable a button, show a retry
 *    countdown) without string-matching on prose.
 *
 * Anything thrown that is *not* an `AppError` is treated as a bug and replaced
 * with a generic message by `toSafeError`, so a future regression in a Convex
 * internal cannot start leaking to users.
 */

export type AppErrorCode =
  | "unauthenticated"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "invalid_transition"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media"
  | "storage_missing"
  | "precondition_failed"
  | "internal";

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Seconds the client should wait, for `rate_limited`. */
  readonly retryAfter?: number;

  constructor(code: AppErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const err = {
  unauthenticated: (m = "Sign in to continue") =>
    new AppError("unauthenticated", m),
  unauthorized: (m = "Not authorized") => new AppError("unauthorized", m),
  forbidden: (m = "Not authorized") => new AppError("forbidden", m),
  notFound: (m = "Not found") => new AppError("not_found", m),
  invalid: (m: string) => new AppError("invalid_input", m),
  conflict: (m: string) => new AppError("conflict", m),
  transition: (m: string) => new AppError("invalid_transition", m),
  tooLarge: (m: string) => new AppError("payload_too_large", m),
  unsupportedMedia: (m: string) => new AppError("unsupported_media", m),
  storageMissing: (m: string) => new AppError("storage_missing", m),
  precondition: (m: string) => new AppError("precondition_failed", m),
  internal: (m = "Something went wrong. Please try again.") =>
    new AppError("internal", m),
};

/**
 * Convex reports these for `v.id()` / `v.number()` violations. They are client
 * bugs (or tampered requests), and their default text names internal argument
 * paths, so they are rewritten before they leave the server.
 */
function isConvexArgumentError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === "ArgumentValidationError" ||
    e.name === "UntrustedValueError" ||
    /ArgumentValidationError|Validator/i.test(e.message)
  );
}

export function toSafeError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (isConvexArgumentError(e)) {
    return err.invalid("That request was malformed. Reload the page and try again.");
  }
  // Deliberately drops the original message: it can contain document ids,
  // storage paths or driver text.
  return err.internal();
}
