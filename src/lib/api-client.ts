/**
 * Browser-side API client. Thin wrapper over fetch that unwraps the standard
 * error envelope from `src/lib/api.ts` so components can `try/catch` on a real
 * Error with a usable `.code` and `.fieldErrors`.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Appended to the URL as a query string. Undefined/null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;

  let url = path.startsWith("/api") ? path : `/api/v1${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeParse(text) : null;

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "SERVER_ERROR",
      err?.message ?? "Something went wrong. Please try again.",
      err?.details as Record<string, string> | undefined,
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "POST", body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/* ---------------- analytics batching (V1_BUILD_SPEC §5.3) ---------------- */

interface QueuedEvent {
  event: string;
  topic_id?: string;
  episode_id?: string;
  category_id?: string;
  metadata?: Record<string, unknown>;
  ts: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Queue a product-analytics event. Flushed every 10s or on page hide. */
export function trackEvent(
  event: string,
  fields: Omit<QueuedEvent, "event" | "ts"> = {},
): void {
  if (typeof window === "undefined") return;
  queue.push({ event, ...fields, ts: new Date().toISOString() });
  if (queue.length >= 25) {
    void flushEvents();
    return;
  }
  flushTimer ??= setTimeout(() => void flushEvents(), 10_000);
}

export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];

  try {
    // sendBeacon survives page unload; fetch is the fallback.
    const payload = JSON.stringify({ events: batch });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/v1/events", blob)) return;
    }
    await fetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Analytics must never break the page.
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushEvents();
  });
}
