import { NextResponse } from "next/server";

/**
 * Shared error envelope per LEARN_AI_V1_BUILD_SPEC.md §8:
 *   { "error": { "code": "string", "message": "human readable", "details": {} } }
 *
 * This lives outside `lib/auth/` deliberately: it is a general API concern,
 * not an auth-provider concern. `lib/auth/provider.ts` throws `ApiError`
 * instances (for 401/403) but does not know how they get turned into HTTP
 * responses — that keeps the "swapping the provider touches only lib/auth/"
 * contract intact, since every route already depends on this file for
 * error handling regardless of which auth provider is behind `lib/auth/`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? {} } },
      { status: error.status },
    );
  }

  // A raw Postgres/pg-pool connection failure (e.g. no DATABASE_URL, DB
  // unreachable) must not crash the route handler as an unhandled 500 —
  // surface it as a clean 503 per T03's "handle missing DB gracefully"
  // acceptance note.
  if (isConnectionError(error)) {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The database is unavailable. Please try again shortly.",
          details: {},
        },
      },
      { status: 503 },
    );
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong.", details: {} } },
    { status: 500 },
  );
}

function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  const connectionCodes = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "28P01", // pg: invalid_password
    "3D000", // pg: invalid_catalog_name (db does not exist)
  ]);
  if (err.code && connectionCodes.has(err.code)) return true;
  return typeof err.message === "string" && err.message.includes("DATABASE_URL is not set");
}
