/**
 * GET /api/v1/topics/[id]/resources
 *
 * The learner's view of a topic's downloads, prompts and links.
 *
 * The PAYLOAD is gated, not just the download link. A locked prompt is returned
 * without its `body` and a locked link without its `url`, so content the UI is
 * meant to hide is never sitting in the response waiting to be read out of the
 * network tab. Files are metadata only here; the bytes come from
 * GET /resources/:id/download, which re-runs the same check.
 */

import { ApiError, handler, ok } from "@/lib/api";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import {
  topicResourcesUnlocked,
  findTopicByIdOrSlug,
  loadTopicResources,
  resourceAccessible,
  serialiseResource,
} from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const viewer = await getCurrentUser();
  const admin = viewer ? isAdminRole(viewer.role) : false;

  const topic = await findTopicByIdOrSlug(id);
  if (!topic || topic.deletedAt || (!admin && topic.status !== "published")) {
    throw new ApiError("NOT_FOUND", "Topic not found.");
  }

  // One entitlement resolution for the whole list, never one per row.
  const unlocked = admin || (await topicResourcesUnlocked(viewer?.id ?? null, topic.id));

  const rows = await loadTopicResources(topic.id);

  return ok({
    data: rows.map((r) => serialiseResource(r, { accessible: resourceAccessible(r, unlocked) })),
    unlocked,
  });
});
