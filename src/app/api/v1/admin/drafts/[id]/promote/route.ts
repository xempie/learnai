/**
 * POST /api/v1/admin/drafts/[id]/promote
 *
 * Turns an approved news_post draft into a draft article topic, which then
 * goes through the normal editor / publish gate. Only `news_post` drafts are
 * promotable - scripts and shot lists feed the video pipeline, not the topic
 * table, and a social_post has nowhere to promote to yet.
 *
 * The insert mirrors POST /api/v1/admin/topics (read there first) so the
 * resulting row matches what the editor expects: same status/origin
 * defaults, same slug shape.
 */

import { customAlphabet } from "nanoid";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contentDrafts, topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/topics";
import { requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const suffixId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const draftId = requireUuidParam(id, "draft");

  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, draftId),
  });
  if (!draft) throw new ApiError("NOT_FOUND", "Draft not found.");

  if (draft.draftType !== "news_post") {
    throw new ApiError("BAD_REQUEST", "Only a news_post draft can be promoted to a topic.");
  }
  if (draft.targetTopicId) {
    throw new ApiError("CONFLICT", "This draft has already been promoted.");
  }
  if (draft.status !== "approved") {
    throw new ApiError("CONFLICT", `This draft is ${draft.status.replace(/_/g, " ")}, not approved.`);
  }

  const body = draft.body as { markdown?: string } | null;
  const markdown = body?.markdown ?? "";
  const slug = `${slugify(draft.title)}-${suffixId()}`;

  const topicId = await db.transaction(async (tx) => {
    const [topic] = await tx
      .insert(topics)
      .values({
        type: "article",
        slug,
        title: draft.title,
        body: markdown,
        // Publish state is never taken from the draft - the editor decides.
        status: "draft",
        authorId: admin.id,
        origin: "platform",
      })
      .returning({ id: topics.id });

    if (!topic) throw new ApiError("SERVER_ERROR", "Could not create the topic.");

    // Conditional on the same two facts checked above so a second, racing
    // promote can't stamp a different topic id onto the same draft.
    const [stamped] = await tx
      .update(contentDrafts)
      .set({ targetTopicId: topic.id, updatedAt: new Date() })
      .where(
        and(
          eq(contentDrafts.id, draftId),
          eq(contentDrafts.status, "approved"),
          isNull(contentDrafts.targetTopicId),
        ),
      )
      .returning({ id: contentDrafts.id });

    if (!stamped) throw new ApiError("CONFLICT", "This draft has already been promoted.");

    return topic.id;
  });

  await audit({
    actorId: admin.id,
    action: "content_draft.promoted",
    entityType: "content_draft",
    entityId: draftId,
    metadata: { topic_id: topicId, slug },
    ipAddress: clientIp(req),
  });

  return ok({ topic_id: topicId });
});
