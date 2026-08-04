import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commentReports, comments, topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { reportResolveSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/admin/reports/[id]/resolve  { action: 'hide' | 'dismiss' }
 *
 * 'hide' upholds the report and hides the comment; 'dismiss' clears it without
 * touching the comment. Every other open report on the same comment is closed
 * at the same time so two moderators can't act on the same content twice.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action, notes } = await parseBody(req, reportResolveSchema);

  const [report] = await db
    .select()
    .from(commentReports)
    .where(eq(commentReports.id, id))
    .limit(1);
  if (!report) throw new ApiError("NOT_FOUND", "Report not found.");
  if (report.status !== "open") {
    throw new ApiError("CONFLICT", "That report has already been resolved.");
  }

  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, report.commentId))
    .limit(1);
  if (!comment) throw new ApiError("NOT_FOUND", "The reported comment no longer exists.");

  const now = new Date();
  const hiding = action === "hide";

  await db.transaction(async (tx) => {
    // Close every open report on this comment, not just the one clicked.
    await tx
      .update(commentReports)
      .set({
        status: hiding ? "resolved" : "dismissed",
        resolvedBy: admin.id,
        resolvedAt: now,
        ...(notes ? { notes } : {}),
      })
      .where(
        and(
          eq(commentReports.commentId, report.commentId),
          eq(commentReports.status, "open"),
        ),
      );

    if (hiding && comment.status === "visible") {
      await tx
        .update(comments)
        .set({ status: "hidden", hiddenBy: admin.id, hiddenAt: now, updatedAt: now })
        .where(eq(comments.id, comment.id));

      await tx
        .update(topics)
        .set({
          commentCount: sql`greatest(0, ${topics.commentCount} - 1)`,
          updatedAt: now,
        })
        .where(eq(topics.id, comment.topicId));
    }
  });

  await audit({
    actorId: admin.id,
    action: hiding ? "admin.report_upheld" : "admin.report_dismissed",
    entityType: "comment_report",
    entityId: id,
    metadata: {
      comment_id: report.commentId,
      topic_id: comment.topicId,
      reason: report.reason,
    },
    ipAddress: clientIp(req),
  });

  return ok({
    report: { id, status: hiding ? "resolved" : "dismissed" },
    comment: { id: comment.id, status: hiding ? "hidden" : comment.status },
  });
});
