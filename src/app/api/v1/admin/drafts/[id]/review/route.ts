/**
 * POST /api/v1/admin/drafts/[id]/review  { action: 'approve' | 'reject', notes? }
 *
 * The human review gate (TECHNICAL_SPEC §8.5). Only a draft still sitting in
 * pending_review may be decided - the transition is a single conditional
 * UPDATE so two admins racing the same draft can't both "win". An empty
 * `.returning()` is ambiguous (missing id vs. wrong status), so a follow-up
 * SELECT disambiguates 404 from 409 without a second query on the happy path.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentDrafts } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { serialiseDraft } from "@/lib/drafts-serialise";
import { requireUuidParam } from "@/lib/schemas/engagement";
import { draftReviewSchema } from "@/lib/schemas/drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const draftId = requireUuidParam(id, "draft");
  const { action, notes } = await parseBody(req, draftReviewSchema);

  const nextStatus = action === "approve" ? "approved" : "rejected";
  const now = new Date();

  const [updated] = await db
    .update(contentDrafts)
    .set({
      status: nextStatus,
      reviewerId: admin.id,
      reviewNotes: notes ?? null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.status, "pending_review")))
    .returning();

  if (!updated) {
    const existing = await db.query.contentDrafts.findFirst({
      where: eq(contentDrafts.id, draftId),
      columns: { status: true },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Draft not found.");
    throw new ApiError(
      "CONFLICT",
      `This draft is already ${existing.status.replace(/_/g, " ")}.`,
    );
  }

  await audit({
    actorId: admin.id,
    action: action === "approve" ? "content_draft.approved" : "content_draft.rejected",
    entityType: "content_draft",
    entityId: draftId,
    metadata: { draft_type: updated.draftType },
    ipAddress: clientIp(req),
  });

  return ok(serialiseDraft(updated));
});
