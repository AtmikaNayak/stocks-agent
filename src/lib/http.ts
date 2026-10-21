import { NextResponse } from 'next/server';
import { AppError } from './errors';

/**
 * Shared request/response plumbing for API routes.
 *
 * Route modules may only export HTTP method handlers and the documented Next.js
 * route config, so every helper lives here rather than in `route.ts`.
 */

export const MAX_JSON_BODY_BYTES = 16_384;

/**
 * Reads a request body with a hard byte cap.
 *
 * `request.text()` buffers the entire body before any length check can run, so
 * a single client could make the server allocate arbitrarily large strings.
 * This reads the stream chunk by chunk and cancels as soon as the cap is
 * exceeded. The declared Content-Length is checked first as a cheap rejection.
 */
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/** Rejects non-JSON, oversized and malformed bodies before they are parsed. */
export async function readJsonBody(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<Record<string, unknown>> {
  const maxBytes = options.maxBytes ?? MAX_JSON_BODY_BYTES;
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AppError('Content-Type must be application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const raw = await readBodyWithLimit(request, maxBytes);
  if (raw.trim() === '') {
    throw new AppError('A JSON body is required.', 400, 'EMPTY_BODY');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('A valid JSON body is required.', 400, 'INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('The JSON body must be an object.', 400, 'INVALID_BODY');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Maps a thrown error onto a response.
 *
 * Known application errors keep their message (they are written for users).
 * Anything else is logged server-side and replaced by a generic message, so SQL
 * text, file paths and partial secrets never reach the client.
 */
export function errorResponse(err: unknown, context = 'api'): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      { status: err.statusCode, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  console.error(`[${context}] unexpected error:`, err instanceof Error ? err.message : err);
  return NextResponse.json(
    { error: 'The request could not be completed due to an internal error.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
