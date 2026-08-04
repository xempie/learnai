import { z } from "zod";

export const DRAFT_STATUSES = ["pending_review", "approved", "rejected", "published"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** GET /api/v1/admin/drafts - the review queue is small, so a flat list is fine. */
export const adminDraftListQuery = z.object({
  status: z
    .enum(DRAFT_STATUSES)
    .optional()
    .transform((v) => v ?? "pending_review"),
});

/** POST /api/v1/admin/drafts/[id]/review */
export const draftReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(8000).optional(),
});
