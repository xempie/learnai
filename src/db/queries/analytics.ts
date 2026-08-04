import "server-only";

import { and, between, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents, comments, episodeProgress, likes, users } from "@/db/schema";
import { config } from "@/lib/config";

/**
 * The ONLY place the admin dashboard reads analytics from.
 *
 * PRIVACY CONTRACT (TECHNICAL_SPEC §7.2, §9.2)
 * -------------------------------------------------------------------------
 * Every function in this module returns AGGREGATES. None of them selects a
 * user id, email, nickname or any per-person row, and none accepts a user id
 * as a filter. That is deliberate and structural: there is no code path here
 * that can be repurposed into "what did person X watch", so no admin screen
 * built on this layer can ever grow that capability by accident.
 *
 * Organisation and cohort buckets additionally go through `suppress()`, which
 * blanks any bucket derived from fewer than MIN_CELL learners - with three
 * members, "2 of 3 completed the topic" plus one known colleague identifies
 * someone.
 * -------------------------------------------------------------------------
 */

/** Minimum learners behind a bucket before it may be displayed. */
export const MIN_CELL = Math.max(5, config.limits.minCohortDisplay);

/** Events that count as "a view" of a piece of content. */
const VIEW_EVENTS = ["content_opened", "video_started", "post_read"] as const;

export interface Range {
  from: Date;
  to: Date;
}

/**
 * NOTE: postgres.js cannot bind a JS Date as a parameter inside a raw `sql`
 * template, so every range bound below is passed as an ISO string and cast
 * with ::timestamptz. Binding `range.from` directly throws ERR_INVALID_ARG_TYPE
 * at runtime, not at compile time.
 */

/* ============================================================
   OVERVIEW
   ============================================================ */

export interface Overview {
  total_views: number;
  unique_viewers: number;
  new_registrations: number;
  active_users_7d: number;
  total_likes: number;
  total_comments: number;
  avg_watch_completion_pct: number;
}

