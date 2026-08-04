/**
 * GET /api/v1/admin/drafts?status= - the human review queue for agent-produced
 * content (TECHNICAL_SPEC §8.5). Defaults to the actionable set, pending_review,
 * newest first. The queue is expected to stay small, so a flat capped list is
 * enough - no cursor pagination.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentDrafts } from "@/db/schema";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseDraft } from "@/lib/drafts-serialise";
import { adminDraftListQuery } from "@/lib/schemas/drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const q = parseQuery(req, adminDraftListQuery);

  const rows = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.status, q.status))
    .orderBy(desc(contentDrafts.createdAt))
    .limit(100);

  return ok({ data: rows.map(serialiseDraft) });
});
