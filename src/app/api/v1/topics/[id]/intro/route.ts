/**
 * GET|POST /api/v1/topics/[id]/intro
 *
 * A signed URL for the "why take this topic" intro video.
 *
 * NO ENTITLEMENT CHECK, by design: the intro is the sales pitch, so gating it
 * behind the thing it is selling would be self-defeating. It still requires a
 * signed-in user, because every signed media URL we hand out must be
 * attributable to an account.
 *
 * GET and POST both work: GET so the player can fetch it like any other read,
 * POST so a client that wants a non-cacheable request can have one.
 */

import { ApiError, clientIp, handler, ok, rateLimit } from "@/lib/api";
import { track } from "@/lib/audit";
import { isAdminRole, requireAuth } from "@/lib/auth/session";
import { findTopicByIdOrSlug } from "@/lib/topics";
import { publicAssetUrl, signedMediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 3600;

type Ctx = { params: Promise<{ id: string }> };

async function intro(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await requireAuth();

  rateLimit(`intro:${user.id}:${clientIp(req)}`, 60, 60_000);

  const topic = await findTopicByIdOrSlug(id);
  const admin = isAdminRole(user.role);
  if (!topic || topic.deletedAt || (!admin && topic.status !== "published")) {
    throw new ApiError("NOT_FOUND", "Topic not found.");
  }

  // Not every topic has one, and a missing intro is a 404 rather than a null
  // playback URL so the client never tries to open an empty player.
  if (!topic.introVideoKey) {
    throw new ApiError("NOT_FOUND", "This topic does not have an intro video.");
  }

  const playbackUrl = signedMediaUrl(topic.introVideoKey, TTL_SECONDS);
  const captionsUrl = signedMediaUrl(topic.introCaptionsKey, TTL_SECONDS);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await track([
    {
      userId: user.id,
      event: "video_started",
      topicId: topic.id,
      metadata: { intro: true },
    },
  ]);

  return ok({
    playback_url: playbackUrl,
    captions_url: captionsUrl,
    duration_sec: topic.introDurationSec ?? 0,
    // Poster frames are not sensitive, so they are served unsigned. Falls back
    // to the topic thumbnail when no intro-specific still was uploaded.
    thumbnail_url: publicAssetUrl(topic.introThumbnailKey ?? topic.thumbnailKey),
    expires_at: expiresAt.toISOString(),
  });
}

export const GET = handler(intro);
export const POST = handler(intro);
