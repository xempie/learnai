/**
 * POST /api/v1/topics/[id]/playback  { episodeId }
 *
 * ORDER MATTERS. Entitlements are resolved and `canAccessEpisode()` is called
 * BEFORE `signedMediaUrl()` runs. A signed URL that has been handed out cannot
 * be recalled, so signing first and checking afterwards would leak the video to
 * anyone who watched the response - even if we then returned a 403.
 *
 * The gate is PER EPISODE, not per topic: a non-paying account - trial included -
 * gets the first `previewEpisodeCount` episodes plus anything flagged `isPreview`,
 * and nothing else.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, episodes } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { requireAuth, isAdminRole } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { findTopicByIdOrSlug } from "@/lib/topics";
import { canAccessEpisode, getEntitlements } from "@/lib/entitlements";
import { playbackSchema } from "@/lib/schemas/content";
import { signedMediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 3600;

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await requireAuth();

    rateLimit(`playback:${user.id}:${clientIp(req)}`, 60, 60_000);

    const { episodeId } = await parseBody(req, playbackSchema);

    const topic = await findTopicByIdOrSlug(id);
    const admin = isAdminRole(user.role);
    if (!topic || topic.deletedAt || (!admin && topic.status !== "published")) {
      throw new ApiError("NOT_FOUND", "Topic not found.");
    }

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    if (!episode || episode.topicId !== topic.id) {
      throw new ApiError("NOT_FOUND", "Episode not found.");
    }

    /* ---- 1. entitlement gate (before anything is signed) ---- */
    const entitlements = await getEntitlements(user.id);
    const decision = await canAccessEpisode(
      user.id,
      topic.id,
      { id: episode.id, sortOrder: episode.sortOrder, isPreview: episode.isPreview },
      { entitlements },
    );

    if (!decision.allowed) {
      throw new ApiError(
        "ENTITLEMENT_REQUIRED",
        "Start a free trial or subscribe to watch this episode.",
        {
          upgrade: {
            tier: entitlements.tier,
            reason: entitlements.reason,
            trial_ends_at: entitlements.trialEndsAt?.toISOString() ?? null,
            checkout_path: "/settings?tab=billing",
            topic_id: topic.id,
            topic_slug: topic.slug,
          },
        },
      );
    }

    /* ---- 2. only now do we sign ---- */
    const mediaKey = episode.hlsManifestKey ?? episode.videoS3Key;
    if (!mediaKey || episode.uploadStatus === "failed") {
      throw new ApiError("CONFLICT", "This episode's video is not ready yet.");
    }

    const playbackUrl = signedMediaUrl(mediaKey, TTL_SECONDS);
    const captionsUrl = signedMediaUrl(episode.captionsKey, TTL_SECONDS);
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    /* ---- 3. counters + analytics (never client-supplied) ---- */
    await db
      .update(topics)
      .set({ viewCount: sql`${topics.viewCount} + 1` })
      .where(eq(topics.id, topic.id));

    await track([
      {
        userId: user.id,
        event: "video_started",
        topicId: topic.id,
        episodeId: episode.id,
        metadata: { access_reason: decision.reason, is_preview: episode.isPreview },
      },
    ]);

    return ok({
      episode_id: episode.id,
      playback_url: playbackUrl,
      captions_url: captionsUrl,
      duration_sec: episode.durationSec,
      expires_at: expiresAt.toISOString(),
      access_reason: decision.reason,
    });
  },
);
