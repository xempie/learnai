/**
 * GET /api/v1/topics/[id]
 * Accepts either a UUID or a slug.
 * Full detail. 404 unless published - admins may fetch any status.
 */

import { ApiError, handler, ok } from "@/lib/api";
import {
  authorName,
  findTopicByIdOrSlug,
  loadTopicRelations,
  serialiseTopicDetail,
} from "@/lib/topics";
import {
  type AccessDecision,
  canAccessTopic,
  freeTopicIds,
  unlockedEpisodeCount,
} from "@/lib/entitlements";
import { config } from "@/lib/config";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const viewer = await getCurrentUser();
    const admin = viewer ? isAdminRole(viewer.role) : false;

    const topic = await findTopicByIdOrSlug(id);
    // Same 404 for missing, deleted and unpublished: an unpublished slug must not
    // be probeable by an anonymous caller.
    if (!topic || topic.deletedAt || (!admin && topic.status !== "published")) {
      throw new ApiError("NOT_FOUND", "Topic not found.");
    }

    const [rel, author] = await Promise.all([
      loadTopicRelations(topic.id),
      authorName(topic.authorId),
    ]);

    const freeIds = await freeTopicIds();
    const isFree = freeIds.includes(topic.id);

    let entitlement: AccessDecision;
    if (viewer) {
      entitlement = await canAccessTopic(viewer.id, topic.id);
    } else {
      entitlement = isFree
        ? { allowed: true, reason: "free_topic" }
        : { allowed: false, reason: "entitlement_required" };
    }

    /**
     * How much of this topic the viewer may watch, resolved ONCE. The
     * serialiser derives every episode's `locked` flag from it, so the response
     * carries the rule's answer rather than the rule.
     */
    let preview: { unlocked: number | "all"; previewLimit: number };
    if (admin) {
      preview = { unlocked: "all", previewLimit: config.limits.previewEpisodeCount };
    } else if (viewer) {
      preview = await unlockedEpisodeCount(viewer.id, topic.id);
    } else {
      preview = {
        unlocked: isFree ? "all" : config.limits.previewEpisodeCount,
        previewLimit: config.limits.previewEpisodeCount,
      };
    }

    return ok(
      serialiseTopicDetail(topic, rel, {
        entitlement,
        isFree,
        author,
        includeAdminFields: admin,
        preview,
      }),
    );
  },
);
