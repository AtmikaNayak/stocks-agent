import { createHash, randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import db from '../db';

/**
 * Idempotency for financial mutations.
 *
 * Scope and retention, stated precisely:
 *  - Scope: a key is unique **per (user, operation)**. The same string used by
 *    two different users, or for two different operations (e.g. `order` vs
 *    `proposal_approve`), is a different key and never collides.
 *  - Binding: the key is bound to a SHA-256 hash of the normalised request
 *    payload. Reusing a key with a *different* payload is rejected (409)
 *    instead of silently returning the first result.
 *  - Replay: a completed key returns the stored response body and status code
 *    and performs no new writes.
 *  - Retention: rows expire 24 hours after creation. An expired row is
 *    replaced by a fresh claim, so a key can be reused the next day. Expired
 *    rows are swept opportunistically on claim and by the worker.
 *  - In-flight: a key claimed but not yet completed (e.g. a crashed request)
 *    returns 409 rather than executing a second time. It is never treated as
 *    "safe to retry", because a non-idempotent side effect may have occurred.
 *
 * A randomly generated database row id is NOT used as the idempotency key:
 * that would provide uniqueness but no duplicate suppression.
 */

export const IDEMPOTENCY_RETENTION_HOURS = 24;
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** 8–200 chars of a conservative alphabet. Short keys are guessable, long ones are abusive. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export type IdempotencyState = 'CLAIMED' | 'REPLAY' | 'CONFLICT' | 'IN_PROGRESS';

export interface IdempotencyClaim {
  state: IdempotencyState;
  /** Stored response for a REPLAY. */
  response?: unknown;
  statusCode?: number;
}

/** Deterministic JSON so two logically identical payloads hash the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * Validates a caller-supplied key. Returns null when the value is unusable, so
 * the caller can decide between rejecting the request or generating a key.
 */
export function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!KEY_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/** A server-generated key. Only used when the caller supplied none. */
export function generateIdempotencyKey(prefix = 'auto'): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(12).toString('hex')}`;
}

function expiryIso(nowMs: number): string {
  return new Date(nowMs + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
}

interface IdempotencyRow {
  id: string;
  request_hash: string;
  status: string;
  response_json: string | null;
  status_code: number | null;
  expires_at: string;
}

/**
 * Claims a key inside the caller's write transaction.
 *
 * Must be called inside the same `writeTransaction` as the financial writes so
 * the claim and the effects commit or roll back together — a crash cannot leave
 * "key marked complete but nothing executed", nor "executed but key free".
 */
export function claimIdempotencyKey(params: {
  database: Database.Database;
  userId: string;
  scope: string;
  key: string;
  requestHash: string;
  nowMs?: number;
}): IdempotencyClaim {
  const { database, userId, scope, key, requestHash } = params;
  const nowMs = params.nowMs ?? Date.now();

  const existing = database
    .prepare(
      'SELECT id, request_hash, status, response_json, status_code, expires_at FROM idempotency_keys WHERE user_id = ? AND scope = ? AND id = ?'
    )
    .get(userId, scope, key) as IdempotencyRow | undefined;

  if (existing) {
    const expiresMs = Date.parse(existing.expires_at);
    const expired = !Number.isFinite(expiresMs) || expiresMs <= nowMs;

    if (!expired) {
      if (existing.request_hash !== requestHash) {
        return { state: 'CONFLICT' };
      }
      if (existing.status === 'COMPLETED') {
        let parsed: unknown = null;
        try {
          parsed = existing.response_json ? JSON.parse(existing.response_json) : null;
        } catch {
          parsed = null;
        }
        return { state: 'REPLAY', response: parsed, statusCode: existing.status_code ?? 200 };
      }
      // Claimed but never completed: the original request may have partially
      // executed. Never run the mutation a second time.
      return { state: 'IN_PROGRESS' };
    }

    // Expired: release the key so it can be reused after the retention window.
    database.prepare('DELETE FROM idempotency_keys WHERE id = ? AND user_id = ?').run(key, userId);
  }

  database
    .prepare(
      `INSERT INTO idempotency_keys (id, user_id, scope, request_hash, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', datetime('now'), ?)`
    )
    .run(key, userId, scope, requestHash, expiryIso(nowMs));

  return { state: 'CLAIMED' };
}

/** Marks a claimed key complete with the response a retry should replay. */
export function completeIdempotencyKey(params: {
  database: Database.Database;
  userId: string;
  scope: string;
  key: string;
  response: unknown;
  statusCode: number;
  resourceId?: string | null;
}): void {
  const { database, userId, scope, key, response, statusCode, resourceId } = params;
  database
    .prepare(
      `UPDATE idempotency_keys
       SET status = 'COMPLETED', response_json = ?, status_code = ?, resource_id = ?
       WHERE user_id = ? AND scope = ? AND id = ?`
    )
    .run(JSON.stringify(response ?? null), statusCode, resourceId ?? null, userId, scope, key);
}

/** Opportunistic cleanup of expired rows. Safe to call at any time. */
export function sweepExpiredIdempotencyKeys(nowMs: number = Date.now()): number {
  const result = db.execute('DELETE FROM idempotency_keys WHERE expires_at <= ?', [
    new Date(nowMs).toISOString()
  ]);
  return result.changes;
}
