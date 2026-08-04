"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Award,
  Bookmark,
  Building2,
  Check,
  Eye,
  FileText,
  Heart,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { type Me, type MeOrganization, useCurrentUser } from "@/components/app-shell";
import { relativeTime } from "@/components/content-card";
import { errorMessage, useApiResource } from "@/components/notifications-view";
import { api } from "@/lib/api-client";

/* ============================================================
   API shapes
   ============================================================ */

interface ActivitySummary {
  window_days: number;
  since: string;
  items_viewed: number;
  episodes_completed: number;
  likes_given: number;
  comments_posted: number;
  days_active: number;
}

interface BookmarkCard {
  id: string;
  type: string;
  slug: string;
  href: string;
  title: string;
  excerpt: string | null;
  saved_at: string;
}

interface MyComment {
  id: string;
  body: string;
  status: string;
  is_hidden: boolean;
  created_at: string;
  topic: { id: string; type: string; slug: string; title: string; href: string } | null;
}

interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color_hex: string;
  is_active: boolean;
}

interface Paged<T> {
  data: T[];
  next_cursor: string | null;
}

const MAX_CATEGORIES = 3;

type Tab = "bookmarks" | "comments" | "categories";

const TABS: { value: Tab; label: string }[] = [
  { value: "bookmarks", label: "Bookmarks" },
  { value: "comments", label: "My comments" },
  { value: "categories", label: "My categories" },
];

export function MyDashboard() {
  const { user, loading: userLoading, error: userError, reload: reloadUser, setUser } =
    useCurrentUser();
  const [tab, setTab] = useState<Tab>("bookmarks");
  const categoryKey = user ? user.categories.map((c) => c.id).join(",") : "loading";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">My activity</h1>
        <p className="mt-1 text-ink-muted">
          Everything you&rsquo;ve saved, said and chosen - visible only to you.
        </p>
      </header>

      <ActivitySummaryCards />

      {/* ===== Cohort ===== */}
      {userLoading ? (
        <div
          aria-busy="true"
          className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
        >
          <div aria-hidden="true" className="flex items-start gap-4">
            <span className="size-11 shrink-0 animate-pulse rounded-md bg-band" />
            <span className="min-w-0 flex-1">
              <span className="block h-5 w-48 animate-pulse rounded bg-band" />
              <span className="mt-2 block h-4 w-32 animate-pulse rounded bg-band" />
            </span>
          </div>
        </div>
      ) : userError ? (
        <ErrorPanel message={userError} onRetry={reloadUser} />
      ) : user ? (
        <CohortCard user={user} onUserChange={setUser} />
      ) : null}

      {/* ===== Tabs ===== */}
      <div
        role="group"
        aria-label="My activity sections"
        className="flex w-full overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-xs sm:w-fit"
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-pressed={tab === t.value}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-colors sm:flex-none ${
              tab === t.value
                ? "bg-primary text-on-primary"
                : "text-ink-muted hover:text-primary-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bookmarks" && <BookmarksTab />}
      {tab === "comments" && <CommentsTab />}
      {tab === "categories" && (
        <CategoriesTab
          // Re-mounts whenever the saved picks change, so the local selection
          // state is seeded from the profile without an effect.
          key={categoryKey}
          picked={user ? user.categories.map((c) => c.id) : []}
          ready={!userLoading && user !== null}
          onSaved={reloadUser}
        />
      )}
    </div>
  );
}

/* ============================================================
   Activity summary - last 30 days (spec §4.6)
   ============================================================ */

