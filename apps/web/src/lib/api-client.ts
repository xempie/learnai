import { cookies, headers } from "next/headers";

/**
 * LEARN_AI_V1_BUILD_SPEC.md §2.1 contract: "Server-rendered data fetching
 * must go through a single `lib/api-client.ts` module." No page component
 * may query `@learn-ai/db` or call `authProvider` directly — every server
 * component fetches through `apiFetch` below, which hits this app's own
 * `/api/v1/*` route handlers exactly as a browser client would. This is
 * the ONE module every future page (T15+) depends on for data, so the
 * frontend framework/hosting decision (§2.1) stays swappable without
 * touching page code.
 *
 * Auth: server components have no `NextRequest` to hand to `authProvider`
 * (that's route-handler-only). Instead this module forwards the current
 * request's session cookie to the internal API call — the target route
 * handler runs its own `requireUser`/`requireRole` check exactly as it
 * would for a browser-originated request, so 401/403 behaviour is defined
 * in exactly one place (the route handlers), not duplicated in page code.
 */
export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

async function resolveBaseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }
  // Local/dev fallback: derive the origin from the incoming request's own
  // headers so this works before PUBLIC_BASE_URL is configured for a given
  // environment.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * Fetch JSON from this app's own `/api/v1` and return the parsed body, or
 * throw `ApiClientError` for any non-2xx response (mapping the §8 error
 * envelope `{ error: { code, message, details } }` 1:1). Only usable from
 * server components / server actions (depends on `next/headers`).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const [baseUrl, cookieStore] = await Promise.all([resolveBaseUrl(), cookies()]);
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    // Cohort/admin data is per-user and must never be cached across
    // requests/users.
    cache: "no-store",
  });

  const text = await res.text();
  const body: unknown = text.length > 0 ? JSON.parse(text) : {};

  if (!res.ok) {
    const errorBody = body as { error?: ApiErrorPayload };
    const payload = errorBody.error ?? {
      code: "UNKNOWN_ERROR",
      message: "The request failed.",
    };
    throw new ApiClientError(res.status, payload);
  }

  return body as T;
}
