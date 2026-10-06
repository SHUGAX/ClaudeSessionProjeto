import { logger } from "./logger";

/**
 * Application error with a stable, user-safe code. Messages shown to users are
 * resolved from the code via i18n; internal details are only logged.
 */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message?: string,
    public readonly status = statusFor(code),
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "rate_limited"
  | "limit_reached"
  | "organization_suspended"
  | "unsupported_file"
  | "file_too_large"
  | "storage_error"
  | "ai_error"
  | "internal";

function statusFor(code: AppErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
    case "organization_suspended":
      return 403;
    case "not_found":
      return 404;
    case "invalid_input":
    case "unsupported_file":
      return 400;
    case "file_too_large":
      return 413;
    case "conflict":
      return 409;
    case "rate_limited":
    case "limit_reached":
      return 429;
    default:
      return 500;
  }
}

/**
 * Central hook for unexpected errors. Integrate Sentry (or similar) here later;
 * call sites should not depend on a specific vendor.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  logger.error("unexpected_error", { error, ...context });
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  reportError(error);
  return new AppError("internal");
}
