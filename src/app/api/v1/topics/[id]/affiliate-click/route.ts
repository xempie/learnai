/**
 * POST /api/v1/topics/[id]/affiliate-click
 * Records the click, then hands back the destination. Auth optional - anonymous
 * readers click affiliate links too, and the disclosure is shown either way.
 */

import { db } from "@/db";
import { affiliateClicks } from "@/db/schema";
import { ApiError, clientIp, handler, ok, rateLimit } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { findTopicByIdOrSlug } from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    rateLimit(`affiliate:${clientIp(req)}`, 30, 60_000);

    const topic = await findTopicByIdOrSlug(id);
    if (!topic || topic.deletedAt || topic.status !== "published") {
      throw new ApiError("NOT_FOUND", "Topic not found.");
    }
    if (!topic.affiliateUrl) {
      throw new ApiError("NOT_FOUND", "This topic has no affiliate link.");
    }

    const user = await getCurrentUser();

    await db.insert(affiliateClicks).values({
      topicId: topic.id,
      userId: user?.id ?? null,
      tool: topic.affiliateTool ?? "unknown",
    });

    await track([
      {
        userId: user?.id ?? null,
        event: "affiliate_clicked",
        topicId: topic.id,
        metadata: { tool: topic.affiliateTool ?? "unknown" },
      },
    ]);

    return ok({
      affiliate_url: topic.affiliateUrl,
      tool: topic.affiliateTool,
      disclosure_text: topic.disclosureText,
    });
  },
);
