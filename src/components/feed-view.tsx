"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, Inbox, TriangleAlert } from "lucide-react";
import type { ApiTopicCard } from "@/components/content-card";
import { ContentCard, ContentCardSkeleton } from "@/components/content-card";
import { ApiClientError, api, trackEvent } from "@/lib/api-client";

/** Matches the `tab` enum on GET /api/v1/feed. */
type Tab = "for_you" | "everything";

const TABS: { value: Tab; label: string }[] = [
  { value: "for_you", label: "For you" },
  { value: "everything", label: "Everything" },
];

const PAGE_SIZE = 6;
const ALL = "all";

/* ---------------- API shapes (snake_case, as served) ---------------- */

interface ApiCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color_hex: string;
  sort_order: number;
  is_active: boolean;
  topic_count: number;
}

interface CategoriesResponse {
  data: ApiCategory[];
}

interface MyCategoriesResponse {
  categories: { id: string; slug: string; name: string; color_hex: string; rank: number }[];
}

interface FeedResponse {
  tab: Tab;
  type: string;
  data: ApiTopicCard[];
  next_cursor: string | null;
  backfill: ApiTopicCard[];
  backfill_label: string;
}

const FALLBACK_ERROR = "We could not load the feed. Check your connection and try again.";

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return FALLBACK_ERROR;
}

