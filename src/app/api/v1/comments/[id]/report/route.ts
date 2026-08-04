import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commentReports, comments } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { reportCommentSchema, requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * POST /api/v1/comments/:id/report
 *
 * One report per user per comment, enforced by the `comment_reports_once`
 * unique index. The conflict is caught rather than pre-checked so two taps in
 * the same second can't both slip through and double-count the report.
 */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    if (!config.flags.comments) {
      throw new ApiError("NOT_CONFIGURED", "Comments are turned off right now.");
    }

    const { id } = await ctx.params;
    const commentId = requireUuidParam(id, "comment");
    const user = await requireAuth();
    const input = await parseBody(req, reportCommentSchema);

    const target = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
      columns: { id: true, userId: true, topicId: true, status: true },
    });
    if (!target || target.status === "deleted") {
      throw new ApiError("NOT_FOUND", "That comment does not exist.");
    }
    if (target.userId === user.id) {
      throw new ApiError("BAD_REQUEST", "You can't report your own comment.");
    }

    let reportCount: number;
    try {
      reportCount = await db.transaction(async (tx) => {
        await tx.insert(commentReports).values({
          commentId,
          reporterId: user.id,
          reason: input.reason,
          notes: input.notes ?? null,
        });

        const [row] = await tx
          .update(comments)
          .set({ reportCount: sql`${comments.reportCount} + 1`, updatedAt: new Date() })
          .where(eq(comments.id, commentId))
          .returning({ reportCount: comments.reportCount });

        return row?.reportCount ?? 1;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(
          "CONFLICT",
          "You've already reported this comment. Our team is on it.",
        );
      }
      throw err;
    }

    await audit({
      actorId: user.id,
      action: "comment.report",
      entityType: "comment",
      entityId: commentId,
      metadata: { reason: input.reason, topicId: target.topicId },
      ipAddress: clientIp(req),
    });

    return ok({ reported: true, report_count: reportCount }, 201);
  },
);
