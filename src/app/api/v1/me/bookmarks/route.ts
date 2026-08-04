import { type SQL, and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookmarks, topics, likes } from "@/db/schema";
import { decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import {
  type TimeCursor,
  topicCardColumns,
  pagedQuerySchema,
  serialiseCard,
} from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me/bookmarks - saved items as feed cards.
 *
 * Ordered by when they were SAVED, not when they were published: this is a
 * reading list, and the thing you saved last is the thing you're looking for.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireAuth();
  const q = parseQuery(req, pagedQuerySchema);

  const where: SQL[] = [eq(bookmarks.userId, user.id), isNull(topics.deletedAt)];

  const cursor = decodeCursor<TimeCursor>(q.cursor ?? null);
  if (cursor) {
    where.push(
      sql`(${bookmarks.createdAt}, ${bookmarks.topicId}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      ...topicCardColumns,
      savedAt: bookmarks.createdAt,
      liked: sql<boolean>`${likes.userId} is not null`,
      bookmarked: sql<boolean>`true`,
    })
    .from(bookmarks)
    .innerJoin(topics, eq(topics.id, bookmarks.topicId))
    .leftJoin(likes, and(eq(likes.topicId, topics.id), eq(likes.userId, user.id)))
    .where(and(...where))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.topicId))
    .limit(q.limit);

  const last = rows[rows.length - 1];
  return ok({
    data: rows.map((row) => ({
      ...serialiseCard(row),
      saved_at: row.savedAt.toISOString(),
    })),
    next_cursor:
      rows.length === q.limit && last
        ? encodeCursor({ t: last.savedAt.toISOString(), id: last.id })
        : null,
  });
});
