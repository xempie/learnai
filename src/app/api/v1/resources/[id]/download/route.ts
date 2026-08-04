/**
 * GET /api/v1/resources/[id]/download
 *
 * The only way to get at a resource's bytes. Same rule as the list endpoint:
 * a preview resource is open, everything else needs a full entitlement, a
 * purchase, or a permanently-free topic.
 *
 * ORDER MATTERS, exactly as it does for episode playback: the entitlement check
 * runs before `signedMediaUrl()`, because a signed URL that has been handed out
 * cannot be recalled.
 *
 * Files redirect to signed storage. Links redirect to the external URL. Prompts
 * are read inline in the app, so asking to download one is a 400.
 */

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { topicAttachments, topics } from "@/db/schema";
import { ApiError, clientIp, handler, rateLimit } from "@/lib/api";
import { track } from "@/lib/audit";
import { isAdminRole, requireAuth } from "@/lib/auth/session";
import { topicResourcesUnlocked, resourceAccessible } from "@/lib/topics";
import { getEntitlements } from "@/lib/entitlements";
import { signedMediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 3600;

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  // Signed in, so every download is attributable to an account.
  const user = await requireAuth();

  rateLimit(`resource-download:${user.id}:${clientIp(req)}`, 60, 60_000);

  const resource = await db.query.topicAttachments.findFirst({
    where: eq(topicAttachments.id, id),
  });
  if (!resource) throw new ApiError("NOT_FOUND", "Resource not found.");

  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, resource.topicId),
    columns: { id: true, slug: true, status: true, deletedAt: true },
  });
  const admin = isAdminRole(user.role);
  if (!topic || topic.deletedAt || (!admin && topic.status !== "published")) {
    throw new ApiError("NOT_FOUND", "Resource not found.");
  }

  /* ---- 1. entitlement gate (before anything is signed) ----
     Runs before the kind check so that every kind answers the same question in
     the same order: a locked resource is a 403 whether or not it is downloadable. */
  const unlocked = admin || (await topicResourcesUnlocked(user.id, topic.id));
  if (!resourceAccessible(resource, unlocked)) {
    const entitlements = await getEntitlements(user.id);
    throw new ApiError(
      "ENTITLEMENT_REQUIRED",
      "Subscribe to download this resource.",
      {
        upgrade: {
          tier: entitlements.tier,
          reason: entitlements.reason,
          trial_ends_at: entitlements.trialEndsAt?.toISOString() ?? null,
          checkout_path: "/settings?tab=billing",
          topic_id: topic.id,
          topic_slug: topic.slug,
        },
      },
    );
  }

  // Prompts are copied from the page, so there is nothing to download.
  if (resource.kind === "prompt") {
    throw new ApiError(
      "BAD_REQUEST",
      "Prompts are copied from the topic page, not downloaded.",
    );
  }

  /* ---- 2. count it, then hand over the location ---- */
  await db
    .update(topicAttachments)
    .set({ downloadCount: sql`${topicAttachments.downloadCount} + 1` })
    .where(eq(topicAttachments.id, resource.id));

  await track([
    {
      userId: user.id,
      event: "resource_downloaded",
      topicId: topic.id,
      metadata: { resource_id: resource.id, kind: resource.kind },
    },
  ]);

  if (resource.kind === "link") {
    // Re-check the scheme even though the write path validated it: this row may
    // predate that validation, and we will not redirect a browser to javascript:.
    if (!resource.url || !/^https?:\/\//i.test(resource.url)) {
      throw new ApiError("CONFLICT", "This link is not usable.");
    }
    return NextResponse.redirect(resource.url, 302);
  }

  const target = signedMediaUrl(resource.s3Key, TTL_SECONDS);
  if (!target) throw new ApiError("CONFLICT", "This file is not available yet.");

  // In local-dev mode `signedMediaUrl` returns a site-relative path; Location
  // must be absolute.
  return NextResponse.redirect(new URL(target, req.url), 302);
});
