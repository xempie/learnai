import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { commentReports, comments, topics, users } from "@/db/schema";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { adminCommentListSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/comments?status=&reported=
 *
 * The moderation queue. Each row carries the topic it sits on and how many
 * reports are open against it, so a moderator can judge without opening tabs.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, adminCommentListSchema);

  const filters = [
    query.status ? eq(comments.status, query.status) : ne(comments.status, "deleted"),
    query.reported === true ? gt(comments.reportCount, 0) : undefined,
    query.reported === false ? eq(comments.reportCount, 0) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      status: comments.status,
      reportCount: comments.reportCount,
      hiddenAt: comments.hiddenAt,
      createdAt: comments.createdAt,
      authorId: comments.userId,
      authorNickname: users.nickname,
      topicId: topics.id,
      topicTitle: topics.title,
      topicSlug: topics.slug,
      topicType: topics.type,
      openReports: sql<number>`(
        select count(*)::int from ${commentReports}
        where ${commentReports.commentId} = ${comments.id}
          and ${commentReports.status} = 'open'
      )`,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(...filters))
    .orderBy(desc(comments.reportCount), desc(comments.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      report_count: r.reportCount,
      open_reports: Number(r.openReports),
      hidden_at: r.hiddenAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString(),
      author: { id: r.authorId, nickname: r.authorNickname },
      topic: {
        id: r.topicId,
        title: r.topicTitle,
        slug: r.topicSlug,
        type: r.topicType,
      },
    })),
  });
});
