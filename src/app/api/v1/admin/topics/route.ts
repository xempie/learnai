/**
 * GET  /api/v1/admin/topics  - every status, with counters
 * POST /api/v1/admin/topics  - create a draft
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, topicCategories, topics, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import {
  buildDisclosureText,
  loadCategoriesByTopic,
  serialiseTopicCard,
  syncAttachments,
  syncCategories,
  syncHashtags,
  syncLinks,
  uniqueTopicSlug,
} from "@/lib/topics";
import { adminTopicListQuery, createTopicSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const q = parseQuery(req, adminTopicListQuery);

  const filters = [];
  if (!q.includeDeleted) filters.push(isNull(topics.deletedAt));
  if (q.status) filters.push(eq(topics.status, q.status));
  if (q.type) filters.push(eq(topics.type, q.type));

  if (q.q) {
    const needle = `%${q.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const match = or(
      ilike(topics.title, needle),
      ilike(topics.slug, needle),
      ilike(topics.excerpt, needle),
    );
    if (match) filters.push(match);
  }

  if (q.category) {
    const catIds = db
      .select({ topicId: topicCategories.topicId })
      .from(topicCategories)
      .innerJoin(categories, eq(categories.id, topicCategories.categoryId))
      .where(or(eq(categories.slug, q.category), sql`${categories.id}::text = ${q.category}`));
    filters.push(inArray(topics.id, catIds));
  }

  const rows = await db
    .select({
      id: topics.id,
      type: topics.type,
      slug: topics.slug,
      title: topics.title,
      excerpt: topics.excerpt,
      thumbnailKey: topics.thumbnailKey,
      skillLevel: topics.skillLevel,
      episodeCount: topics.episodeCount,
      totalDurationSec: topics.totalDurationSec,
      viewCount: topics.viewCount,
      likeCount: topics.likeCount,
      commentCount: topics.commentCount,
      status: topics.status,
      publishAt: topics.publishAt,
      publishedAt: topics.publishedAt,
      updatedAt: topics.updatedAt,
      isFree: topics.isFree,
      authorName: users.nickname,
    })
    .from(topics)
    .leftJoin(users, eq(users.id, topics.authorId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(topics.updatedAt))
    .limit(q.limit);

  const categoryMap = await loadCategoriesByTopic(rows.map((r) => r.id));

  return ok({
    data: rows.map((r) =>
      serialiseTopicCard(r, {
        categories: categoryMap.get(r.id) ?? [],
        isFree: r.isFree,
        includeAdminFields: true,
      }),
    ),
  });
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await parseBody(req, createTopicSchema);

  const slug = await uniqueTopicSlug(input.title);

  // Disclosure is derived, never simply echoed: if this topic carries an
  // affiliate link or a sponsor it gets a disclosure string whether or not the
  // admin typed one.
  const disclosureText = buildDisclosureText(input);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(topics)
      .values({
        type: input.type,
        slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        body: input.body ?? null,
        excerpt: input.excerpt ?? null,
        thumbnailKey: input.thumbnailKey ?? null,
        skillLevel: input.skillLevel,
        isFree: input.isFree,
        freeOrder: input.freeOrder ?? null,
        affiliateTool: input.affiliateTool ?? null,
        affiliateUrl: input.affiliateUrl ?? null,
        isSponsored: input.isSponsored,
        sponsorName: input.sponsorName ?? null,
        disclosureText,
        // Publish state is never taken from the client.
        status: "draft",
        authorId: admin.id,
        origin: "platform",
      })
      .returning();

    if (!row) throw new ApiError("SERVER_ERROR", "Could not create the topic.");

    await syncCategories(tx, row.id, input.categoryIds);
    await syncHashtags(tx, row.id, input.hashtags);
    await syncLinks(tx, row.id, input.links);
    await syncAttachments(tx, row.id, input.attachments);
    return row;
  });

  await audit({
    actorId: admin.id,
    action: "topic.created",
    entityType: "topic",
    entityId: created.id,
    metadata: { slug: created.slug, type: created.type },
    ipAddress: clientIp(req),
  });

  const categoryMap = await loadCategoriesByTopic([created.id]);

  return ok(
    serialiseTopicCard(created, {
      categories: categoryMap.get(created.id) ?? [],
      isFree: created.isFree,
      includeAdminFields: true,
    }),
    201,
  );
});
