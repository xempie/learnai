/**
 * GET /api/v1/topics
 * Published catalogue, newest first, keyset paginated on (published_at, id).
 */

import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, topicCategories, topics, users } from "@/db/schema";
import { type Page, decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { loadCategoriesByTopic, promoteDueScheduledTopics, serialiseTopicCard } from "@/lib/topics";
import { freeTopicIds } from "@/lib/entitlements";
import { topicListQuery } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TopicCursor {
  p: string;
  i: string;
}

export const GET = handler(async (req: Request) => {
  // No cron in this deployment - scheduled topics flip on catalogue reads.
  await promoteDueScheduledTopics();

  const q = parseQuery(req, topicListQuery);
  const cursor = decodeCursor<TopicCursor>(q.cursor ?? null);

  const filters = [
    eq(topics.status, "published"),
    isNull(topics.deletedAt),
    isNotNull(topics.publishedAt),
    eq(topics.type, q.type),
  ];

  if (q.level) filters.push(eq(topics.skillLevel, q.level));

  if (q.q) {
    const needle = `%${q.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const match = or(
      ilike(topics.title, needle),
      ilike(topics.subtitle, needle),
      ilike(topics.excerpt, needle),
    );
    if (match) filters.push(match);
  }

  if (q.category) {
    const catIds = db
      .select({ topicId: topicCategories.topicId })
      .from(topicCategories)
      .innerJoin(categories, eq(categories.id, topicCategories.categoryId))
      .where(
        or(eq(categories.slug, q.category), sql`${categories.id}::text = ${q.category}`),
      );
    filters.push(inArray(topics.id, catIds));
  }

  if (cursor) {
    const at = new Date(cursor.p);
    const keyset = or(
      lt(topics.publishedAt, at),
      and(eq(topics.publishedAt, at), lt(topics.id, cursor.i)),
    );
    if (keyset) filters.push(keyset);
  }

  const rows = await db
    .select({
      id: topics.id,
      type: topics.type,
      slug: topics.slug,
      title: topics.title,
      excerpt: topics.excerpt,
      thumbnailKey: topics.thumbnailKey,
      skillLevel: topics.skillLevel,
      episodeCount: topics.episodeCount,
      totalDurationSec: topics.totalDurationSec,
      viewCount: topics.viewCount,
      publishedAt: topics.publishedAt,
      authorName: users.nickname,
    })
    .from(topics)
    .leftJoin(users, eq(users.id, topics.authorId))
    .where(and(...filters))
    .orderBy(desc(topics.publishedAt), desc(topics.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  const [categoryMap, freeIds] = await Promise.all([
    loadCategoriesByTopic(page.map((r) => r.id)),
    freeTopicIds(),
  ]);
  const free = new Set(freeIds);

  const last = page[page.length - 1];
  const body: Page<ReturnType<typeof serialiseTopicCard>> = {
    data: page.map((r) =>
      serialiseTopicCard(r, {
        categories: categoryMap.get(r.id) ?? [],
        isFree: free.has(r.id),
      }),
    ),
    next_cursor:
      hasMore && last?.publishedAt
        ? encodeCursor({ p: last.publishedAt.toISOString(), i: last.id })
        : null,
  };

  return ok(body);
});
