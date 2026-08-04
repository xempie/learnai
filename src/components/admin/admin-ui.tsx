"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ApiClientError } from "@/lib/api-client";

/* ============ API vocabularies (mirrors src/lib/schemas/content.ts) ============ */

export type TopicStatus =
  | "draft"
  | "in_review"
  | "scheduled"
  | "published"
  | "unpublished"
  | "rejected";

export type TopicType = "topic" | "article";

export type UploadStatus = "pending" | "uploading" | "processing" | "ready" | "failed";

export type SkillLevel = "basic" | "intermediate" | "advanced";

/** Episode hard cap, enforced by the API and a DB check constraint. */
export const MAX_EPISODE_DURATION_SEC = 360;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/* ============ deterministic formatters (no locale → no hydration drift) ============ */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-07-14T09:00:00Z" → "14 Jul 2026". Undefined/invalid → "-". */
export function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-07-14T09:00:00Z" → "14 Jul 2026, 09:00". */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hh}:${mm}`;
}

/** 11712 → "11,712" (locale-independent). */
export function num(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 0.2345 → "23.5%" */
export function pct(ratio: number, dp = 1): string {
  return `${(ratio * 100).toFixed(dp)}%`;
}

/** 1375 → "22:55". */
export function formatDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** Stable avatar hue for a nickname - the API does not store one. */
export function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

/** Turns anything thrown by the api client into a sentence an admin can act on. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    // A generic "Invalid request." is useless on its own; the field errors say
    // what actually failed, so they are appended verbatim.
    const details = Object.values(err.fieldErrors ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const extra = details.filter((d) => !err.message.includes(d));
    return extra.length > 0 ? `${err.message} ${extra.join(" ")}` : err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

/** ISO date (yyyy-mm-dd) for `n` days before now, in UTC. */
export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/* ============ data loading ============ */

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Replace the loaded value without a refetch, after a mutation. */
  set: (value: T) => void;
}

/**
 * Fetch-on-key helper. `key` is any string derived from the filters that should
 * trigger a refetch; `fn` is read from a ref so callers can pass an inline
 * closure without re-running the request on every render.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);

  // Declared first so the ref is current before the fetch effect below runs.
  useEffect(() => {
    fnRef.current = fn;
  });

  // One state cell tagged with the request it belongs to. `loading` is then
  // derived rather than written, so the effect never calls setState
  // synchronously and a stale response can never overwrite a newer one.
  const requestKey = `${key}#${nonce}`;
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string | null;
  }>({ key: "", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fnRef
      .current()
      .then((value) => {
        if (!cancelled) setResult({ key: requestKey, data: value, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key: requestKey, data: null, error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const fresh = result.key === requestKey;

  return {
    data: fresh ? result.data : null,
    loading: !fresh,
    error: fresh ? result.error : null,
    reload: () => setNonce((n) => n + 1),
    set: (value: T) => setResult({ key: requestKey, data: value, error: null }),
  };
}

/* ============ shared class strings ============ */

export const CARD = "rounded-card border border-line bg-surface shadow-xs";
export const BTN_PRIMARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint";
export const BTN_SECONDARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:text-ink-faint";
export const BTN_DANGER =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-danger/30 px-4 font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:bg-transparent";
export const ICON_BTN =
  "inline-flex size-11 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:border-line";
export const ICON_BTN_DANGER =
  "inline-flex size-11 items-center justify-center rounded-md border border-danger/30 text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:bg-transparent";
export const FIELD =
  "h-12 w-full rounded-field border border-line bg-surface px-4 text-ink focus:border-primary";
export const TEXTAREA =
  "w-full rounded-field border border-line bg-surface p-4 text-sm leading-relaxed text-ink focus:border-primary";
export const LABEL = "block text-sm font-semibold text-ink";
export const TH =
  "border-b border-line-strong px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint";
export const TD = "border-b border-line px-3 py-3 align-middle";

/* ============ small presentational pieces ============ */

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {children}
    </header>
  );
}

export function SectionCard({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<TopicStatus, string> = {
  draft: "bg-band text-ink-muted",
  in_review: "bg-primary-soft text-primary-strong",
  scheduled: "bg-streak-soft text-streak",
  published: "bg-success-soft text-success",
  unpublished: "bg-danger-soft text-danger",
  rejected: "bg-danger-soft text-danger",
};

const STATUS_LABEL: Record<TopicStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Unpublished",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: TopicStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${
        STATUS_STYLE[status] ?? STATUS_STYLE.draft
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TypeBadge({ type }: { type: TopicType }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted">
      {type === "article" ? "Article" : "Topic"}
    </span>
  );
}

const UPLOAD_STYLE: Record<UploadStatus, string> = {
  pending: "bg-band text-ink-muted",
  uploading: "bg-primary-soft text-primary-strong",
  processing: "bg-streak-soft text-streak",
  ready: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

const UPLOAD_LABEL: Record<UploadStatus, string> = {
  pending: "No video yet",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function UploadStatusBadge({ status }: { status: UploadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${
        UPLOAD_STYLE[status] ?? UPLOAD_STYLE.pending
      }`}
    >
      {UPLOAD_LABEL[status] ?? status}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "danger" | "success" | "streak";
}) {
  const tones = {
    neutral: "bg-band text-ink-muted",
    primary: "bg-primary-soft text-primary-strong",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    streak: "bg-streak-soft text-streak",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-band px-4 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

export function PrivacyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-band px-3 py-2 text-xs leading-relaxed text-ink-faint">
      {children}
    </p>
  );
}

/** Value withheld because the cohort is smaller than the minimum cell size. */
export function Suppressed() {
  return (
    <span className="text-ink-faint" title="Withheld: cohort below the minimum cell size">
      Suppressed
    </span>
  );
}

/* ============ loading + error ============ */

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-band ${className}`} />;
}

/** A few skeleton lines, sized like a table body. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2.5">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`h-10 w-full ${i === rows - 1 ? "opacity-60" : ""}`} />
      ))}
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-danger/30 bg-danger-soft p-4 ${className}`}
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{message}</span>
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${BTN_SECONDARY} mt-3`}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
