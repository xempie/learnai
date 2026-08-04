/**
 * GET  /api/v1/admin/topics/[id]/episodes - ordered episodes
 * POST /api/v1/admin/topics/[id]/episodes - create one
 *
 * The insert and the counter rewrite share a transaction, so `episodeCount` and
 * `totalDurationSec` can never drift from the rows they describe.
 */

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, episodes } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { recomputeTopicCounters, serialiseEpisode, uniqueEpisodeSlug } from "@/lib/topics";
import { config } from "@/lib/config";
import { createEpisodeSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function topicOr404(id: string) {
  const row = await db.query.topics.findFirst({
    where: eq(topics.id, id),
    columns: { id: true, slug: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");
  return row;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const topic = await topicOr404(id);

  const rows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.topicId, topic.id))
    .orderBy(asc(episodes.sortOrder), asc(episodes.createdAt));

  return ok({ data: rows.map((l) => serialiseEpisode(l, { includeKeys: true })) });
});

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const topic = await topicOr404(id);
  const input = await parseBody(req, createEpisodeSchema);

  // The DB has a check constraint too; validating here gives a readable message
  // instead of a driver error.
  const duration = input.durationSec ?? 0;
  if (duration > config.limits.maxEpisodeDurationSec) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `Episodes must be ${config.limits.maxEpisodeDurationSec} seconds or shorter.`,
      { durationSec: "Too long." },
    );
  }

  const created = await db.transaction(async (tx) => {
    const slug = await uniqueEpisodeSlug(tx, topic.id, input.title);

    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const [agg] = await tx
        .select({ next: sql<number>`coalesce(max(${episodes.sortOrder}), -1) + 1` })
        .from(episodes)
        .where(eq(episodes.topicId, topic.id));
      sortOrder = agg?.next ?? 0;
    }

    const [row] = await tx
      .insert(episodes)
      .values({
        topicId: topic.id,
        slug,
        title: input.title,
        description: input.description ?? null,
        sortOrder,
        videoS3Key: input.videoS3Key ?? null,
        hlsManifestKey: input.hlsManifestKey ?? null,
        thumbnailKey: input.thumbnailKey ?? null,
        captionsKey: input.captionsKey ?? null,
        durationSec: duration,
        uploadStatus: input.uploadStatus ?? "pending",
        isPreview: input.isPreview ?? false,
      })
      .returning();

    if (!row) throw new ApiError("SERVER_ERROR", "Could not create the episode.");

    await recomputeTopicCounters(tx, topic.id);
    return row;
  });

  await audit({
    actorId: admin.id,
    action: "episode.created",
    entityType: "episode",
    entityId: created.id,
    metadata: { topic_id: topic.id, duration_sec: created.durationSec },
    ipAddress: clientIp(req),
  });

  return ok(serialiseEpisode(created, { includeKeys: true }), 201);
});
