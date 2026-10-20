/**
 * Small, dependency-free validation helpers.
 *
 * Agents and engines must reject bad input explicitly instead of silently
 * substituting defaults: a missing number is not the same as a plausible one.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function requireFiniteNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; exclusiveMin?: boolean } = {}
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`${field} must be a finite number.`);
  }
  const { min, max, exclusiveMin } = options;
  if (min !== undefined) {
    if (exclusiveMin ? n <= min : n < min) {
      throw new ValidationError(`${field} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
    }
  }
  if (max !== undefined && n > max) {
    throw new ValidationError(`${field} must be at most ${max}.`);
  }
  return n;
}

export function requirePositiveInteger(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ValidationError(`${field} must be a positive whole number.`);
  }
  return n;
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty array of symbols.`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new ValidationError(`${field}[${index}] must be a non-empty symbol string.`);
    }
    return item.trim().toUpperCase();
  });
}

/** True when `value` is a usable, finite, strictly positive price. */
export function isPositiveFinite(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}
