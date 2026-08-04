/**
 * PATCH  /api/v1/admin/resources/[id] - edit a resource
 * DELETE /api/v1/admin/resources/[id] - remove one
 *
 * `kind` is immutable: the DB check constraint ties the required columns to it,
 * so switching kind means delete and recreate. `downloadCount` is a counter and
 * is never client-writable.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topicAttachments } from "@/db/schema";
import { ApiError, clientIp, handler, noContent, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseAdminResource } from "@/lib/topics";
import { updateResourceSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function resourceOr404(id: string) {
  const row = await db.query.topicAttachments.findFirst({
    where: eq(topicAttachments.id, id),
  });
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found.");
  return row;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok(serialiseAdminResource(await resourceOr404(id)));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await resourceOr404(id);
  const input = await parseBody(req, updateResourceSchema);

  // `body` only means something on a prompt and `url` only on a link. Saying so
  // is better than silently dropping the field the admin just typed.
  if (input.body !== undefined && existing.kind !== "prompt") {
    throw new ApiError("VALIDATION_FAILED", "Only a prompt resource has a body.", {
      body: "Not applicable to this resource kind.",
    });
  }
  if (input.url !== undefined && existing.kind !== "link") {
    throw new ApiError("VALIDATION_FAILED", "Only a link resource has a URL.", {
      url: "Not applicable to this resource kind.",
    });
  }

  const patch: Partial<typeof topicAttachments.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.body !== undefined) patch.body = input.body;
  if (input.url !== undefined) patch.url = input.url;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isPreview !== undefined) patch.isPreview = input.isPreview;

  const [updated] = await db
    .update(topicAttachments)
    .set(patch)
    .where(eq(topicAttachments.id, existing.id))
    .returning();
  if (!updated) throw new ApiError("NOT_FOUND", "Resource not found.");

  await audit({
    actorId: admin.id,
    action: "resource.updated",
    entityType: "topic_attachment",
    entityId: updated.id,
    metadata: { topic_id: existing.topicId, fields: Object.keys(input) },
    ipAddress: clientIp(req),
  });

  return ok(serialiseAdminResource(updated));
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await resourceOr404(id);

  await db.delete(topicAttachments).where(eq(topicAttachments.id, existing.id));

  await audit({
    actorId: admin.id,
    action: "resource.deleted",
    entityType: "topic_attachment",
    entityId: existing.id,
    metadata: {
      topic_id: existing.topicId,
      kind: existing.kind,
      title: existing.title,
    },
    ipAddress: clientIp(req),
  });

  return noContent();
});
