/**
 * GET    /api/v1/admin/topics/[id]  - full detail, any status
 * PATCH  /api/v1/admin/topics/[id]  - edit (never status or counters)
 * DELETE /api/v1/admin/topics/[id]  - soft delete
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { ApiError, clientIp, handler, noContent, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import {
  authorName,
  buildDisclosureText,
  loadTopicRelations,
  serialiseTopicDetail,
  syncAttachments,
  syncCategories,
  syncHashtags,
  syncLinks,
  uniqueTopicSlug,
} from "@/lib/topics";
import { freeTopicIds } from "@/lib/entitlements";
import { updateTopicSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadOr404(id: string) {
  const row = await db.query.topics.findFirst({ where: eq(topics.id, id) });
  if (!row) throw new ApiError("NOT_FOUND", "Topic not found.");
  return row;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const topic = await loadOr404(id);

  const [rel, author, freeIds] = await Promise.all([
    loadTopicRelations(topic.id),
    authorName(topic.authorId),
    freeTopicIds(),
  ]);

  return ok(
    serialiseTopicDetail(topic, rel, {
      // Admins see the record, not an access decision - they always may look.
      entitlement: { allowed: true, reason: "full_access" },
      isFree: freeIds.includes(topic.id),
      author,
      includeAdminFields: true,
    }),
  );
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadOr404(id);
  if (existing.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");

  const input = await parseBody(req, updateTopicSchema);

  const patch: Partial<typeof topics.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle ?? null;
  if (input.body !== undefined) patch.body = input.body ?? null;
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt ?? null;
  if (input.thumbnailKey !== undefined) patch.thumbnailKey = input.thumbnailKey ?? null;
  if (input.skillLevel !== undefined) patch.skillLevel = input.skillLevel;
  // Intro video + sales copy. The 360s cap is enforced by the Zod schema and by
  // a DB check constraint on episodes; the intro is held to the same limit.
  if (input.introVideoKey !== undefined) patch.introVideoKey = input.introVideoKey ?? null;
  if (input.introCaptionsKey !== undefined) {
    patch.introCaptionsKey = input.introCaptionsKey ?? null;
  }
  if (input.introThumbnailKey !== undefined) {
    patch.introThumbnailKey = input.introThumbnailKey ?? null;
  }
  if (input.introDurationSec !== undefined) {
    patch.introDurationSec = input.introDurationSec ?? null;
  }
  if (input.whyLearn !== undefined) patch.whyLearn = input.whyLearn ?? null;
  if (input.outcomes !== undefined) patch.outcomes = input.outcomes ?? null;
  if (input.isFree !== undefined) patch.isFree = input.isFree;
  if (input.freeOrder !== undefined) patch.freeOrder = input.freeOrder ?? null;
  if (input.affiliateTool !== undefined) patch.affiliateTool = input.affiliateTool ?? null;
  if (input.affiliateUrl !== undefined) patch.affiliateUrl = input.affiliateUrl ?? null;
  if (input.isSponsored !== undefined) patch.isSponsored = input.isSponsored;
  if (input.sponsorName !== undefined) patch.sponsorName = input.sponsorName ?? null;

  if (input.slug !== undefined) {
    patch.slug = await uniqueTopicSlug(input.slug, { excludeId: existing.id });
  }

  // Recompute disclosure from the MERGED row: turning on `isSponsored` in a
  // patch that doesn't mention disclosureText must still produce one.
  const merged = {
    affiliateTool: input.affiliateTool !== undefined ? input.affiliateTool : existing.affiliateTool,
    affiliateUrl: input.affiliateUrl !== undefined ? input.affiliateUrl : existing.affiliateUrl,
    isSponsored: input.isSponsored !== undefined ? input.isSponsored : existing.isSponsored,
    sponsorName: input.sponsorName !== undefined ? input.sponsorName : existing.sponsorName,
    disclosureText:
      input.disclosureText !== undefined ? input.disclosureText : existing.disclosureText,
  };
  patch.disclosureText = buildDisclosureText(merged);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(topics)
      .set(patch)
      .where(eq(topics.id, existing.id))
      .returning();
    if (!row) throw new ApiError("NOT_FOUND", "Topic not found.");

    if (input.categoryIds !== undefined) await syncCategories(tx, row.id, input.categoryIds);
    if (input.hashtags !== undefined) await syncHashtags(tx, row.id, input.hashtags);
    if (input.links !== undefined) await syncLinks(tx, row.id, input.links);
    if (input.attachments !== undefined) await syncAttachments(tx, row.id, input.attachments);
    return row;
  });

  await audit({
    actorId: admin.id,
    action: "topic.updated",
    entityType: "topic",
    entityId: updated.id,
    metadata: { fields: Object.keys(input) },
    ipAddress: clientIp(req),
  });

  const [rel, author, freeIds] = await Promise.all([
    loadTopicRelations(updated.id),
    authorName(updated.authorId),
    freeTopicIds(),
  ]);

  return ok(
    serialiseTopicDetail(updated, rel, {
      entitlement: { allowed: true, reason: "full_access" },
      isFree: freeIds.includes(updated.id),
      author,
      includeAdminFields: true,
    }),
  );
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadOr404(id);
  if (existing.deletedAt) return noContent();

  // Soft delete. The row keeps its analytics, enrolments and comments; nothing
  // about a topic is ever actually destroyed by an admin click.
  await db
    .update(topics)
    .set({ deletedAt: new Date(), status: "unpublished", updatedAt: new Date() })
    .where(eq(topics.id, existing.id));

  await audit({
    actorId: admin.id,
    action: "topic.deleted",
    entityType: "topic",
    entityId: existing.id,
    metadata: { slug: existing.slug, previous_status: existing.status },
    ipAddress: clientIp(req),
  });

  return noContent();
});
