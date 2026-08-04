"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpDown, Info, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { LineChart } from "./line-chart";
import {
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  LABEL,
  PageHeader,
  PrivacyNote,
  SectionCard,
  Skeleton,
  SkeletonRows,
  Suppressed,
  TD,
  TH,
  TypeBadge,
  formatDate,
  isoDaysAgo,
  num,
  pct,
  useAsync,
  type TopicType,
} from "./admin-ui";

/* ============ API shapes (snake_case, straight from /api/v1/admin/analytics/*) ============ */

interface ApiRange {
  from: string;
  to: string;
}

interface OverviewResponse {
  range: ApiRange;
  total_views: number;
  unique_viewers: number;
  new_registrations: number;
  active_users_7d: number;
  total_likes: number;
  total_comments: number;
  avg_watch_completion_pct: number;
}

interface TimeseriesResponse {
  metric: string;
  range: ApiRange;
  data: { day: string; value: number }[];
}

interface TopContentRow {
  id: string;
  slug: string;
  title: string;
  type: TopicType;
  status: string;
  views: number;
  likes: number;
  comments: number;
  bookmarks: number;
}

interface TopContentResponse {
  sort: string;
  range: ApiRange;
  data: TopContentRow[];
}

interface UnderperformingRow {
  id: string;
  slug: string;
  title: string;
  type: TopicType;
  impressions: number;
  views: number;
  open_rate: number;
}

interface UnderperformingResponse {
  min_impressions: number;
  basis: string;
  data: UnderperformingRow[];
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  content_count: number;
  total_views: number;
  avg_views_per_item: number;
}

interface CategoryResponse {
  range: ApiRange;
  data: CategoryRow[];
}

interface OrganizationRow {
  id: string;
  name: string;
  type: string | null;
  suppressed: boolean;
  member_count: number | null;
  active_7d: number | null;
  enrolled_learners: number | null;
  episodes_completed: number | null;
}

interface OrganizationResponse {
  range: ApiRange;
  min_cell_size: number;
  suppressed_count: number;
  data: OrganizationRow[];
}

interface RetentionRow {
  cohort_week: string;
  suppressed: boolean;
  cohort_size: number | null;
  d1_rate: number | null;
  d7_rate: number | null;
  d30_rate: number | null;
}

interface RetentionResponse {
  range: ApiRange;
  min_cell_size: number;
  suppressed_count: number;
  data: RetentionRow[];
}

/* ============ date range ============ */

type RangeKey = "7" | "30" | "90" | "custom";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "custom", label: "Custom" },
];

type SortKey = "views" | "likes" | "comments" | "bookmarks";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "bookmarks", label: "Bookmarks" },
];

const OVERVIEW_CARDS: {
  key: keyof Omit<OverviewResponse, "range">;
  label: string;
  caption: string;
  suffix?: string;
}[] = [
  { key: "total_views", label: "Total views", caption: "Opens of any content item" },
  { key: "unique_viewers", label: "Unique viewers", caption: "Distinct accounts" },
  { key: "new_registrations", label: "New registrations", caption: "Accounts created" },
  { key: "active_users_7d", label: "Active users (7d)", caption: "Any session in last 7 days" },
  { key: "total_likes", label: "Total likes", caption: "Across all content" },
  { key: "total_comments", label: "Total comments", caption: "Visible comments only" },
  {
    key: "avg_watch_completion_pct",
    label: "Avg watch completion",
    caption: "Mean % of video watched",
    suffix: "%",
  },
];

