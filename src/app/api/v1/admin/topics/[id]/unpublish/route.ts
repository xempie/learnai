/**
 * POST /api/v1/admin/topics/[id]/unpublish
 *
 * Deliberately has NO preconditions beyond "the topic exists". Publishing is
 * the gated direction; taking something down must always work first try, at
 * speed, on day one - the day you need it is the day a claim turns out to be
 * wrong and every minute it stays up is a minute someone acts on it.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const topic = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!topic) throw new ApiError("NOT_FOUND", "Topic not found.");

    const now = new Date();
    const [row] = await db
      .update(topics)
      .set({
        status: "unpublished",
        // Clear any pending schedule so it cannot re-publish itself later.
        publishAt: null,
        updatedAt: now,
      })
      .where(eq(topics.id, topic.id))
      .returning();

    await audit({
      actorId: admin.id,
      action: "topic.unpublished",
      entityType: "topic",
      entityId: topic.id,
      metadata: { slug: topic.slug, previous_status: topic.status },
      ipAddress: clientIp(req),
    });

    return ok({
      id: topic.id,
      slug: topic.slug,
      status: row?.status ?? "unpublished",
      // published_at is retained: it records when it *was* live.
      published_at: row?.publishedAt?.toISOString() ?? null,
    });
  },
);
