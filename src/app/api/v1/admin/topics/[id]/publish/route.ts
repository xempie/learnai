/**
 * POST /api/v1/admin/topics/[id]/publish  { publishAt? }
 *
 * `assertPublishable` is the gate: at least one category, at least one episode,
 * and captions on every one of them. A topic that cannot be captioned cannot be
 * published - that is the accessibility promise, not a nice-to-have.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { clientIp, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assertPublishable } from "@/lib/topics";

import { publishSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = await parseBody(req, publishSchema);

    const topic = await assertPublishable(id);

    const now = new Date();
    const publishAt = input.publishAt ?? null;
    const scheduled = publishAt !== null && publishAt.getTime() > now.getTime();

    const [row] = await db
      .update(topics)
      .set(
        scheduled
          ? { status: "scheduled", publishAt, publishedAt: null, updatedAt: now }
          : {
              status: "published",
              publishAt: null,
              // Keep the original publish date on a re-publish so the catalogue
              // ordering doesn't jump when a typo is fixed.
              publishedAt: topic.publishedAt ?? now,
              updatedAt: now,
            },
      )
      .where(eq(topics.id, topic.id))
      .returning();

    await audit({
      actorId: admin.id,
      action: scheduled ? "topic.scheduled" : "topic.published",
      entityType: "topic",
      entityId: topic.id,
      metadata: {
        slug: topic.slug,
        publish_at: publishAt?.toISOString() ?? null,
        previous_status: topic.status,
      },
      ipAddress: clientIp(req),
    });

    return ok({
      id: topic.id,
      slug: topic.slug,
      status: row?.status ?? (scheduled ? "scheduled" : "published"),
      publish_at: row?.publishAt?.toISOString() ?? null,
      published_at: row?.publishedAt?.toISOString() ?? null,
    });
  },
);
