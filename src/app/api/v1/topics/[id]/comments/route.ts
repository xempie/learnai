import { type SQL, and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, topics, users } from "@/db/schema";
import {
  ApiError,
  decodeCursor,
  encodeCursor,
  handler,
  ok,
  parseBody,
  parseQuery,
  rateLimit,
} from "@/lib/api";
import { getCurrentUser, requireAuth } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { config } from "@/lib/config";
import { notifyCommentPosted, priorCommenterIds } from "@/lib/notifications";
import {
  NEW_ACCOUNT_URL_BLOCK_MS,
  type TimeCursor,
  containsUrl,
  createCommentSchema,
  loadEngageableTopic,
  pagedQuerySchema,
  requireUuidParam,
  sanitiseCommentBody,
  serialiseComment,
} from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Comments on a piece of content. Flat - no threading, no markdown, no edits
 * (V1_BUILD_SPEC §4.4). Everything here is gated on FEATURE_COMMENTS so the
 * whole surface can be switched off without a deploy.
 */

function assertCommentsEnabled(): void {
  if (!config.flags.comments) {
    throw new ApiError("NOT_CONFIGURED", "Comments are turned off right now.");
  }
}

const COMMENT_WINDOW_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------------ GET */

export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    assertCommentsEnabled();
    const { id } = await ctx.params;
    const topicId = requireUuidParam(id, "topic");
    const q = parseQuery(req, pagedQuerySchema);
    const viewer = await getCurrentUser();

    await loadEngageableTopic(topicId);

    const where: SQL[] = [
      eq(comments.topicId, topicId),
      // Hidden and deleted comments never leave the server.
      eq(comments.status, "visible"),
    ];

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
        reportCount: comments.reportCount,
        createdAt: comments.createdAt,
        userId: comments.userId,
        authorNickname: users.nickname,
        authorAvatarKey: users.avatarKey,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(and(...where))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(q.limit);

    const last = rows[rows.length - 1];
    return ok({
      data: rows.map((r) => serialiseComment(r, viewer?.id ?? null)),
      next_cursor:
        rows.length === q.limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    });
  },
);

/* ----------------------------------------------------------------- POST */

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    assertCommentsEnabled();
    const { id } = await ctx.params;
    const topicId = requireUuidParam(id, "topic");
    const user = await requireAuth();

    // Guardrail 1 - throughput. Per user, not per IP: a shared campus NAT must
    // not silence a whole university.
    rateLimit(
      `comment:${user.id}`,
      config.limits.commentRateLimitPer10Min,
      COMMENT_WINDOW_MS,
    );

    const topic = await loadEngageableTopic(topicId);
    const input = await parseBody(req, createCommentSchema);

    // Guardrail 3 - plain text, 1-2000 chars. Throws a 422 with a field map.
    const body = sanitiseCommentBody(input.body);

    // Guardrail 2 - brand-new accounts may not post links. This is the single
    // highest-yield spam filter for a product with open sign-up.
    const account = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { createdAt: true },
    });
    const ageMs = Date.now() - (account?.createdAt?.getTime() ?? 0);
    if (ageMs < NEW_ACCOUNT_URL_BLOCK_MS && containsUrl(body)) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "New accounts can't post links yet. You'll be able to share links 24 hours after signing up.",
        { body: "Remove the link and try again." },
      );
    }

    // Guardrail 4 - the comment and the denormalised counter move together.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(comments)
        .values({ topicId, userId: user.id, body })
        .returning({ id: comments.id, createdAt: comments.createdAt });

      const [topic2] = await tx
        .update(topics)
        .set({ commentCount: sql`${topics.commentCount} + 1`, updatedAt: new Date() })
        .where(eq(topics.id, topicId))
        .returning({ commentCount: topics.commentCount });

      if (!row) throw new ApiError("SERVER_ERROR", "Could not save that comment.");
      return { ...row, commentCount: topic2?.commentCount ?? 1 };
    });

    // Fan-out happens after the transaction commits: a notification failure must
    // never roll back someone's comment.
    const priors = await priorCommenterIds(topicId, user.id);
    await notifyCommentPosted({
      topicId,
      actorId: user.id,
      actorNickname: user.nickname,
      topicTitle: topic.title,
      topicType: topic.type,
      topicSlug: topic.slug,
      topicAuthorId: topic.authorId ?? topic.ownerId ?? null,
      priorCommenterIds: priors,
    });

    await track([
      { userId: user.id, event: "comment_posted", topicId, metadata: { length: body.length } },
    ]);

    return ok(
      {
        comment: serialiseComment(
          {
            id: created.id,
            body,
            status: "visible",
            reportCount: 0,
            createdAt: created.createdAt,
            userId: user.id,
            authorNickname: user.nickname,
            authorAvatarKey: user.avatarKey,
          },
          user.id,
        ),
        comment_count: created.commentCount,
      },
      201,
    );
  },
);