export function AnalyticsView() {
  const [range, setRange] = useState<RangeKey>("30");
  const [customFrom, setCustomFrom] = useState(() => isoDaysAgo(30));
  const [customTo, setCustomTo] = useState(() => isoDaysAgo(0));
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [typeFilter, setTypeFilter] = useState<"" | TopicType>("");

  /** The `?from=&to=` pair actually sent to every range-scoped endpoint. */
  const rangeQuery = useMemo((): { from: string; to: string } => {
    if (range === "custom") {
      return {
        from: `${customFrom}T00:00:00.000Z`,
        to: `${customTo}T23:59:59.999Z`,
      };
    }
    return {
      from: `${isoDaysAgo(Number(range))}T00:00:00.000Z`,
      to: `${isoDaysAgo(0)}T23:59:59.999Z`,
    };
  }, [range, customFrom, customTo]);

  const rangeKey = `${rangeQuery.from}|${rangeQuery.to}`;
  const rangeValid = !Number.isNaN(Date.parse(rangeQuery.from)) &&
    !Number.isNaN(Date.parse(rangeQuery.to)) &&
    Date.parse(rangeQuery.from) <= Date.parse(rangeQuery.to);

  const overview = useAsync<OverviewResponse>(rangeKey, () =>
    api.get<OverviewResponse>("/admin/analytics/overview", rangeQuery),
  );
  const views = useAsync<TimeseriesResponse>(`views|${rangeKey}`, () =>
    api.get<TimeseriesResponse>("/admin/analytics/timeseries", {
      metric: "views",
      ...rangeQuery,
    }),
  );
  const registrations = useAsync<TimeseriesResponse>(`regs|${rangeKey}`, () =>
    api.get<TimeseriesResponse>("/admin/analytics/timeseries", {
      metric: "registrations",
      ...rangeQuery,
    }),
  );
  const top = useAsync<TopContentResponse>(`top|${sortKey}|${typeFilter}|${rangeKey}`, () =>
    api.get<TopContentResponse>("/admin/analytics/top-content", {
      sort: sortKey,
      type: typeFilter || undefined,
      ...rangeQuery,
    }),
  );
  // Deliberately not range-scoped: the endpoint reports lifetime open rates.
  const under = useAsync<UnderperformingResponse>("underperforming", () =>
    api.get<UnderperformingResponse>("/admin/analytics/underperforming"),
  );
  const categories = useAsync<CategoryResponse>(`cats|${rangeKey}`, () =>
    api.get<CategoryResponse>("/admin/analytics/categories", rangeQuery),
  );
  const orgs = useAsync<OrganizationResponse>(`orgs|${rangeKey}`, () =>
    api.get<OrganizationResponse>("/admin/analytics/organizations", rangeQuery),
  );
  const retention = useAsync<RetentionResponse>(`retention|${rangeKey}`, () =>
    api.get<RetentionResponse>("/admin/analytics/retention", rangeQuery),
  );

  const categoryRows = useMemo(() => {
    const rows = categories.data?.data ?? [];
    return [...rows].sort((a, b) => b.total_views - a.total_views);
  }, [categories.data]);

  const maxCategoryViews = Math.max(1, ...categoryRows.map((r) => r.total_views));

  const ariaSort = (key: SortKey): "descending" | "none" =>
    sortKey === key ? "descending" : "none";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Platform-level performance. Everything here is aggregate - no individual viewing history is stored or shown."
      >
        <div
          role="group"
          aria-label="Date range"
          className="flex rounded-md border border-line bg-surface p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
                range === r.value
                  ? "bg-primary-soft text-primary-strong"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {range === "custom" && (
        <div className={`${CARD} flex flex-wrap items-end gap-4 p-4`}>
          <div className="min-w-45 flex-1">
            <label htmlFor="range-from" className={LABEL}>
              From
            </label>
            <input
              id="range-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div className="min-w-45 flex-1">
            <label htmlFor="range-to" className={LABEL}>
              To
            </label>
            <input
              id="range-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <p className="text-xs text-ink-faint">
            {rangeValid
              ? "Applied to every panel except underperforming content."
              : "Pick a start date on or before the end date."}
          </p>
        </div>
      )}

      {/* ===== Overview ===== */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="sr-only">
          Overview
        </h2>
        {overview.error ? (
          <ErrorBox message={overview.error} onRetry={overview.reload} />
        ) : (
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {OVERVIEW_CARDS.map((card) => (
              <div key={card.key} className={`${CARD} p-4`}>
                <dt className="text-sm font-semibold text-ink-muted">{card.label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl">
                  {overview.loading || !overview.data ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <>
                      {num(overview.data[card.key])}
                      {card.suffix}
                    </>
                  )}
                </dd>
                <p className="mt-1 text-xs text-ink-faint">{card.caption}</p>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ===== Time series ===== */}
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard id="views-chart" title="Views over time" description="Daily content opens.">
          {views.error ? (
            <ErrorBox message={views.error} onRetry={views.reload} />
          ) : views.loading || !views.data ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <LineChart
              data={views.data.data.map((d) => ({ date: d.day, value: d.value }))}
              label="Views"
            />
          )}
        </SectionCard>
        <SectionCard
          id="reg-chart"
          title="Registrations over time"
          description="New accounts created each day."
        >
          {registrations.error ? (
            <ErrorBox message={registrations.error} onRetry={registrations.reload} />
          ) : registrations.loading || !registrations.data ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <LineChart
              data={registrations.data.data.map((d) => ({ date: d.day, value: d.value }))}
              label="Registrations"
              stroke="var(--color-pop-pink)"
            />
          )}
        </SectionCard>
      </div>

      {/* ===== Views by category ===== */}
      <SectionCard
        id="cat-views"
        title="Views by category"
        description="Summed across every content item tagged with the category. Items in two categories count in both."
      >
        {categories.error ? (
          <ErrorBox message={categories.error} onRetry={categories.reload} />
        ) : categories.loading ? (
          <SkeletonRows rows={5} />
        ) : categoryRows.length === 0 ? (
          <EmptyState title="No categories yet." hint="Create one on the Categories tab." />
        ) : (
          <ul className="flex flex-col gap-3">
            {categoryRows.map((row) => (
              <li key={row.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {num(row.total_views)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-band">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.max((row.total_views / maxCategoryViews) * 100, 1)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ===== Top content ===== */}
      <SectionCard
        id="top-content"
        title="Top content"
        description="Counts are scoped to the selected date range, so the sort key changes the ranking rather than just the column you read."
        action={
          <div>
            <label htmlFor="top-type" className={LABEL}>
              Type
            </label>
            <select
              id="top-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "" | TopicType)}
              className={`${FIELD} mt-1.5 w-44`}
            >
              <option value="">All types</option>
              <option value="topic">Topics</option>
              <option value="article">Articles</option>
            </select>
          </div>
        }
      >
        {top.error ? (
          <ErrorBox message={top.error} onRetry={top.reload} />
        ) : top.loading ? (
          <SkeletonRows rows={5} />
        ) : (top.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            title="No content in this range."
            hint="Widen the date range or clear the type filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 border-collapse text-sm">
              <caption className="sr-only">
                Content ranked by {SORT_COLUMNS.find((c) => c.key === sortKey)?.label}, highest
                first
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Title
                  </th>
                  <th scope="col" className={TH}>
                    Type
                  </th>
                  {SORT_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={ariaSort(col.key)}
                      className={`${TH} text-right`}
                    >
                      <button
                        type="button"
                        onClick={() => setSortKey(col.key)}
                        className="inline-flex min-h-11 items-center gap-1 font-semibold uppercase tracking-wide hover:text-primary-strong"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.data?.data.map((item) => (
                  <tr key={item.id}>
                    <td className={`${TD} max-w-80`}>
                      <Link
                        href={`/admin/topics/${item.id}`}
                        className="font-medium text-primary-strong underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-faint">/{item.slug}</span>
                    </td>
                    <td className={TD}>
                      <TypeBadge type={item.type} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.views)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.likes)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.comments)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.bookmarks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== Underperforming ===== */}
      <SectionCard
        id="underperforming"
        title="Underperforming content"
        description={
          under.data
            ? `Shown often in the feed but rarely opened. Open rate = views divided by feed impressions, measured over the ${under.data.basis} of each item - this panel ignores the date range above. Only items with at least ${num(under.data.min_impressions)} impressions are listed.`
            : "Shown often in the feed but rarely opened. Measured over each item's lifetime, so this panel ignores the date range above."
        }
      >
        {under.error ? (
          <ErrorBox message={under.error} onRetry={under.reload} />
        ) : under.loading ? (
          <SkeletonRows rows={4} />
        ) : (under.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing is underperforming."
            hint="No item has enough impressions to judge yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Title
                  </th>
                  <th scope="col" className={TH}>
                    Type
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Impressions
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Views
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Open rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {under.data?.data.map((item) => (
                  <tr key={item.id}>
                    <td className={`${TD} max-w-80`}>
                      <Link
                        href={`/admin/topics/${item.id}`}
                        className="font-medium text-primary-strong underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className={TD}>
                      <TypeBadge type={item.type} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.impressions)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.views)}</td>
                    <td className={`${TD} text-right`}>
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-danger">
                        <TriangleAlert className="size-4" aria-hidden="true" />
                        {pct(item.open_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== Category performance ===== */}
      <SectionCard id="cat-performance" title="Category performance">
        {categories.error ? (
          <ErrorBox message={categories.error} onRetry={categories.reload} />
        ) : categories.loading ? (
          <SkeletonRows rows={5} />
        ) : categoryRows.length === 0 ? (
          <EmptyState title="No categories yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Category
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Content items
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Total views
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Avg views / item
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} font-medium`}>{row.name}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(row.content_count)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(row.total_views)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {num(row.avg_views_per_item)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ===== Organisations ===== */}
        <SectionCard
          id="orgs"
          title="Organisation breakdown"
          description="Aggregate counts per organisation, never a member list."
        >
          {orgs.error ? (
            <ErrorBox message={orgs.error} onRetry={orgs.reload} />
          ) : orgs.loading ? (
            <SkeletonRows rows={4} />
          ) : (orgs.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No organisations yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Organisation
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Members
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Active (7d)
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Episodes completed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.data?.data.map((org) => (
                    <tr key={org.id}>
                      <td className={`${TD} font-medium`}>{org.name}</td>
                      {org.suppressed ? (
                        <td className={`${TD} text-right`} colSpan={3}>
                          <Suppressed />
                        </td>
                      ) : (
                        <>
                          <td className={`${TD} text-right tabular-nums`}>
                            {num(org.member_count ?? 0)}
                          </td>
                          <td className={`${TD} text-right tabular-nums`}>
                            {num(org.active_7d ?? 0)}
                          </td>
                          <td className={`${TD} text-right tabular-nums`}>
                            {num(org.episodes_completed ?? 0)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PrivacyNote>
            <Info className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            Aggregate counts only - never individual member lists. Any organisation with fewer than{" "}
            {orgs.data?.min_cell_size ?? 5} members is shown as Suppressed, because a small enough
            group is identifiable.
            {orgs.data && orgs.data.suppressed_count > 0
              ? ` ${num(orgs.data.suppressed_count)} organisation${orgs.data.suppressed_count === 1 ? " is" : "s are"} suppressed in this range.`
              : ""}
          </PrivacyNote>
        </SectionCard>

        {/* ===== Retention ===== */}
        <SectionCard
          id="retention"
          title="Retention by signup cohort"
          description="Share of each week's new accounts still active after 1, 7 and 30 days."
        >
          {retention.error ? (
            <ErrorBox message={retention.error} onRetry={retention.reload} />
          ) : retention.loading ? (
            <SkeletonRows rows={4} />
          ) : (retention.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No cohorts in this range." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Cohort
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      D1
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      D7
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      D30
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {retention.data?.data.map((row) => (
                    <tr key={row.cohort_week}>
                      <td className={`${TD} font-medium`}>{formatDate(row.cohort_week)}</td>
                      {row.suppressed ? (
                        <td className={`${TD} text-right`} colSpan={3}>
                          <Suppressed />
                        </td>
                      ) : (
                        [row.d1_rate, row.d7_rate, row.d30_rate].map((v, i) => (
                          <td key={i} className={`${TD} text-right tabular-nums`}>
                            {v === null ? <span className="text-ink-faint">-</span> : pct(v)}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            <Chip>-</Chip>{" "}
            <span className="align-middle">
              means the cohort is not old enough to measure yet. Cohorts smaller than{" "}
              {retention.data?.min_cell_size ?? 5} accounts are suppressed for the same privacy
              reason as the organisation table.
            </span>
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
