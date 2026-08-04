"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Info,
  Loader2,
  MessageSquare,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@/components/content-card";
import { ApiClientError, api } from "@/lib/api-client";

/* ============================================================
   Shared bits - also consumed by <NotificationBell />
   ============================================================ */

/** One row of `GET /api/v1/notifications`. */
export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  topic_id: string | null;
  actor_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  data: ApiNotification[];
  next_cursor: string | null;
  unread: number;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  new_content: Sparkles,
  comment_reply: MessageSquare,
  comment_on_own: MessageSquare,
  cohort_milestone: Users,
  system: Info,
};

export function notificationIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Info;
}

const TYPE_LABELS: Record<string, string> = {
  new_content: "New episode",
  comment_reply: "Reply",
  comment_on_own: "Comment",
  cohort_milestone: "Cohort",
  system: "Account",
};

export function notificationLabel(type: string): string {
  return TYPE_LABELS[type] ?? "Update";
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

/* ============================================================
   useApiResource - the read side of every page in this bundle.

   Lives in this module because it is the leaf of the component
   import graph: <AppShell> renders <NotificationBell>, which
   renders from here, so anything shared has to sit below both.

   State is only ever written from the promise callbacks, never
   synchronously inside the effect body - that is what keeps the
   React Compiler happy and avoids a cascading re-render on mount.
   ============================================================ */

export interface Resource<T> {
  /** Null while loading, and after a failure. */
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Refetch. Safe to call from an event handler. */
  reload: () => void;
  /** For optimistic updates; the next reload overwrites it. */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useApiResource<T>(
  /** Must be referentially stable - wrap it in useCallback. */
  fetcher: () => Promise<T>,
  fallbackError: string,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(errorMessage(err, fallbackError));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, fallbackError, token]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setToken((t) => t + 1);
  }, []);

  return { data, loading, error, reload, setData };
}

/* ============================================================
   Preferences (spec §4.5 - one switch per notification type)
   ============================================================ */

interface PreferencesPayload {
  new_content: boolean;
  comment_replies: boolean;
  cohort_milestones: boolean;
}

type PrefKey = keyof PreferencesPayload;

const PREFS: { key: PrefKey; label: string; hint: string }[] = [
  {
    key: "new_content",
    label: "New content in my categories",
    hint: "Told when a episode or article lands in one of your three chosen categories.",
  },
  {
    key: "comment_replies",
    label: "Replies to my comments",
    hint: "Told when somebody answers a comment you left, or comments on a thread you joined.",
  },
  {
    key: "cohort_milestones",
    label: "Cohort milestones",
    hint: "Occasional aggregate updates about your organisation - never anybody's name.",
  },
];

/* ============================================================
   View
   ============================================================ */

type Filter = "all" | "unread";

const PAGE_LIMIT = 50;

