/**
 * Errors that carry an HTTP status and a machine-readable code.
 *
 * Route handlers map these onto responses instead of guessing. Anything else
 * that escapes is treated as an internal error and its message is NOT echoed to
 * the client (it could contain SQL, file paths or partial secrets).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, statusCode = 400, code = 'REQUEST_REJECTED', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** The same idempotency key was reused with a different request body. */
export class IdempotencyConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'IDEMPOTENCY_CONFLICT');
    this.name = 'IdempotencyConflictError';
  }
}

/** The request is still in flight (or crashed mid-flight) for this key. */
export class IdempotencyInProgressError extends AppError {
  constructor(message: string) {
    super(message, 409, 'IDEMPOTENCY_IN_PROGRESS');
    this.name = 'IdempotencyInProgressError';
  }
}

export function errorStatus(err: unknown, fallback = 400): number {
  if (err instanceof AppError) return err.statusCode;
  return fallback;
}
