/**
 * PATCH  /api/v1/admin/episodes/[id]
 * DELETE /api/v1/admin/episodes/[id]
 *
 * Both keep the owning topic's denormalised counters correct inside the same
 * transaction as the mutation.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { ApiError, clientIp, handler, noContent, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { recomputeTopicCounters, serialiseEpisode, uniqueEpisodeSlug } from "@/lib/topics";
import { config } from "@/lib/config";
import { updateEpisodeSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function episodeOr404(id: string) {
  const row = await db.query.episodes.findFirst({ where: eq(episodes.id, id) });
  if (!row) throw new ApiError("NOT_FOUND", "Episode not found.");
  return row;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const episode = await episodeOr404(id);
  return ok(serialiseEpisode(episode, { includeKeys: true }));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await episodeOr404(id);
  const input = await parseBody(req, updateEpisodeSchema);

  if (
    input.durationSec !== undefined &&
    input.durationSec > config.limits.maxEpisodeDurationSec
  ) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `Episodes must be ${config.limits.maxEpisodeDurationSec} seconds or shorter.`,
      { durationSec: "Too long." },
    );
  }

  const patch: Partial<typeof episodes.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.videoS3Key !== undefined) patch.videoS3Key = input.videoS3Key ?? null;
  if (input.hlsManifestKey !== undefined) patch.hlsManifestKey = input.hlsManifestKey ?? null;
  if (input.thumbnailKey !== undefined) patch.thumbnailKey = input.thumbnailKey ?? null;
  if (input.captionsKey !== undefined) patch.captionsKey = input.captionsKey ?? null;
  if (input.durationSec !== undefined) patch.durationSec = input.durationSec;
  if (input.isPreview !== undefined) patch.isPreview = input.isPreview;
  if (input.uploadStatus !== undefined) patch.uploadStatus = input.uploadStatus;

  const updated = await db.transaction(async (tx) => {
    if (input.title !== undefined && input.title !== existing.title) {
      patch.slug = await uniqueEpisodeSlug(tx, existing.topicId, input.title, {
        excludeId: existing.id,
      });
    }

    const [row] = await tx
      .update(episodes)
      .set(patch)
      .where(eq(episodes.id, existing.id))
      .returning();
    if (!row) throw new ApiError("NOT_FOUND", "Episode not found.");

    // durationSec may have moved, so the topic total must be rewritten now.
    await recomputeTopicCounters(tx, existing.topicId);
    return row;
  });

  await audit({
    actorId: admin.id,
    action: "episode.updated",
    entityType: "episode",
    entityId: updated.id,
    metadata: { topic_id: existing.topicId, fields: Object.keys(input) },
    ipAddress: clientIp(req),
  });

  return ok(serialiseEpisode(updated, { includeKeys: true }));
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await episodeOr404(id);

  await db.transaction(async (tx) => {
    await tx.delete(episodes).where(eq(episodes.id, existing.id));
    await recomputeTopicCounters(tx, existing.topicId);
  });

  await audit({
    actorId: admin.id,
    action: "episode.deleted",
    entityType: "episode",
    entityId: existing.id,
    metadata: { topic_id: existing.topicId, title: existing.title },
    ipAddress: clientIp(req),
  });

  return noContent();
});
