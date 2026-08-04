/**
 * POST /api/v1/admin/topics/[id]/duplicate
 *
 * Deep copy: episodes, categories, hashtags, links and attachments. The copy
 * starts as a `draft` with a fresh slug and zeroed engagement counters - only
 * `episodeCount` / `totalDurationSec` carry over, and those are recomputed from
 * the copied episode rows rather than copied from the source.
 *
 * Media keys are shared with the original. The objects are immutable once
 * uploaded, so two rows pointing at one file is correct, not a leak.
 */

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  topicAttachments,
  topicCategories,
  topicHashtags,
  topicLinks,
  topics,
  episodes,
} from "@/db/schema";
import { ApiError, clientIp, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { recomputeTopicCounters, uniqueTopicSlug } from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const source = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!source || source.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");

    const slug = await uniqueTopicSlug(`${source.title} copy`);

    const copy = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(topics)
        .values({
          type: source.type,
          slug,
          title: `${source.title} (copy)`,
          subtitle: source.subtitle,
          body: source.body,
          excerpt: source.excerpt,
          thumbnailKey: source.thumbnailKey,
          skillLevel: source.skillLevel,
          ownerId: source.ownerId,
          origin: source.origin,
          // Intro video and the "why learn this" copy are part of the topic
          // and must survive a duplicate, or the copy silently loses them.
          introVideoKey: source.introVideoKey,
          introCaptionsKey: source.introCaptionsKey,
          introThumbnailKey: source.introThumbnailKey,
          introDurationSec: source.introDurationSec,
          whyLearn: source.whyLearn,
          outcomes: source.outcomes,
          pricingModel: source.pricingModel,
          priceCents: source.priceCents,
          currency: source.currency,
          // The free set is curated by hand; a copy does not inherit a slot.
          isFree: false,
          freeOrder: null,
          affiliateTool: source.affiliateTool,
          affiliateUrl: source.affiliateUrl,
          isSponsored: source.isSponsored,
          sponsorName: source.sponsorName,
          disclosureText: source.disclosureText,
          status: "draft",
          publishAt: null,
          publishedAt: null,
          authorId: admin.id,
        })
        .returning();

      if (!row) throw new ApiError("SERVER_ERROR", "Could not duplicate the topic.");

      const sourceEpisodes = await tx
        .select()
        .from(episodes)
        .where(eq(episodes.topicId, source.id))
        .orderBy(asc(episodes.sortOrder), asc(episodes.createdAt));

      if (sourceEpisodes.length > 0) {
        await tx.insert(episodes).values(
          sourceEpisodes.map((l) => ({
            topicId: row.id,
            // Episode slugs are unique per topic, so the originals are free here.
            slug: l.slug,
            title: l.title,
            description: l.description,
            sortOrder: l.sortOrder,
            videoS3Key: l.videoS3Key,
            hlsManifestKey: l.hlsManifestKey,
            thumbnailKey: l.thumbnailKey,
            captionsKey: l.captionsKey,
            durationSec: l.durationSec,
            uploadStatus: l.uploadStatus,
            isPreview: l.isPreview,
          })),
        );
      }

      const cats = await tx
        .select({ categoryId: topicCategories.categoryId })
        .from(topicCategories)
        .where(eq(topicCategories.topicId, source.id));
      if (cats.length > 0) {
        await tx
          .insert(topicCategories)
          .values(cats.map((c) => ({ topicId: row.id, categoryId: c.categoryId })));
      }

      const tags = await tx
        .select({ hashtagId: topicHashtags.hashtagId })
        .from(topicHashtags)
        .where(eq(topicHashtags.topicId, source.id));
      if (tags.length > 0) {
        await tx
          .insert(topicHashtags)
          .values(tags.map((t) => ({ topicId: row.id, hashtagId: t.hashtagId })));
      }

      const links = await tx
        .select()
        .from(topicLinks)
        .where(eq(topicLinks.topicId, source.id))
        .orderBy(asc(topicLinks.sortOrder));
      if (links.length > 0) {
        await tx.insert(topicLinks).values(
          links.map((l) => ({
            topicId: row.id,
            url: l.url,
            label: l.label,
            sortOrder: l.sortOrder,
          })),
        );
      }

      const attachments = await tx
        .select()
        .from(topicAttachments)
        .where(eq(topicAttachments.topicId, source.id));
      if (attachments.length > 0) {
        // Resources are file | prompt | link, and a DB check constraint requires
        // the columns that match the kind. Copy every column rather than just
        // the file ones, or duplicating a prompt violates the constraint.
        await tx.insert(topicAttachments).values(
          attachments.map((a) => ({
            topicId: row.id,
            kind: a.kind,
            title: a.title,
            description: a.description,
            s3Key: a.s3Key,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            body: a.body,
            url: a.url,
            sortOrder: a.sortOrder,
            isPreview: a.isPreview,
            // Download counts belong to the original, not the copy.
          })),
        );
      }

      await recomputeTopicCounters(tx, row.id);
      return row;
    });

    await audit({
      actorId: admin.id,
      action: "topic.duplicated",
      entityType: "topic",
      entityId: copy.id,
      metadata: { source_topic_id: source.id, slug: copy.slug },
      ipAddress: clientIp(req),
    });

    return ok({ id: copy.id, slug: copy.slug, title: copy.title, status: "draft" }, 201);
  },
);
