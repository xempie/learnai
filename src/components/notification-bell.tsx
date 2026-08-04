"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { relativeTime } from "@/components/content-card";
import {
  type ApiNotification,
  type NotificationListResponse,
  errorMessage,
  notificationIcon,
} from "@/components/notifications-view";
import { api } from "@/lib/api-client";

const PANEL_LIMIT = 10;
/** Badge refresh cadence. Paused entirely while the tab is hidden. */
const POLL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [panelToken, setPanelToken] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /* ---------- badge count: on mount, then every 60s while visible ---------- */

  useEffect(() => {
    let cancelled = false;

    // A badge that fails to refresh stays silent - it is not worth an error
    // banner on every page of the app.
    const refresh = () =>
      api.get<{ unread: number }>("/notifications/count").then(
        (res) => {
          if (!cancelled) setUnread(res.unread);
        },
        () => undefined,
      );

    void refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    function onVisibilityChange() {
      // Catch up immediately when the tab comes back rather than waiting out
      // the remainder of the interval.
      if (document.visibilityState === "visible") void refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  /* ---------- panel contents: fetched when the panel opens ---------- */

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    api.get<NotificationListResponse>("/notifications", { limit: PANEL_LIMIT }).then(
      (res) => {
        if (cancelled) return;
        setItems(res.data);
        setUnread(res.unread);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err, "We could not load your notifications."));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [open, panelToken]);

  /** Toggling from a click handler is where the spinner may safely be set. */
  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      setError(null);
    }
  }

  function retryPanel() {
    setLoading(true);
    setError(null);
    setPanelToken((t) => t + 1);
  }

  /* Close on outside click and on Escape. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.read) return;

    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)),
    );
    setUnread((n) => Math.max(0, n - 1));

    try {
      const res = await api.post<{ read: boolean; unread: number }>(`/notifications/${id}/read`);
      setUnread(res.unread);
    } catch (err) {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false, read_at: null } : n)),
      );
      setUnread((n) => n + 1);
      setError(errorMessage(err, "We could not mark that as read."));
    }
  }

  async function markAllRead() {
    const snapshot = items;
    const previousUnread = unread;
    setMarkingAll(true);
    setError(null);
    setItems((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true, read_at: new Date().toISOString() })),
    );
    setUnread(0);

    try {
      const res = await api.post<{ marked_read: number; unread: number }>(
        "/notifications/read-all",
      );
      setUnread(res.unread);
    } catch (err) {
      setItems(snapshot);
      setUnread(previousUnread);
      setError(errorMessage(err, "We could not mark everything as read."));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors ${
          open ? "bg-primary-soft text-primary-strong" : "text-ink-muted hover:bg-band hover:text-ink"
        }`}
      >
        <Bell className="size-5.5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            className="absolute right-1.5 top-1.5 inline-flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold leading-4 tabular-nums text-on-primary"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Notifications"
          aria-busy={loading}
          className="absolute right-0 top-full z-30 mt-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lg sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="font-display font-semibold">Notifications</p>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0 || markingAll || loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
            >
              {markingAll ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="size-4" aria-hidden="true" />
              )}
              Mark all read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <ul aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <span className="size-9 shrink-0 animate-pulse rounded-md bg-band" />
                      <span className="min-w-0 flex-1">
                        <span className="block h-4 w-3/4 animate-pulse rounded bg-band" />
                        <span className="mt-2 block h-3 w-1/2 animate-pulse rounded bg-band" />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p role="alert" className="text-sm font-medium text-ink-muted">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={retryPanel}
                  className="mt-3 inline-flex min-h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm font-medium text-ink-muted">
                You’re all caught up
              </p>
            ) : (
              <ul>
                {items.map((n) => {
                  const Icon = notificationIcon(n.type);
                  const isUnread = !n.read;
                  const body = (
                    <span className="flex items-start gap-3">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                          isUnread ? "bg-surface" : "bg-band"
                        }`}
                      >
                        <Icon className="size-4.5 text-primary-strong" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                            {n.title}
                          </span>
                          {isUnread && (
                            <>
                              <span
                                aria-hidden="true"
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                              />
                              <span className="sr-only">Unread</span>
                            </>
                          )}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-ink-muted">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-xs font-medium text-ink-faint">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                    </span>
                  );

                  const rowClass = `block w-full px-4 py-3 text-left transition-colors ${
                    isUnread ? "bg-primary-soft hover:bg-primary-soft/70" : "hover:bg-band"
                  }`;

                  return (
                    <li key={n.id} className="border-b border-line last:border-b-0">
                      {n.link_url ? (
                        <Link
                          href={n.link_url}
                          onClick={() => {
                            void markRead(n.id);
                            setOpen(false);
                          }}
                          className={rowClass}
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void markRead(n.id)}
                          className={rowClass}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center justify-center rounded-md text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft"
            >
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
