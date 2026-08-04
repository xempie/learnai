/**
 * Shared API-route plumbing: error envelope, validation, pagination, rate limits.
 * Every handler follows: parse -> authenticate -> authorise -> execute -> audit -> respond
 * (TECHNICAL_SPEC §12.1).
 */

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "ENTITLEMENT_REQUIRED"
  | "NOT_CONFIGURED"
  | "SERVER_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  ENTITLEMENT_REQUIRED: 403,
  NOT_CONFIGURED: 501,
  SERVER_ERROR: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: STATUS[code] },
  );
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/** Wraps a handler so thrown ApiErrors and Zod failures become proper responses. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return apiError(err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return apiError("VALIDATION_FAILED", "Invalid request.", fieldErrors(err));
      }
      // Never leak internals or PII to the client (TECHNICAL_SPEC §9.2).
      console.error("[api] unhandled error", err);
      return apiError("SERVER_ERROR", "Something went wrong. Please try again.");
    }
  };
}

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parses and validates a JSON body, returning a 422 field map on failure. */
export async function parseBody<S extends ZodType>(
  req: Request,
  schema: S,
): Promise<ReturnType<S["parse"]>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError("VALIDATION_FAILED", "Invalid request.", fieldErrors(result.error));
  }
  return result.data as ReturnType<S["parse"]>;
}

export function parseQuery<S extends ZodType>(req: Request, schema: S): ReturnType<S["parse"]> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError("VALIDATION_FAILED", "Invalid query.", fieldErrors(result.error));
  }
  return result.data as ReturnType<S["parse"]>;
}

/* ---------- cursor pagination (TECHNICAL_SPEC §6.1) ---------- */

export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T = Record<string, string>>(cursor?: string | null): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid cursor.");
  }
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/* ---------- rate limiting ---------- */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter. In-process only, which is enough for a single Lambda
 * container and for local dev; production also rate-limits at the WAF
 * (TECHNICAL_SPEC §9.1). Swap for Redis/DynamoDB when running multi-instance.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError("RATE_LIMITED", `Too many requests. Try again in ${seconds}s.`);
  }
}

/** Best-effort client IP for rate-limit keys and audit rows. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Periodically drop expired buckets so the map can't grow without bound. */
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000);
  // Don't hold the process open in short-lived environments.
  (timer as unknown as { unref?: () => void }).unref?.();
}