export async function overview(range: Range): Promise<Overview> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [viewRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      uniques: sql<number>`count(distinct ${analyticsEvents.userId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.event, [...VIEW_EVENTS]),
        between(analyticsEvents.createdAt, range.from, range.to),
      ),
    );

  const [regRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(between(users.createdAt, range.from, range.to), isNull(users.deletedAt)));

  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(gte(users.lastActiveAt, sevenDaysAgo), isNull(users.deletedAt)));

  const [likeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(between(likes.createdAt, range.from, range.to));

  const [commentRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(between(comments.createdAt, range.from, range.to), ne(comments.status, "deleted")),
    );

  const [watchRow] = await db
    .select({
      avg: sql<number>`coalesce(round(avg(${episodeProgress.watchedPct}))::int, 0)`,
    })
    .from(episodeProgress)
    .where(between(episodeProgress.lastWatchedAt, range.from, range.to));

  return {
    total_views: viewRow?.total ?? 0,
    unique_viewers: viewRow?.uniques ?? 0,
    new_registrations: regRow?.count ?? 0,
    active_users_7d: activeRow?.count ?? 0,
    total_likes: likeRow?.count ?? 0,
    total_comments: commentRow?.count ?? 0,
    avg_watch_completion_pct: watchRow?.avg ?? 0,
  };
}

/* ============================================================
   TIME SERIES
   ============================================================ */

export type TimeseriesMetric = "views" | "registrations";

export interface Bucket {
  day: string;
  value: number;
}

/** Daily buckets, zero-filled across the whole range so charts don't lie. */
export async function timeseries(metric: TimeseriesMetric, range: Range): Promise<Bucket[]> {
  const source =
    metric === "registrations"
      ? sql`
          select date_trunc('day', u.created_at) as day, count(*)::int as value
          from users u
          where u.created_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
            and u.deleted_at is null
          group by 1`
      : sql`
          select date_trunc('day', ae.created_at) as day, count(*)::int as value
          from analytics_events ae
          where ae.created_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
            and ae.event in ('content_opened','video_started','post_read')
          group by 1`;

  const rows = await db.execute<{ day: string; value: number }>(sql`
    select to_char(series.day, 'YYYY-MM-DD') as day,
           coalesce(src.value, 0)::int as value
    from generate_series(
      date_trunc('day', ${range.from.toISOString()}::timestamptz::timestamptz),
      date_trunc('day', ${range.to.toISOString()}::timestamptz::timestamptz),
      interval '1 day'
    ) as series(day)
    left join (${source}) as src on src.day = series.day
    order by series.day asc
  `);

  return [...rows].map((r) => ({ day: String(r.day), value: Number(r.value) }));
}

/* ============================================================
   TOP CONTENT
   ============================================================ */

export type TopContentSort = "views" | "likes" | "comments" | "bookmarks";

export interface TopContentRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  views: number;
  likes: number;
  comments: number;
  bookmarks: number;
}

/** Whitelist - the sort key never reaches SQL as free text. */
const SORT_COLUMNS: Record<TopContentSort, string> = {
  views: "views",
  likes: "likes",
  comments: "comments",
  bookmarks: "bookmarks",
};

export async function topContent(opts: {
  range: Range;
  sort: TopContentSort;
  type?: "topic" | "article";
  categoryId?: string;
  limit: number;
}): Promise<TopContentRow[]> {
  const orderBy = sql.raw(SORT_COLUMNS[opts.sort] ?? "views");
  const typeFilter = opts.type ? sql`and c.type = ${opts.type}` : sql``;
  const categoryFilter = opts.categoryId
    ? sql`and exists (
        select 1 from topic_categories cc
        where cc.topic_id = c.id and cc.category_id = ${opts.categoryId}::uuid
      )`
    : sql``;

  const rows = await db.execute<TopContentRow & Record<string, unknown>>(sql`
    select
      c.id::text        as id,
      c.slug            as slug,
      c.title           as title,
      c.type            as type,
      c.status          as status,
      (select count(*) from analytics_events ae
         where ae.topic_id = c.id
           and ae.event in ('content_opened','video_started','post_read')
           and ae.created_at between ${opts.range.from.toISOString()}::timestamptz and ${opts.range.to.toISOString()}::timestamptz)::int as views,
      (select count(*) from likes l
         where l.topic_id = c.id
           and l.created_at between ${opts.range.from.toISOString()}::timestamptz and ${opts.range.to.toISOString()}::timestamptz)::int as likes,
      (select count(*) from comments cm
         where cm.topic_id = c.id and cm.status <> 'deleted'
           and cm.created_at between ${opts.range.from.toISOString()}::timestamptz and ${opts.range.to.toISOString()}::timestamptz)::int as comments,
      (select count(*) from bookmarks b
         where b.topic_id = c.id
           and b.created_at between ${opts.range.from.toISOString()}::timestamptz and ${opts.range.to.toISOString()}::timestamptz)::int as bookmarks
    from topics c
    where c.deleted_at is null
      ${typeFilter}
      ${categoryFilter}
    order by ${orderBy} desc, c.created_at desc
    limit ${opts.limit}
  `);

  return [...rows].map(normaliseTopContent);
}

function normaliseTopContent(r: TopContentRow): TopContentRow {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    type: String(r.type),
    status: String(r.status),
    views: Number(r.views),
    likes: Number(r.likes),
    comments: Number(r.comments),
    bookmarks: Number(r.bookmarks),
  };
}

/* ============================================================
   UNDERPERFORMING  (the actionable table)
   ============================================================ */

/** Below this many impressions the open rate is noise, not a signal. */
export const MIN_IMPRESSIONS = 20;

export interface UnderperformingRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  impressions: number;
  views: number;
  open_rate: number;
}

/**
 * Content people SEE in the feed but don't open - the highest-leverage thing an
 * editor can fix. Lifetime counters, because a thumbnail that never earns a
 * click is a lifetime problem, not a this-week problem.
 */
export async function underperforming(limit = 10): Promise<UnderperformingRow[]> {
  const rows = await db.execute<UnderperformingRow & Record<string, unknown>>(sql`
    select
      c.id::text as id,
      c.slug     as slug,
      c.title    as title,
      c.type     as type,
      c.impression_count::int as impressions,
      c.view_count::int       as views,
      coalesce(c.view_count::numeric / nullif(c.impression_count, 0), 0)::float8 as open_rate
    from topics c
    where c.deleted_at is null
      and c.status = 'published'
      and c.impression_count >= ${MIN_IMPRESSIONS}
    order by open_rate asc, c.impression_count desc
    limit ${limit}
  `);

  return [...rows].map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    type: String(r.type),
    impressions: Number(r.impressions),
    views: Number(r.views),
    open_rate: Number(r.open_rate),
  }));
}

/* ============================================================
   CATEGORIES
   ============================================================ */

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  content_count: number;
  total_views: number;
  avg_views_per_item: number;
}

export async function categoryPerformance(range: Range): Promise<CategoryRow[]> {
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    content_count: number;
    total_views: number;
  }>(sql`
    select
      cat.id::text as id,
      cat.slug     as slug,
      cat.name     as name,
      count(distinct c.id)::int as content_count,
      coalesce(sum(v.views), 0)::int as total_views
    from categories cat
    left join topic_categories cc on cc.category_id = cat.id
    left join topics c on c.id = cc.topic_id and c.deleted_at is null
    left join lateral (
      select count(*)::int as views
      from analytics_events ae
      where ae.topic_id = c.id
        and ae.event in ('content_opened','video_started','post_read')
        and ae.created_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
    ) v on c.id is not null
    where cat.is_active = true
    group by cat.id, cat.slug, cat.name
    order by total_views desc, cat.name asc
  `);

  return [...rows].map((r) => {
    const contentCount = Number(r.content_count);
    const totalViews = Number(r.total_views);
    return {
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      content_count: contentCount,
      total_views: totalViews,
      avg_views_per_item:
        contentCount > 0 ? Math.round((totalViews / contentCount) * 10) / 10 : 0,
    };
  });
}

/* ============================================================
   ORGANISATIONS  (counts only, k-anonymised)
   ============================================================ */

export interface OrgAggregate {
  id: string;
  name: string;
  type: string;
  /** True when the org is too small to report on without identifying someone. */
  suppressed: boolean;
  member_count: number | null;
  active_7d: number | null;
  enrolled_learners: number | null;
  episodes_completed: number | null;
}

/**
 * Per-organisation COUNTS and nothing else.
 *
 * There is no member list here, no names, no per-person activity and no way to
 * ask for one - the select list is literally identity columns of the ORG plus
 * count() expressions. Anything under MIN_CELL learners is blanked entirely.
 */
export async function organizationAggregates(range: Range): Promise<OrgAggregate[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    type: string;
    member_count: number;
    active_7d: number;
    enrolled_learners: number;
    episodes_completed: number;
  }>(sql`
    select
      o.id::text as id,
      o.name     as name,
      o.type     as type,
      count(distinct u.id)::int as member_count,
      count(distinct u.id) filter (
        where u.last_active_at >= now() - interval '7 days'
      )::int as active_7d,
      count(distinct u.id) filter (where en.enrollment_count > 0)::int as enrolled_learners,
      coalesce(sum(lp.completed_count), 0)::int as episodes_completed
    from organizations o
    left join users u
      on u.org_id = o.id and u.deleted_at is null
    -- Both of these are LATERAL scalars, one row per member. Joining the
    -- enrolments table directly would multiply the member rows and inflate
    -- every other count in the select list.
    left join lateral (
      select count(*)::int as enrollment_count
      from enrollments e
      where e.user_id = u.id
        and e.created_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
    ) en on u.id is not null
    left join lateral (
      select count(*)::int as completed_count
      from episode_progress p
      where p.user_id = u.id
        and p.completed = true
        and p.completed_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
    ) lp on u.id is not null
    group by o.id, o.name, o.type
    order by member_count desc, o.name asc
  `);

  return [...rows].map((r) => {
    const memberCount = Number(r.member_count);
    const suppressed = memberCount < MIN_CELL;
    return {
      id: String(r.id),
      name: String(r.name),
      type: String(r.type),
      suppressed,
      member_count: suppressed ? null : memberCount,
      active_7d: suppressed ? null : Number(r.active_7d),
      enrolled_learners: suppressed ? null : Number(r.enrolled_learners),
      episodes_completed: suppressed ? null : Number(r.episodes_completed),
    };
  });
}

/* ============================================================
   RETENTION  (D1 / D7 / D30 by signup cohort week)
   ============================================================ */

export interface RetentionRow {
  cohort_week: string;
  suppressed: boolean;
  cohort_size: number | null;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  /** Return rates 0-1, null when the cohort is suppressed. */
  d1_rate: number | null;
  d7_rate: number | null;
  d30_rate: number | null;
}

export async function retention(range: Range): Promise<RetentionRow[]> {
  const rows = await db.execute<{
    cohort_week: string;
    cohort_size: number;
    d1: number;
    d7: number;
    d30: number;
  }>(sql`
    with cohort as (
      select u.id, u.created_at, date_trunc('week', u.created_at) as cohort_week
      from users u
      where u.created_at between ${range.from.toISOString()}::timestamptz and ${range.to.toISOString()}::timestamptz
        and u.deleted_at is null
    ),
    per_user as (
      select
        c.cohort_week,
        c.id,
        bool_or(a.day_offset >= 1 and a.day_offset < 2)  as returned_d1,
        bool_or(a.day_offset >= 1 and a.day_offset <= 7)  as returned_d7,
        bool_or(a.day_offset >= 1 and a.day_offset <= 30) as returned_d30
      from cohort c
      left join lateral (
        select floor(
          extract(epoch from (ae.created_at - c.created_at)) / 86400
        )::int as day_offset
        from analytics_events ae
        where ae.user_id = c.id
      ) a on true
      group by c.cohort_week, c.id
    )
    select
      to_char(cohort_week, 'YYYY-MM-DD') as cohort_week,
      count(*)::int as cohort_size,
      count(*) filter (where returned_d1)::int  as d1,
      count(*) filter (where returned_d7)::int  as d7,
      count(*) filter (where returned_d30)::int as d30
    from per_user
    group by cohort_week
    order by cohort_week asc
  `);

  return [...rows].map((r) => {
    const size = Number(r.cohort_size);
    const suppressed = size < MIN_CELL;
    const rate = (n: number) => (size > 0 ? Math.round((n / size) * 1000) / 1000 : 0);
    if (suppressed) {
      return {
        cohort_week: String(r.cohort_week),
        suppressed: true,
        cohort_size: null,
        d1: null,
        d7: null,
        d30: null,
        d1_rate: null,
        d7_rate: null,
        d30_rate: null,
      };
    }
    return {
      cohort_week: String(r.cohort_week),
      suppressed: false,
      cohort_size: size,
      d1: Number(r.d1),
      d7: Number(r.d7),
      d30: Number(r.d30),
      d1_rate: rate(Number(r.d1)),
      d7_rate: rate(Number(r.d7)),
      d30_rate: rate(Number(r.d30)),
    };
  });
}