function ActivitySummaryCards() {
  const fetchActivity = useCallback(() => api.get<ActivitySummary>("/me/activity"), []);
  const {
    data: summary,
    loading,
    error,
    reload,
  } = useApiResource<ActivitySummary>(
    fetchActivity,
    "We could not load your activity summary.",
  );

  const cards = summary
    ? [
        { key: "views", label: "Items viewed", value: summary.items_viewed, icon: Eye },
        { key: "likes", label: "Likes given", value: summary.likes_given, icon: Heart },
        {
          key: "comments",
          label: "Comments posted",
          value: summary.comments_posted,
          icon: MessageSquare,
        },
        { key: "days", label: "Days active", value: summary.days_active, icon: Check },
      ]
    : [];

  return (
    <section aria-labelledby="summary-heading" aria-busy={loading}>
      <h2 id="summary-heading" className="sr-only">
        Activity summary, last 30 days
      </h2>

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : loading ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-4 shadow-xs">
              <dt aria-hidden="true" className="h-4 w-24 animate-pulse rounded bg-band" />
              <dd aria-hidden="true" className="mt-3 h-8 w-12 animate-pulse rounded bg-band" />
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(({ key, label, value, icon: Icon }) => (
            <div key={key} className="rounded-card border border-line bg-surface p-4 shadow-xs">
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-2 text-xs text-ink-faint">
        Last {summary?.window_days ?? 30} days.
      </p>
    </section>
  );
}

/* ============================================================
   Cohort card
   ============================================================ */

function CohortCard({ user, onUserChange }: { user: Me; onUserChange: (u: Me) => void }) {
  // The profile is the source of truth; `pending` is only the in-flight
  // optimistic value, so a fresh /me never has to be copied into state.
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const org: MeOrganization | null = user.organization;

  if (!org) {
    return (
      <section
        aria-labelledby="cohort-heading"
        className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft">
            <Building2 className="size-5.5 text-primary-strong" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="cohort-heading" className="text-lg font-semibold">
              No cohort yet
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Verify a work or university email, or redeem a join code on the{" "}
              <Link href="/org" className="font-semibold text-primary-strong hover:underline">
                Cohort page
              </Link>
              , to be placed with your colleagues.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const visible = pending ?? org.is_visible;

  async function toggle() {
    if (!org || busy) return;
    const next = !visible;
    setPending(next);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{
        is_visible: boolean;
        member_count: number | null;
        suppressed: boolean;
      }>("/org/visibility", { visible: next });
      onUserChange({
        ...user,
        organization: {
          ...org,
          is_visible: res.is_visible,
          member_count: res.member_count,
          suppressed: res.suppressed,
        },
      });
    } catch (err) {
      setError(errorMessage(err, "We could not change your visibility."));
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="cohort-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft">
          <Building2 className="size-5.5 text-primary-strong" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="cohort-heading" className="text-lg font-semibold">
            {org.name}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
            <span className="font-medium tabular-nums">
              {org.suppressed || org.member_count === null
                ? "Be one of the first from your organisation"
                : `${org.member_count} ${org.member_count === 1 ? "person" : "people"} learning here`}
            </span>
            {org.is_founding_member && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-streak-soft px-2.5 py-0.5 text-xs font-semibold text-streak">
                <Award className="size-3.5" aria-hidden="true" />
                Founding member
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <label htmlFor="cohort-visible" className="font-semibold">
          Let my cohort see me
        </label>
        <button
          id="cohort-visible"
          type="button"
          role="switch"
          aria-checked={visible}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            visible ? "bg-primary" : "bg-line-strong"
          }`}
        >
          <span className="sr-only">Let my cohort see me</span>
          <span
            aria-hidden="true"
            className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
              visible ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <p className="mt-3 flex items-start gap-2 rounded-md bg-band px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
        <span aria-live="polite">
          {visible
            ? "Your nickname appears in your cohort's member list. Your real name, email and what you watch are never shown."
            : "You’re private. Nobody at your organisation can see you’re here - not your nickname, not that you have an account at all. Only the aggregate headcount is published."}
        </span>
      </p>
    </section>
  );
}

/* ============================================================
   Bookmarks
   ============================================================ */

function BookmarksTab() {
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(
    async () => (await api.get<Paged<BookmarkCard>>("/me/bookmarks", { limit: 50 })).data,
    [],
  );
  const {
    data,
    loading,
    error,
    reload,
    setData,
  } = useApiResource<BookmarkCard[]>(fetchBookmarks, "We could not load your bookmarks.");
  const items = data ?? [];

  async function remove(item: BookmarkCard) {
    setRemoving(item.id);
    setActionError(null);
    try {
      // The endpoint toggles, so this both un-saves it and updates the counter.
      await api.post<{ bookmarked: boolean; bookmark_count: number }>(
        `/topics/${item.id}/bookmark`,
      );
      setData((prev) => (prev ? prev.filter((b) => b.id !== item.id) : prev));
    } catch (err) {
      setActionError(errorMessage(err, "We could not remove that bookmark."));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) return <ListSkeleton label="Loading your bookmarks" />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  return (
    <section aria-label="Bookmarks">
      {actionError && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="size-6 text-primary-strong" aria-hidden="true" />}
          title="Nothing saved yet"
          body="Tap the bookmark on any episode or article and it lands here for later."
          action={{ href: "/feed", label: "Browse the feed" }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-line bg-surface p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-strong">
                    {item.type === "article" ? (
                      <FileText className="size-3.5" aria-hidden="true" />
                    ) : (
                      <VideoIcon className="size-3.5" aria-hidden="true" />
                    )}
                    {item.type === "article" ? "Article" : "Topic"}
                  </span>
                  <h3 className="mt-2 font-display text-base font-semibold">
                    <Link href={item.href} className="hover:text-primary-strong">
                      {item.title}
                    </Link>
                  </h3>
                  {item.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                      {item.excerpt}
                    </p>
                  )}
                  <p className="mt-3 text-xs font-medium text-ink-faint">
                    Saved {relativeTime(item.saved_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  disabled={removing === item.id}
                  aria-label={`Remove ${item.title} from bookmarks`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold text-ink-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
                >
                  {removing === item.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================================================
   Comment history
   ============================================================ */

function CommentsTab() {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchComments = useCallback(
    async () => (await api.get<Paged<MyComment>>("/me/comments", { limit: 50 })).data,
    [],
  );
  const {
    data,
    loading,
    error,
    reload,
    setData,
  } = useApiResource<MyComment[]>(fetchComments, "We could not load your comments.");
  const items = data ?? [];

  async function remove(id: string) {
    setDeleting(id);
    setActionError(null);
    try {
      await api.delete<{ deleted: boolean; comment_count: number | null }>(`/comments/${id}`);
      setData((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (err) {
      setActionError(errorMessage(err, "We could not delete that comment."));
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <ListSkeleton label="Loading your comments" />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  return (
    <section aria-label="My comments">
      {actionError && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6 text-primary-strong" aria-hidden="true" />}
          title="You haven’t commented yet"
          body="Questions on a episode are welcome - they usually get answered, and they help the next person who wonders the same thing."
          action={{ href: "/feed", label: "Find something to read" }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((comment) => (
            <li
              key={comment.id}
              className="rounded-card border border-line bg-surface p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-ink">{comment.body}</p>
                  {comment.is_hidden && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-band px-2 py-0.5 text-xs font-semibold text-ink-faint">
                      Hidden by moderation - only you can see this
                    </p>
                  )}
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                    <span>on</span>
                    {comment.topic ? (
                      <Link
                        href={comment.topic.href}
                        className="font-semibold text-primary-strong hover:underline"
                      >
                        {comment.topic.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">a removed item</span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-medium">{relativeTime(comment.created_at)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(comment.id)}
                  disabled={deleting === comment.id}
                  aria-label="Delete this comment"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold text-ink-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
                >
                  {deleting === comment.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================================================
   Category preferences - exactly three
   ============================================================ */

function CategoriesTab({
  picked: initial,
  ready,
  onSaved,
}: {
  picked: string[];
  ready: boolean;
  onSaved: () => void;
}) {
  // Seeded once. The parent re-mounts this component (via `key`) whenever the
  // saved picks change, which is why no effect is needed to resync.
  const [picked, setPicked] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchCategories = useCallback(
    async () =>
      (await api.get<Paged<CategoryOption>>("/categories")).data.filter((c) => c.is_active),
    [],
  );
  const {
    data,
    loading,
    error,
    reload,
  } = useApiResource<CategoryOption[]>(fetchCategories, "We could not load the category list.");
  const options = data ?? [];

  const atLimit = picked.length >= MAX_CATEGORIES;

  function toggleCategory(id: string) {
    setSaved(false);
    setSaveError(null);
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : prev.length >= MAX_CATEGORIES
          ? prev
          : [...prev, id],
    );
  }

  async function save() {
    if (picked.length !== MAX_CATEGORIES || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await api.put<{ categories: unknown[] }>("/me/categories", { categoryIds: picked });
      setSaved(true);
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "We could not save your categories."));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !ready) return <ListSkeleton label="Loading your categories" />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  return (
    <section
      aria-labelledby="categories-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="categories-heading" className="text-lg font-semibold">
          Pick exactly three
        </h2>
        <p aria-live="polite" className="text-sm font-semibold tabular-nums text-ink-muted">
          {picked.length} of {MAX_CATEGORIES} selected
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        These decide what fills your feed and which new-content alerts reach you.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {options.map((category) => {
          const selected = picked.includes(category.id);
          const disabled = !selected && atLimit;
          return (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                disabled={disabled}
                aria-pressed={selected}
                title={disabled ? "Deselect one to choose another" : undefined}
                className={`flex min-h-20 w-full items-start gap-3 rounded-card border-2 p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary-soft"
                    : disabled
                      ? "cursor-not-allowed border-line opacity-55"
                      : "border-line hover:border-line-strong"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 ${
                    selected ? "border-transparent bg-primary" : "border-line-strong bg-surface"
                  }`}
                >
                  {selected && <Check className="size-3.5 text-on-primary" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: category.color_hex }}
                    />
                    {category.name}
                  </span>
                  {category.description && (
                    <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                      {category.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {atLimit && (
        <p className="mt-3 rounded-md bg-band px-3 py-2 text-xs font-medium text-ink-faint">
          Deselect one to choose another.
        </p>
      )}

      {saveError && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {saveError}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={picked.length !== MAX_CATEGORIES || saving}
          className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : "Save categories"}
        </button>
        <span role="status" className="text-sm font-semibold text-success">
          {saved ? "Categories saved" : ""}
        </span>
      </div>
    </section>
  );
}

/* ============================================================
   Shared presentational bits
   ============================================================ */

function ListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="sr-only">{label}</p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="rounded-card border border-line bg-surface p-4 shadow-xs"
        >
          <span className="block h-4 w-20 animate-pulse rounded-full bg-band" />
          <span className="mt-3 block h-5 w-2/3 animate-pulse rounded bg-band" />
          <span className="mt-2 block h-4 w-1/2 animate-pulse rounded bg-band" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-card border border-line bg-surface p-8 text-center shadow-xs">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft">
        <AlertCircle className="size-6 text-danger" aria-hidden="true" />
      </span>
      <p role="alert" className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-10 text-center shadow-xs">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft">
        {icon}
      </span>
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
