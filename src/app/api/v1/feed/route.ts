import { type SQL, and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookmarks,
  categories,
  topicCategories,
  topics,
  likes,
  userCategories,
} from "@/db/schema";
import { ApiError, decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  BACKFILL_LABEL,
  THIN_CATEGORY_THRESHOLD,
  type TopicCardRow,
  type TimeCursor,
  topicCardColumns,
  feedQuerySchema,
  serialiseCard,
} from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/feed
 *
 * Reverse-chronological. There is deliberately NO ranking model, no engagement
 * score and no personalisation beyond "did you pick this category" - V1 ships a
 * feed people can reason about (V1_BUILD_SPEC §4.1).
 *
 * `for_you`  - published items in the caller's three chosen categories.
 * `everything` - unfiltered.
 * `updates` - articles only (`topics.type = "article"`); no category filter,
 *   no personalisation, no backfill.
 *
 * When `for_you` is thin (a new category, a quiet week) the first page tops up
 * from everything-else and returns those in a SEPARATE `backfill` array so the
 * UI can head the section "Popular across Acadu". Blending them silently would
 * make the feed look personalised when it isn't.
 */

/** Sentinel so the like/bookmark left joins have one code path when signed out. */
const NO_USER = "00000000-0000-0000-0000-000000000000";

/** Published-at with a created-at fallback, so an unset column can't hide a row. */
const publishedTs = sql`coalesce(${topics.publishedAt}, ${topics.createdAt})`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCategoryId(value: string): Promise<string> {
  if (UUID_RE.test(value)) return value;
  const row = await db.query.categories.findFirst({
    where: eq(categories.slug, value.toLowerCase()),
    columns: { id: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "That category does not exist.");
  return row.id;
}

/** Topic ids in a given set of categories, as a subquery (no id round-trip). */
function topicsInCategory(categoryId: string) {
  return db
    .select({ id: topicCategories.topicId })
    .from(topicCategories)
    .where(eq(topicCategories.categoryId, categoryId));
}

/** Topic ids in ANY category the user follows. */
function topicsInUserCategories(userId: string) {
  return db
    .select({ id: topicCategories.topicId })
    .from(topicCategories)
    .innerJoin(userCategories, eq(userCategories.categoryId, topicCategories.categoryId))
    .where(eq(userCategories.userId, userId));
}

interface PageOpts {
  viewerId: string;
  type: string;
  limit: number;
  cursor: TimeCursor | null;
  extra: SQL[];
}

/**
 * One query per section. `liked`/`bookmarked` come from left joins on the
 * caller's own rows - never a per-item lookup.
 */
async function fetchPage(opts: PageOpts): Promise<TopicCardRow[]> {
  const where: SQL[] = [
    eq(topics.status, "published"),
    eq(topics.type, opts.type),
    isNull(topics.deletedAt),
    ...opts.extra,
  ];

  if (opts.cursor) {
    // Keyset pagination on the exact sort key, so a publish mid-scroll cannot
    // duplicate or skip a row the way OFFSET would.
    where.push(
      sql`(${publishedTs}, ${topics.id}) < (${opts.cursor.t}::timestamptz, ${opts.cursor.id}::uuid)`,
    );
  }

  return db
    .select({
      ...topicCardColumns,
      liked: sql<boolean>`${likes.userId} is not null`,
      bookmarked: sql<boolean>`${bookmarks.userId} is not null`,
    })
    .from(topics)
    .leftJoin(likes, and(eq(likes.topicId, topics.id), eq(likes.userId, opts.viewerId)))
    .leftJoin(
      bookmarks,
      and(eq(bookmarks.topicId, topics.id), eq(bookmarks.userId, opts.viewerId)),
    )
    .where(and(...where))
    .orderBy(sql`${publishedTs} desc`, desc(topics.id))
    .limit(opts.limit);
}

function cursorFor(rows: TopicCardRow[]): string | null {
  const last = rows[rows.length - 1];
  if (!last) return null;
  const t = last.publishedAt ?? last.createdAt;
  return encodeCursor({ t: t.toISOString(), id: last.id });
}

export const GET = handler(async (req: Request) => {
  const q = parseQuery(req, feedQuerySchema);
  const user = await getCurrentUser();

  if (q.tab === "for_you" && !user) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to see your feed.");
  }

  const viewerId = user?.id ?? NO_USER;
  const cursor = decodeCursor<TimeCursor>(q.cursor ?? null);
  const extra: SQL[] = [];

  // `updates` is articles-only and ignores category filters - it isn't a
  // narrowed view of the personalised/everything feeds, it's a separate stream.
  const type = q.tab === "updates" ? "article" : q.type;

  if (q.tab !== "updates" && q.category) {
    extra.push(inArray(topics.id, topicsInCategory(await resolveCategoryId(q.category))));
  }

  // An explicit category filter already narrows the feed; layering the user's
  // three categories on top of it would return an empty page for any category
  // they haven't chosen.
  const personalised = q.tab === "for_you" && user !== null && !q.category;
  if (personalised && user) {
    extra.push(inArray(topics.id, topicsInUserCategories(user.id)));
  }

  const items = await fetchPage({
    viewerId,
    type,
    limit: q.limit,
    cursor,
    extra,
  });

  /* ---- thin-category backfill (first page only) ---- */
  let backfill: TopicCardRow[] = [];
  if (personalised && user && !cursor && items.length < THIN_CATEGORY_THRESHOLD) {
    const want = Math.max(THIN_CATEGORY_THRESHOLD - items.length, q.limit - items.length);
    const exclude: SQL[] = [notInArray(topics.id, topicsInUserCategories(user.id))];
    if (items.length > 0) {
      exclude.push(
        notInArray(
          topics.id,
          items.map((i) => i.id),
        ),
      );
    }
    backfill = await fetchPage({
      viewerId,
      type,
      limit: want,
      cursor: null,
      extra: exclude,
    });
  }

  return ok({
    tab: q.tab,
    type,
    data: items.map(serialiseCard),
    next_cursor: items.length === q.limit ? cursorFor(items) : null,
    /** Kept separate from `data` on purpose - see the note at the top. */
    backfill: backfill.map(serialiseCard),
    backfill_label: backfill.length > 0 ? BACKFILL_LABEL : null,
  });
});
