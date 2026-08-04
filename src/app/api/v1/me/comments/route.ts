import { type SQL, and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, topics } from "@/db/schema";
import { decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import {
  type TimeCursor,
  contentPath,
  pagedQuerySchema,
} from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me/comments - the caller's own comment history.
 *
 * Carries the topic title and slug so every row can link straight back to
 * where it was posted; without that the list is a wall of context-free text.
 * Hidden comments are still shown to their author (with the flag) - silently
 * hiding someone's own comment from them reads as a bug.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireAuth();
  const q = parseQuery(req, pagedQuerySchema);

  const where: SQL[] = [eq(comments.userId, user.id), ne(comments.status, "deleted")];

  const cursor = decodeCursor<TimeCursor>(q.cursor ?? null);
  if (cursor) {
    where.push(
      sql`(${comments.createdAt}, ${comments.id}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      status: comments.status,
      createdAt: comments.createdAt,
      topicId: topics.id,
      topicType: topics.type,
      topicSlug: topics.slug,
      topicTitle: topics.title,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .where(and(...where))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(q.limit);

  const last = rows[rows.length - 1];
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      is_hidden: r.status === "hidden",
      created_at: r.createdAt.toISOString(),
      topic: {
        id: r.topicId,
        type: r.topicType,
        slug: r.topicSlug,
        title: r.topicTitle,
        href: contentPath(r.topicType, r.topicSlug),
      },
    })),
    next_cursor:
      rows.length === q.limit && last
        ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
        : null,
  });
});