export function NotificationsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchList = useCallback(
    () => api.get<NotificationListResponse>("/notifications", { limit: PAGE_LIMIT }),
    [],
  );
  const {
    data: list,
    loading,
    error,
    reload,
    setData,
  } = useApiResource<NotificationListResponse>(
    fetchList,
    "We could not load your notifications.",
  );

  const items = list?.data ?? [];
  const unread = list?.unread ?? 0;

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.read) return;

    // Optimistic: the row must feel read the instant it is clicked, including
    // when the click is also a navigation away from this page.
    setData((prev) =>
      prev
        ? {
            ...prev,
            unread: Math.max(0, prev.unread - 1),
            data: prev.data.map((n) =>
              n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n,
            ),
          }
        : prev,
    );
    setActionError(null);

    try {
      const res = await api.post<{ read: boolean; unread: number }>(`/notifications/${id}/read`);
      setData((prev) => (prev ? { ...prev, unread: res.unread } : prev));
    } catch (err) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread: prev.unread + 1,
              data: prev.data.map((n) =>
                n.id === id ? { ...n, read: false, read_at: null } : n,
              ),
            }
          : prev,
      );
      setActionError(errorMessage(err, "We could not mark that as read."));
    }
  }

  async function markAllRead() {
    const snapshot = list;
    setMarkingAll(true);
    setActionError(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            unread: 0,
            data: prev.data.map((n) =>
              n.read ? n : { ...n, read: true, read_at: new Date().toISOString() },
            ),
          }
        : prev,
    );

    try {
      const res = await api.post<{ marked_read: number; unread: number }>(
        "/notifications/read-all",
      );
      setData((prev) => (prev ? { ...prev, unread: res.unread } : prev));
    } catch (err) {
      setData(snapshot);
      setActionError(errorMessage(err, "We could not mark everything as read."));
    } finally {
      setMarkingAll(false);
    }
  }

  const visible = filter === "unread" ? items.filter((n) => !n.read) : items;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* ===== Header ===== */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Notifications</h1>
          <p aria-live="polite" className="mt-1 text-ink-muted">
            {loading
              ? "Loading your notifications…"
              : unread === 0
                ? "Nothing new right now."
                : `${unread} unread notification${unread === 1 ? "" : "s"}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unread === 0 || markingAll || loading}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:text-ink-faint"
        >
          {markingAll ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck className="size-4" aria-hidden="true" />
          )}
          Mark all read
        </button>
      </header>

      {actionError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {/* ===== Filter ===== */}
      <div
        role="group"
        aria-label="Filter notifications"
        className="flex w-fit rounded-full border border-line bg-surface p-1 shadow-xs"
      >
        {(
          [
            { value: "all", label: `All (${items.length})` },
            { value: "unread", label: `Unread (${unread})` },
          ] as { value: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${
              filter === f.value
                ? "bg-primary text-on-primary"
                : "text-ink-muted hover:text-primary-strong"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ===== List ===== */}
      <section aria-label="Notification list" aria-busy={loading}>
        {loading ? (
          <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
                <div aria-hidden="true" className="flex items-start gap-3">
                  <span className="size-10 shrink-0 animate-pulse rounded-md bg-band" />
                  <span className="min-w-0 flex-1">
                    <span className="block h-3 w-24 animate-pulse rounded bg-band" />
                    <span className="mt-2 block h-4 w-2/3 animate-pulse rounded bg-band" />
                    <span className="mt-2 block h-3 w-1/2 animate-pulse rounded bg-band" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="rounded-card border border-line bg-surface p-10 text-center shadow-xs">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft">
              <AlertCircle className="size-6 text-danger" aria-hidden="true" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">
              We could not load your notifications
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-card border border-line bg-surface p-10 text-center shadow-xs">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft">
              <Bell className="size-6 text-primary-strong" aria-hidden="true" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">
              {filter === "unread" ? "You’re all caught up" : "No notifications yet"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              {filter === "unread"
                ? "Every notification has been read. New ones will appear here."
                : "When a new episode lands in your categories or somebody replies to you, you’ll see it here."}
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
            {visible.map((n) => {
              const Icon = notificationIcon(n.type);
              const isUnread = !n.read;
              const inner = (
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-md ${
                      isUnread ? "bg-surface" : "bg-band"
                    }`}
                  >
                    <Icon className="size-5 text-primary-strong" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-full border border-line bg-band px-2 py-0.5 text-xs font-semibold text-ink-muted">
                        {notificationLabel(n.type)}
                      </span>
                      <span className="text-xs font-medium text-ink-faint">
                        {relativeTime(n.created_at)}
                      </span>
                      {isUnread && (
                        <>
                          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                          <span className="sr-only">Unread</span>
                        </>
                      )}
                    </span>
                    <span className="mt-1 block font-semibold text-ink">{n.title}</span>
                    {n.body && (
                      <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                        {n.body}
                      </span>
                    )}
                  </span>
                </div>
              );

              return (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  {n.link_url ? (
                    <Link
                      href={n.link_url}
                      onClick={() => void markRead(n.id)}
                      className={`block px-4 py-4 transition-colors sm:px-5 ${
                        isUnread ? "bg-primary-soft hover:bg-primary-soft/70" : "hover:bg-band"
                      }`}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className={`block w-full px-4 py-4 text-left transition-colors sm:px-5 ${
                        isUnread ? "bg-primary-soft hover:bg-primary-soft/70" : "hover:bg-band"
                      }`}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== Preferences ===== */}
      <NotificationPreferences />
    </div>
  );
}

function NotificationPreferences() {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<PrefKey | null>(null);

  const fetchPrefs = useCallback(
    () => api.get<PreferencesPayload>("/notifications/preferences"),
    [],
  );
  const {
    data: prefs,
    loading,
    error,
    reload,
    setData: setPrefs,
  } = useApiResource<PreferencesPayload>(
    fetchPrefs,
    "We could not load your notification preferences.",
  );

  async function toggle(key: PrefKey) {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setSaveError(null);
    try {
      setPrefs(await api.put<PreferencesPayload>("/notifications/preferences", { [key]: next[key] }));
    } catch (err) {
      setPrefs(previous);
      setSaveError(errorMessage(err, "We could not save that preference."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section
      aria-labelledby="prefs-heading"
      aria-busy={loading}
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <h2 id="prefs-heading" className="text-lg font-semibold">
        What you get told about
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Turn any of these off and we stop sending them. Account and billing messages always
        arrive.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-danger-soft px-3 py-2.5 text-sm">
          <p role="alert" className="flex items-start gap-2 font-medium text-ink">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
          >
            Try again
          </button>
        </div>
      )}

      {saveError && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {saveError}
        </p>
      )}

      <ul className="mt-5 flex flex-col divide-y divide-line">
        {PREFS.map((p) => {
          const on = prefs?.[p.key] ?? false;
          const disabled = loading || prefs === null || saving !== null;
          return (
            <li key={p.key} className="flex items-start justify-between gap-4 py-4 first:pt-0">
              <div className="min-w-0">
                <label htmlFor={`pref-${p.key}`} className="font-semibold">
                  {p.label}
                </label>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{p.hint}</p>
              </div>
              <button
                id={`pref-${p.key}`}
                type="button"
                role="switch"
                aria-checked={on}
                disabled={disabled}
                onClick={() => void toggle(p.key)}
                className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  on ? "bg-primary" : "bg-line-strong"
                }`}
              >
                <span className="sr-only">{p.label}</span>
                <span
                  aria-hidden="true"
                  className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
                    on ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-md bg-band px-3 py-2 text-xs leading-relaxed text-ink-faint">
        New-content alerts are capped at three a day. If we publish a burst, you get the three
        closest to your categories rather than a flooded bell.
      </p>
    </section>
  );
}
