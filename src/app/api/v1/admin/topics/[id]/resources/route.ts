/**
 * GET  /api/v1/admin/topics/[id]/resources - every resource, locked or not
 * POST /api/v1/admin/topics/[id]/resources - create one
 *
 * For `kind: 'file'` the client uploads first:
 *   POST /admin/topics/:id/upload-url { kind: 'attachment', mimeType, sizeBytes }
 * then posts the returned `key` here as `s3Key`. The bytes never pass through
 * this API.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topicAttachments, topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { loadTopicResources, serialiseAdminResource } from "@/lib/topics";
import { createResourceSchema } from "@/lib/schemas/content";
import { validateUpload } from "@/lib/storage";

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

  const rows = await loadTopicResources(topic.id);
  return ok({ data: rows.map(serialiseAdminResource) });
});

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const topic = await topicOr404(id);
  const input = await parseBody(req, createResourceSchema);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topicAttachments)
    .where(eq(topicAttachments.topicId, topic.id));

  if ((countRow?.count ?? 0) >= config.limits.maxAttachmentsPerTopic) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `A topic may have at most ${config.limits.maxAttachmentsPerTopic} resources.`,
      { resources: "Too many resources." },
    );
  }

  // Re-check the mime allowlist and size cap: the presign step ran earlier, on a
  // different request, and its result is not evidence about this body.
  if (input.kind === "file") {
    validateUpload("attachment", input.mimeType, input.sizeBytes);
  }

  const created = await db.transaction(async (tx) => {
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const [agg] = await tx
        .select({ next: sql<number>`coalesce(max(${topicAttachments.sortOrder}), -1) + 1` })
        .from(topicAttachments)
        .where(eq(topicAttachments.topicId, topic.id));
      sortOrder = agg?.next ?? 0;
    }

    const [row] = await tx
      .insert(topicAttachments)
      .values({
        topicId: topic.id,
        kind: input.kind,
        title: input.title,
        description: input.description ?? null,
        s3Key: input.kind === "file" ? input.s3Key : null,
        filename: input.kind === "file" ? input.filename : null,
        mimeType: input.kind === "file" ? input.mimeType : null,
        sizeBytes: input.kind === "file" ? input.sizeBytes : null,
        body: input.kind === "prompt" ? input.body : null,
        url: input.kind === "link" ? input.url : null,
        sortOrder,
        isPreview: input.isPreview ?? false,
      })
      .returning();

    if (!row) throw new ApiError("SERVER_ERROR", "Could not create the resource.");
    return row;
  });

  await audit({
    actorId: admin.id,
    action: "resource.created",
    entityType: "topic_attachment",
    entityId: created.id,
    metadata: { topic_id: topic.id, kind: created.kind, is_preview: created.isPreview },
    ipAddress: clientIp(req),
  });

  return ok(serialiseAdminResource(created), 201);
});