export function FeedView() {
  const [tab, setTab] = useState<Tab>("for_you");
  const [categorySlug, setCategorySlug] = useState<string>(ALL);

  const [items, setItems] = useState<ApiTopicCard[]>([]);
  const [backfill, setBackfill] = useState<ApiTopicCard[]>([]);
  const [backfillLabel, setBackfillLabel] = useState("Popular across Acadu");
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [myCategoryIds, setMyCategoryIds] = useState<string[]>([]);

  /** Bumping this refetches the current view - used by Retry. */
  const [reloadKey, setReloadKey] = useState(0);

  /* ---------------- categories for the filter chips ---------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.get<CategoriesResponse>("/categories");
        if (!cancelled) setCategories(res.data.filter((c) => c.is_active));
      } catch {
        // Chips are a refinement; the stream still works without them.
        if (!cancelled) setCategories([]);
      }
    })();

    void (async () => {
      try {
        const res = await api.get<MyCategoriesResponse>("/me/categories");
        if (!cancelled) setMyCategoryIds(res.categories.map((c) => c.id));
      } catch {
        if (!cancelled) setMyCategoryIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- first page whenever tab / category changes ---------------- */

  // The "back to loading" reset lives in the handlers below, not here: setting
  // state synchronously inside an effect costs an extra render pass.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.get<FeedResponse>("/feed", {
          tab,
          category: categorySlug === ALL ? undefined : categorySlug,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setError(null);
        setItems(res.data);
        setBackfill(res.backfill ?? []);
        if (res.backfill_label) setBackfillLabel(res.backfill_label);
        setCursor(res.next_cursor);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setBackfill([]);
        setCursor(null);
        setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, categorySlug, reloadKey]);

  /* ---------------- impressions ---------------- */

  // One event per topic per tab, however many times React re-renders it.
  const seen = useRef(new Set<string>());

  useEffect(() => {
    seen.current = new Set<string>();
  }, [tab]);

  useEffect(() => {
    if (loading) return;
    [...items, ...backfill].forEach((topic, index) => {
      const key = `${tab}:${topic.id}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      trackEvent("feed_impression", {
        topic_id: topic.id,
        metadata: { position: index + 1, tab },
      });
    });
  }, [items, backfill, loading, tab]);

  /* ---------------- interactions ---------------- */

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await api.get<FeedResponse>("/feed", {
        tab,
        category: categorySlug === ALL ? undefined : categorySlug,
        limit: PAGE_SIZE,
        cursor,
      });
      setItems((prev) => {
        const known = new Set(prev.map((c) => c.id));
        return [...prev, ...res.data.filter((c) => !known.has(c.id))];
      });
      setCursor(res.next_cursor);
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, tab, categorySlug]);

  function resetToLoading() {
    setLoading(true);
    setError(null);
    setMoreError(null);
  }

  function changeTab(next: Tab) {
    if (next === tab) return;
    resetToLoading();
    setTab(next);
  }

  function changeCategory(next: string, categoryId?: string) {
    if (next === categorySlug) return;
    resetToLoading();
    setCategorySlug(next);
    trackEvent("category_filtered", {
      category_id: categoryId,
      metadata: { category: next, tab },
    });
  }

  function retry() {
    resetToLoading();
    setReloadKey((k) => k + 1);
  }

  const selectedCategory = categories.find((c) => c.slug === categorySlug);
  const hasMore = cursor !== null;
  const showBackfill = !hasMore && backfill.length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="text-2xl sm:text-3xl">Topics</h1>
        <p className="mt-2 text-ink-muted">
          Newest first. &ldquo;For you&rdquo; is built from the three topics you picked when you
          joined.
        </p>
      </header>

      {/* ===== Tabs ===== */}
      <div
        role="group"
        aria-label="Feed source"
        className="flex w-fit rounded-full border border-line bg-band p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => changeTab(t.value)}
            aria-pressed={tab === t.value}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${
              tab === t.value
                ? "bg-surface text-ink shadow-xs"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== Category filter chips ===== */}
      <div>
        <h2 id="filter-heading" className="sr-only">
          Filter by category
        </h2>
        <ul aria-labelledby="filter-heading" className="flex flex-wrap gap-2">
          <li>
            <button
              type="button"
              onClick={() => changeCategory(ALL)}
              aria-pressed={categorySlug === ALL}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
                categorySlug === ALL
                  ? "border-transparent bg-primary text-on-primary"
                  : "border-line bg-surface text-ink-muted hover:border-primary hover:text-primary-strong"
              }`}
            >
              All
            </button>
          </li>
          {categories.map((category) => {
            const selected = categorySlug === category.slug;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => changeCategory(category.slug, category.id)}
                  aria-pressed={selected}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-transparent bg-primary text-on-primary"
                      : "border-line bg-surface text-ink-muted hover:border-primary hover:text-primary-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: selected ? "currentColor" : category.color_hex }}
                  />
                  {category.name}
                  {myCategoryIds.includes(category.id) && (
                    <span className="sr-only">(one of your chosen categories)</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Loading topics"
          : error
            ? error
            : `Showing ${items.length} item${items.length === 1 ? "" : "s"}${
                selectedCategory ? ` in ${selectedCategory.name}` : ""
              }`}
      </p>

      {/* ===== Stream ===== */}
      {loading ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <li key={i} className="flex">
              <ContentCardSkeleton />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface p-8 text-center shadow-xs">
          <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-streak-soft">
            <TriangleAlert className="size-6 text-streak" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">We could not load this</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary hover:bg-primary-strong"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface p-8 text-center shadow-xs">
          <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-primary-soft">
            <Inbox className="size-6 text-primary-strong" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-muted">
            {selectedCategory
              ? `We haven't published anything in ${selectedCategory.name} that matches this view. New episodes land most weekdays.`
              : "There's nothing published in this view yet. New episodes land most weekdays."}
          </p>
          {categorySlug !== ALL && (
            <button
              type="button"
              onClick={() => changeCategory(ALL)}
              className="mt-4 inline-flex min-h-12 items-center rounded-md border border-line px-6 font-semibold text-ink-muted hover:border-primary hover:text-primary-strong"
            >
              Show all categories
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((topic) => (
            <li key={topic.id} className="flex">
              <ContentCard topic={topic} />
            </li>
          ))}
        </ul>
      )}

      {moreError && (
        <p role="status" aria-live="polite" className="text-center text-sm font-semibold text-danger">
          {moreError}
        </p>
      )}

      {!loading && !error && hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mx-auto inline-flex min-h-12 items-center rounded-md border border-line bg-surface px-6 font-semibold text-ink-muted shadow-xs hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          {loadingMore ? "Loading" : "Load more"}
        </button>
      )}

      {/* ===== Backfill, always labelled (spec §4.2) ===== */}
      {!loading && !error && showBackfill && (
        <section aria-labelledby="backfill-heading" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            <h2
              id="backfill-heading"
              className="inline-flex items-center gap-2 text-sm font-semibold text-ink-faint"
            >
              <Compass className="size-4" aria-hidden="true" />
              {backfillLabel}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
          <p className="-mt-2 text-center text-sm text-ink-faint">
            Outside your chosen categories, but widely read.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {backfill.map((topic) => (
              <li key={topic.id} className="flex">
                <ContentCard topic={topic} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
