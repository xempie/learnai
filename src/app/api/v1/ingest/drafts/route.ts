import { z } from "zod";
import { db } from "@/db";
import { contentDrafts } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  draft_type: z.enum(["script", "shot_list", "news_post", "social_post"]),
  title: z.string().trim().min(3).max(200),
  body: z.object({ markdown: z.string().min(1).max(50_000) }),
  source_refs: z
    .array(z.object({ url: z.url(), title: z.string().max(300).optional() }))
    .max(20)
    .optional(),
  target_topic_id: z.uuid().optional(),
});

/**
 * POST /api/v1/ingest/drafts — the write side of the human review gate
 * (SERVICES_ACTION_PLAN §4). External agents draft; nothing publishes
 * without a founder decision in /admin/drafts.
 */
export const POST = handler(async (req: Request) => {
  if (!config.drafts.ingestToken) {
    throw new ApiError("NOT_CONFIGURED", "Draft ingestion is not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${config.drafts.ingestToken}`) {
    throw new ApiError("UNAUTHENTICATED", "Invalid ingest token.");
  }
  rateLimit(`ingest-ip:${clientIp(req)}`, 30, 60_000);

  const body = await parseBody(req, ingestSchema);
  const [draft] = await db
    .insert(contentDrafts)
    .values({
      draftType: body.draft_type,
      title: body.title,
      body: body.body,
      sourceRefs: body.source_refs ?? null,
      targetTopicId: body.target_topic_id ?? null,
    })
    .returning({ id: contentDrafts.id });

  await audit({
    action: "content_draft.ingested",
    entityType: "content_draft",
    entityId: draft!.id,
    metadata: { draft_type: body.draft_type },
  });
  return ok({ id: draft!.id }, 201);
});
