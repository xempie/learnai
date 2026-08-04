import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commentReports, comments, topics, users } from "@/db/schema";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { reportListSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/reports?status=open
 *
 * Open reports with the comment they refer to, the topic it sits on and the
 * reporter's stated reason - everything needed to decide in one screen.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, reportListSchema);

  const reporters = users;
  const rows = await db
    .select({
      id: commentReports.id,
      reason: commentReports.reason,
      notes: commentReports.notes,
      status: commentReports.status,
      createdAt: commentReports.createdAt,
      resolvedAt: commentReports.resolvedAt,
      reporterId: commentReports.reporterId,
      reporterNickname: reporters.nickname,
      commentId: comments.id,
      commentBody: comments.body,
      commentStatus: comments.status,
      commentReportCount: comments.reportCount,
      topicId: topics.id,
      topicTitle: topics.title,
      topicSlug: topics.slug,
    })
    .from(commentReports)
    .innerJoin(comments, eq(comments.id, commentReports.commentId))
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .innerJoin(reporters, eq(reporters.id, commentReports.reporterId))
    .where(eq(commentReports.status, query.status))
    .orderBy(desc(comments.reportCount), desc(commentReports.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok({
    status: query.status,
    data: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      notes: r.notes,
      status: r.status,
      created_at: r.createdAt.toISOString(),
      resolved_at: r.resolvedAt?.toISOString() ?? null,
      reporter: { id: r.reporterId, nickname: r.reporterNickname },
      comment: {
        id: r.commentId,
        body: r.commentBody,
        status: r.commentStatus,
        report_count: r.commentReportCount,
      },
      topic: { id: r.topicId, title: r.topicTitle, slug: r.topicSlug },
    })),
  });
});
