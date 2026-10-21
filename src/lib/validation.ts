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

/**
 * A bounded, sanitised list of symbols.
 *
 * An unbounded array is an easy way to make the server do arbitrary work, so
 * the count and each entry's length/shape are enforced here rather than left to
 * the caller.
 */
export function requireBoundedSymbolArray(
  value: unknown,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {}
): string[] {
  const maxItems = options.maxItems ?? 25;
  const maxLength = options.maxLength ?? 20;
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array of symbols.`);
  }
  if (value.length === 0) {
    throw new ValidationError(`${field} must contain at least one symbol.`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${field} may contain at most ${maxItems} symbols.`);
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new ValidationError(`${field}[${index}] must be a string.`);
    }
    const symbol = item.trim().toUpperCase();
    if (symbol === '') {
      throw new ValidationError(`${field}[${index}] must not be empty.`);
    }
    if (symbol.length > maxLength) {
      throw new ValidationError(`${field}[${index}] is longer than ${maxLength} characters.`);
    }
    if (!/^[A-Z0-9][A-Z0-9.&-]*$/.test(symbol)) {
      throw new ValidationError(`${field}[${index}] contains characters that are not valid in a symbol.`);
    }
    if (seen.has(symbol)) {
      throw new ValidationError(`${field}[${index}] duplicates ${symbol}.`);
    }
    seen.add(symbol);
    return symbol;
  });
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
