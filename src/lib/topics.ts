import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  topicAttachments,
  topicCategories,
  topicHashtags,
  topicLinks,
  topics,
  hashtags,
  episodes,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import { publicAssetUrl, validateUpload } from "@/lib/storage";
import { freeTopicIds, getEntitlements } from "@/lib/entitlements";
import type { AccessDecision } from "@/lib/entitlements";
import type {
  TopicType,
  ResourceKind,
  SkillLevel,
} from "@/lib/schemas/content";

/**
 * All topic reads/writes that more than one route needs live here.
 *
 * Two invariants this module exists to protect:
 *   - `episodeCount` / `totalDurationSec` are denormalised, so they are rewritten
 *     inside the same transaction as any episode mutation (`recomputeTopicCounters`).
 *     Nothing recomputes them at read time.
 *   - A topic never reaches `published` without captions on every episode and at
 *     least one category (`assertPublishable`).
 */

/** The transaction handle drizzle hands to `db.transaction(...)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ============================================================
   SLUGS
   ============================================================ */

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "untitled";
}

function firstFree(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A globally unique topic slug derived from `source`. `excludeId` lets a topic
 * keep its own slug while being renamed.
 */
export async function uniqueTopicSlug(
  source: string,
  opts: { excludeId?: string } = {},
): Promise<string> {
  const base = slugify(source);
  const rows = await db
    .select({ id: topics.id, slug: topics.slug })
    .from(topics)
    .where(sql`${topics.slug} = ${base} or ${topics.slug} like ${`${base}-%`}`);

  const taken = new Set(
    rows.filter((r) => r.id !== opts.excludeId).map((r) => r.slug),
  );
  return firstFree(base, taken);
}

/** Episode slugs are unique per topic (`episodes_topic_slug`). */
export async function uniqueEpisodeSlug(
  tx: Tx,
  topicId: string,
  source: string,
  opts: { excludeId?: string } = {},
): Promise<string> {
  const base = slugify(source);
  const rows = await tx
    .select({ id: episodes.id, slug: episodes.slug })
    .from(episodes)
    .where(eq(episodes.topicId, topicId));

  const taken = new Set(rows.filter((r) => r.id !== opts.excludeId).map((r) => r.slug));
  return firstFree(base, taken);
}

/* ============================================================
   COMMERCIAL DISCLOSURE
   ============================================================ */

export interface DisclosureInput {
  affiliateTool?: string | null;
  affiliateUrl?: string | null;
  isSponsored?: boolean | null;
  sponsorName?: string | null;
  disclosureText?: string | null;
}

/**
 * Disclosure is not optional. If a topic carries an affiliate link or is
 * sponsored, a disclosure string is persisted whether or not the admin wrote
 * one - so the record is auditable after the fact rather than reconstructed.
 */
export function buildDisclosureText(input: DisclosureInput): string | null {
  const hasAffiliate = Boolean(input.affiliateUrl && input.affiliateUrl.trim());
  const sponsored = Boolean(input.isSponsored);
  const supplied = input.disclosureText?.trim();

  if (!hasAffiliate && !sponsored) return supplied && supplied.length > 0 ? supplied : null;
  if (supplied && supplied.length > 0) return supplied;

  const parts: string[] = [];
  if (sponsored) {
    parts.push(
      input.sponsorName
        ? `This content is sponsored by ${input.sponsorName}.`
        : "This content is sponsored.",
    );
  }
  if (hasAffiliate) {
    parts.push(
      input.affiliateTool
        ? `We may earn a commission if you sign up to ${input.affiliateTool} through the links on this page.`
        : "We may earn a commission from the links on this page.",
    );
  }
  return parts.join(" ");
}

/* ============================================================
   RELATION SYNC  (always called inside a transaction)
   ============================================================ */

export function normaliseHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    if (tag.length > 0) seen.add(tag);
  }
  return [...seen];
}

/** Replaces a topic's categories, rejecting ids that do not exist. */
export async function syncCategories(
  tx: Tx,
  topicId: string,
  categoryIds: string[],
): Promise<void> {
  const unique = [...new Set(categoryIds)];
  if (unique.length === 0) {
    throw new ApiError("VALIDATION_FAILED", "Pick at least one category.", {
      categoryIds: "Pick at least one category.",
    });
  }
  const found = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, unique));

  if (found.length !== unique.length) {
    throw new ApiError("VALIDATION_FAILED", "One or more categories do not exist.", {
      categoryIds: "Unknown category.",
    });
  }

  await tx.delete(topicCategories).where(eq(topicCategories.topicId, topicId));
  await tx
    .insert(topicCategories)
    .values(unique.map((categoryId) => ({ topicId, categoryId })));
}

/** Creates hashtags on demand and replaces the topic's set. */
export async function syncHashtags(tx: Tx, topicId: string, tags: string[]): Promise<void> {
  const wanted = normaliseHashtags(tags);
  await tx.delete(topicHashtags).where(eq(topicHashtags.topicId, topicId));
  if (wanted.length === 0) return;

  await tx
    .insert(hashtags)
    .values(wanted.map((tag) => ({ tag })))
    .onConflictDoNothing();

  const rows = await tx
    .select({ id: hashtags.id })
    .from(hashtags)
    .where(inArray(hashtags.tag, wanted));

  if (rows.length === 0) return;
  await tx
    .insert(topicHashtags)
    .values(rows.map((r) => ({ topicId, hashtagId: r.id })))
    .onConflictDoNothing();
}

export interface LinkInput {
  url: string;
  label?: string | null;
}

export async function syncLinks(tx: Tx, topicId: string, links: LinkInput[]): Promise<void> {
  if (links.length > config.limits.maxLinksPerTopic) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `A topic may have at most ${config.limits.maxLinksPerTopic} links.`,
      { links: "Too many links." },
    );
  }
  await tx.delete(topicLinks).where(eq(topicLinks.topicId, topicId));
  if (links.length === 0) return;
  await tx.insert(topicLinks).values(
    links.map((link, i) => ({
      topicId,
      url: link.url,
      label: link.label ?? null,
      sortOrder: i,
    })),
  );
}

export interface AttachmentInput {
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function syncAttachments(
  tx: Tx,
  topicId: string,
  attachments: AttachmentInput[],
): Promise<void> {
  if (attachments.length > config.limits.maxAttachmentsPerTopic) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `A topic may have at most ${config.limits.maxAttachmentsPerTopic} attachments.`,
      { attachments: "Too many attachments." },
    );
  }
  // Re-check the allowlist: the presign step ran earlier and on a different row.
  for (const a of attachments) validateUpload("attachment", a.mimeType, a.sizeBytes);

  await tx.delete(topicAttachments).where(eq(topicAttachments.topicId, topicId));
  if (attachments.length === 0) return;
  await tx.insert(topicAttachments).values(
    attachments.map((a) => ({
      topicId,
      s3Key: a.key,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  );
}

/* ============================================================
   RESOURCES  (files, prompts, links)
   ============================================================ */

export type ResourceRow = typeof topicAttachments.$inferSelect;

/**
 * Whether the caller may open a topic's paid resources.
 *
 * Deliberately NOT the episode rule: resources are not ordered viewing, so there
 * is no "first two" allowance. A resource is either flagged `isPreview` or it
 * needs a full entitlement, a purchase, or a permanently-free topic.
 */
export async function topicResourcesUnlocked(
  userId: string | null,
  topicId: string,
): Promise<boolean> {
  const free = await freeTopicIds();
  if (free.includes(topicId)) return true;
  if (!userId) return false;

  const ent = await getEntitlements(userId);
  if (ent.tier === "full") return true;
  return ent.purchasedTopicIds.includes(topicId);
}

/** Per-resource decision, given the topic-level answer above. */
export function resourceAccessible(r: ResourceRow, topicUnlocked: boolean): boolean {
  return r.isPreview || topicUnlocked;
}

export interface SerialisedResource {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string | null;
  sort_order: number;
  is_preview: boolean;
  locked: boolean;
  /** kind = 'file' only. The bytes are fetched from the download route. */
  filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  /** kind = 'prompt', and only when unlocked. */
  body?: string;
  /** kind = 'link', and only when unlocked. */
  url?: string;
}

/**
 * Learner shape. The PAYLOAD is gated, not just the download: a locked prompt
 * ships without its `body` and a locked link without its `url`, so nothing the
 * UI is meant to hide is ever sitting in the response for someone to read.
 * Storage keys never appear here at all.
 */
export function serialiseResource(
  r: ResourceRow,
  opts: { accessible: boolean },
): SerialisedResource {
  const out: SerialisedResource = {
    id: r.id,
    kind: r.kind as ResourceKind,
    title: r.title,
    description: r.description,
    sort_order: r.sortOrder,
    is_preview: r.isPreview,
    locked: !opts.accessible,
  };

  // File metadata is descriptive, not content - safe to show while locked so
  // the learner knows what they would be getting.
  if (r.kind === "file") {
    out.filename = r.filename;
    out.mime_type = r.mimeType;
    out.size_bytes = r.sizeBytes;
  }

  if (!opts.accessible) return out;

  if (r.kind === "prompt" && r.body !== null) out.body = r.body;
  if (r.kind === "link" && r.url !== null) out.url = r.url;
  return out;
}

/** Admin shape. Admins manage the record, so they see the keys and counters. */
export function serialiseAdminResource(r: ResourceRow) {
  return {
    id: r.id,
    topic_id: r.topicId,
    kind: r.kind as ResourceKind,
    title: r.title,
    description: r.description,
    sort_order: r.sortOrder,
    is_preview: r.isPreview,
    s3_key: r.s3Key,
    filename: r.filename,
    mime_type: r.mimeType,
    size_bytes: r.sizeBytes,
    body: r.body,
    url: r.url,
    download_count: r.downloadCount,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

/** Ordered resources for one topic. */
export async function loadTopicResources(topicId: string): Promise<ResourceRow[]> {
  return db
    .select()
    .from(topicAttachments)
    .where(eq(topicAttachments.topicId, topicId))
    .orderBy(asc(topicAttachments.sortOrder), asc(topicAttachments.createdAt));
}

/* ============================================================
   DENORMALISED COUNTERS
   ============================================================ */

/**
 * Rewrites `episodeCount` / `totalDurationSec` from the episode rows. Call this in
 * the SAME transaction as every episode insert/update/delete.
 */
export async function recomputeTopicCounters(tx: Tx, topicId: string): Promise<void> {
  const [agg] = await tx
    .select({
      episodeCount: sql<number>`count(*)::int`,
      totalDurationSec: sql<number>`coalesce(sum(${episodes.durationSec}), 0)::int`,
    })
    .from(episodes)
    .where(eq(episodes.topicId, topicId));

  await tx
    .update(topics)
    .set({
      episodeCount: agg?.episodeCount ?? 0,
      totalDurationSec: agg?.totalDurationSec ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(topics.id, topicId));
}

/* ============================================================
   LOOKUPS
   ============================================================ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TopicRow = typeof topics.$inferSelect;
export type EpisodeRow = typeof episodes.$inferSelect;

/** Route params carry an id in most places and a slug in the public detail route. */
export async function findTopicByIdOrSlug(ref: string): Promise<TopicRow | null> {
  const row = await db.query.topics.findFirst({
    where: UUID_RE.test(ref) ? eq(topics.id, ref) : eq(topics.slug, ref),
  });
  return row ?? null;
}

/** Throws 404 for missing or soft-deleted topics. */
export async function requireTopic(ref: string): Promise<TopicRow> {
  const row = await findTopicByIdOrSlug(ref);
  if (!row || row.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");
  return row;
}

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
  colorHex: string | null;
}

export async function loadCategoriesByTopic(
  topicIds: string[],
): Promise<Map<string, CategoryRef[]>> {
  const out = new Map<string, CategoryRef[]>();
  if (topicIds.length === 0) return out;

  const rows = await db
    .select({
      topicId: topicCategories.topicId,
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      colorHex: categories.colorHex,
    })
    .from(topicCategories)
    .innerJoin(categories, eq(categories.id, topicCategories.categoryId))
    .where(inArray(topicCategories.topicId, topicIds))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  for (const r of rows) {
    const list = out.get(r.topicId) ?? [];
    list.push({ id: r.id, slug: r.slug, name: r.name, colorHex: r.colorHex });
    out.set(r.topicId, list);
  }
  return out;
}

export interface TopicRelations {
  episodes: EpisodeRow[];
  links: (typeof topicLinks.$inferSelect)[];
  attachments: (typeof topicAttachments.$inferSelect)[];
  hashtags: string[];
  categories: CategoryRef[];
}

export async function loadTopicRelations(topicId: string): Promise<TopicRelations> {
  const [episodeRows, linkRows, attachmentRows, hashtagRows, categoryMap] = await Promise.all([
    db
      .select()
      .from(episodes)
      .where(eq(episodes.topicId, topicId))
      .orderBy(asc(episodes.sortOrder), asc(episodes.createdAt)),
    db
      .select()
      .from(topicLinks)
      .where(eq(topicLinks.topicId, topicId))
      .orderBy(asc(topicLinks.sortOrder)),
    db
      .select()
      .from(topicAttachments)
      .where(eq(topicAttachments.topicId, topicId))
      .orderBy(asc(topicAttachments.sortOrder), asc(topicAttachments.createdAt)),
    db
      .select({ tag: hashtags.tag })
      .from(topicHashtags)
      .innerJoin(hashtags, eq(hashtags.id, topicHashtags.hashtagId))
      .where(eq(topicHashtags.topicId, topicId))
      .orderBy(asc(hashtags.tag)),
    loadCategoriesByTopic([topicId]),
  ]);

  return {
    episodes: episodeRows,
    links: linkRows,
    attachments: attachmentRows,
    hashtags: hashtagRows.map((r) => r.tag),
    categories: categoryMap.get(topicId) ?? [],
  };
}

export async function authorName(authorId: string | null): Promise<string | null> {
  if (!authorId) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.id, authorId),
    columns: { nickname: true },
  });
  return row?.nickname ?? null;
}

/* ============================================================
   PUBLISH GATE
   ============================================================ */

/**
 * A topic may only reach `published` when every episode has captions and it has
 * at least one category. Throws 422 naming the offending episodes.
 */
export async function assertPublishable(topicId: string): Promise<TopicRow> {
  const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
  if (!topic || topic.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");

  const cats = await db
    .select({ categoryId: topicCategories.categoryId })
    .from(topicCategories)
    .where(eq(topicCategories.topicId, topicId));

  if (cats.length === 0) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "A topic needs at least one category before it can be published.",
      { categoryIds: "Pick at least one category." },
    );
  }

  if (topic.type === "topic") {
    const rows = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        captionsKey: episodes.captionsKey,
        videoS3Key: episodes.videoS3Key,
        hlsManifestKey: episodes.hlsManifestKey,
        durationSec: episodes.durationSec,
      })
      .from(episodes)
      .where(eq(episodes.topicId, topicId))
      .orderBy(asc(episodes.sortOrder));

    if (rows.length === 0) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "A topic needs at least one episode before it can be published.",
        { episodes: "Add a episode first." },
      );
    }

    const missingCaptions = rows.filter((l) => !l.captionsKey);
    if (missingCaptions.length > 0) {
      throw new ApiError(
        "VALIDATION_FAILED",
        `Captions are required before publishing. Missing on: ${missingCaptions
          .map((l) => l.title)
          .join(", ")}.`,
        {
          captions: "Every episode needs a WebVTT captions file.",
          episodes: missingCaptions.map((l) => ({ id: l.id, title: l.title })),
        },
      );
    }

    const missingVideo = rows.filter((l) => !l.videoS3Key && !l.hlsManifestKey);
    if (missingVideo.length > 0) {
      throw new ApiError(
        "VALIDATION_FAILED",
        `Some episodes have no video yet: ${missingVideo.map((l) => l.title).join(", ")}.`,
        { episodes: missingVideo.map((l) => ({ id: l.id, title: l.title })) },
      );
    }

    const tooLong = rows.filter((l) => l.durationSec > config.limits.maxEpisodeDurationSec);
    if (tooLong.length > 0) {
      throw new ApiError(
        "VALIDATION_FAILED",
        `Some episodes exceed the ${config.limits.maxEpisodeDurationSec}s cap: ${tooLong
          .map((l) => l.title)
          .join(", ")}.`,
        { episodes: tooLong.map((l) => ({ id: l.id, title: l.title })) },
      );
    }
  }

  return topic;
}

/* ============================================================
   SERIALISATION  (snake_case over the wire, matching §12.1)
   ============================================================ */

export interface TopicCardRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  excerpt: string | null;
  thumbnailKey: string | null;
  skillLevel: string;
  episodeCount: number;
  totalDurationSec: number;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  status?: string;
  publishAt?: Date | null;
  publishedAt: Date | null;
  authorName?: string | null;
  updatedAt?: Date | null;
}

export function serialiseTopicCard(
  row: TopicCardRow,
  opts: { categories?: CategoryRef[]; isFree?: boolean; includeAdminFields?: boolean } = {},
) {
  const card = {
    id: row.id,
    type: row.type as TopicType,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    thumbnail_url: publicAssetUrl(row.thumbnailKey),
    skill_level: row.skillLevel as SkillLevel,
    episode_count: row.episodeCount,
    total_duration_sec: row.totalDurationSec,
    view_count: row.viewCount,
    categories: (opts.categories ?? []).map(serialiseCategoryRef),
    author_name: row.authorName ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    is_free: opts.isFree ?? false,
  };

  if (!opts.includeAdminFields) return card;

  return {
    ...card,
    status: row.status ?? null,
    publish_at: row.publishAt?.toISOString() ?? null,
    like_count: row.likeCount ?? 0,
    comment_count: row.commentCount ?? 0,
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

function serialiseCategoryRef(c: CategoryRef) {
  return { id: c.id, slug: c.slug, name: c.name, color_hex: c.colorHex };
}

/**
 * Full topic detail.
 *
 * Storage keys never cross the wire: episodes expose no `videoS3Key`/`captionsKey`
 * (playback goes through POST /topics/:id/playback so the entitlement check
 * runs first), the intro video is fetched from GET /topics/:id/intro, and
 * resources expose no `s3Key`.
 *
 * `preview` carries the answer to "how much of this can I watch" once, so the
 * episode list renders its locks without the UI reimplementing the rule and
 * without one entitlement query per episode.
 */
export function serialiseTopicDetail(
  topic: TopicRow,
  rel: TopicRelations,
  opts: {
    entitlement: AccessDecision;
    isFree: boolean;
    author: string | null;
    includeAdminFields?: boolean;
    /** From `unlockedEpisodeCount`. Admin fetches see everything. */
    preview?: { unlocked: number | "all"; previewLimit: number };
  },
) {
  const previewLimit = opts.preview?.previewLimit ?? config.limits.previewEpisodeCount;
  const unlocked: number | "all" =
    opts.preview?.unlocked ?? (opts.includeAdminFields ? "all" : previewLimit);

  const detail = {
    id: topic.id,
    type: topic.type as TopicType,
    slug: topic.slug,
    title: topic.title,
    subtitle: topic.subtitle,
    body: topic.body,
    excerpt: topic.excerpt,
    thumbnail_url: publicAssetUrl(topic.thumbnailKey),
    skill_level: topic.skillLevel as SkillLevel,
    episode_count: topic.episodeCount,
    total_duration_sec: topic.totalDurationSec,
    view_count: topic.viewCount,
    like_count: topic.likeCount,
    comment_count: topic.commentCount,
    bookmark_count: topic.bookmarkCount,
    rating_count: topic.ratingCount,
    rating_avg:
      topic.ratingCount > 0
        ? Math.round((topic.ratingSum / topic.ratingCount) * 10) / 10
        : null,
    author_name: opts.author,
    published_at: topic.publishedAt?.toISOString() ?? null,
    is_free: opts.isFree,
    status: topic.status as string,

    // "Why take this topic" - the sales pitch, always playable via
    // GET /topics/:id/intro. The key itself stays server-side.
    has_intro: Boolean(topic.introVideoKey),
    intro_duration_sec: topic.introDurationSec,
    intro_thumbnail_url: publicAssetUrl(topic.introThumbnailKey),
    why_learn: topic.whyLearn,
    outcomes: topic.outcomes,

    /** Lets the UI render "2 of 6 episodes included" without recomputing the rule. */
    preview: {
      unlocked_episodes: unlocked,
      preview_limit: previewLimit,
      total_episodes: rel.episodes.length,
    },

    episodes: rel.episodes.map((l, i) => {
      // Position is the row's place in the ordered list, not `sortOrder` - a gap
      // in sort_order must not widen the free window.
      const locked = unlocked === "all" ? false : !(l.isPreview || i + 1 <= unlocked);
      return {
        id: l.id,
        slug: l.slug,
        title: l.title,
        description: l.description,
        sort_order: l.sortOrder,
        duration_sec: l.durationSec,
        is_preview: l.isPreview,
        has_captions: Boolean(l.captionsKey),
        upload_status: l.uploadStatus,
        thumbnail_url: publicAssetUrl(l.thumbnailKey),
        locked,
        lock_reason: locked ? ("entitlement_required" as const) : null,
      };
    }),
    links: rel.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
    resource_count: rel.attachments.length,
    // Kept for the existing detail page. Files only, and metadata only - the
    // full list (prompts and links included) is GET /topics/:id/resources.
    attachments: rel.attachments
      .filter((a) => a.kind === "file")
      .map((a) => ({
        id: a.id,
        filename: a.filename,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
      })),
    hashtags: rel.hashtags,
    categories: rel.categories.map(serialiseCategoryRef),

    // commercial disclosure - always rendered when present (§9.5)
    affiliate_tool: topic.affiliateTool,
    affiliate_url: topic.affiliateUrl,
    is_sponsored: topic.isSponsored,
    sponsor_name: topic.sponsorName,
    disclosure_text: topic.disclosureText,

    entitlement: {
      allowed: opts.entitlement.allowed,
      reason: opts.entitlement.reason,
    },
  };

  if (!opts.includeAdminFields) return detail;

  return {
    ...detail,
    publish_at: topic.publishAt?.toISOString() ?? null,
    // Admin-only: the upload UI needs to know what is already attached.
    intro_video_key: topic.introVideoKey,
    intro_captions_key: topic.introCaptionsKey,
    intro_thumbnail_key: topic.introThumbnailKey,
    thumbnail_key: topic.thumbnailKey,
    free_order: topic.freeOrder,
    pricing_model: topic.pricingModel,
    price_cents: topic.priceCents,
    currency: topic.currency,
    origin: topic.origin,
    owner_id: topic.ownerId,
    author_id: topic.authorId,
    impression_count: topic.impressionCount,
    enrollment_count: topic.enrollmentCount,
    deleted_at: topic.deletedAt?.toISOString() ?? null,
    created_at: topic.createdAt.toISOString(),
    updated_at: topic.updatedAt.toISOString(),
  };
}

/** Live published-topic count per category, used by GET /categories. */
export async function categoryTopicCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      categoryId: topicCategories.categoryId,
      count: sql<number>`count(distinct ${topics.id})::int`,
    })
    .from(topicCategories)
    .innerJoin(
      topics,
      and(
        eq(topics.id, topicCategories.topicId),
        eq(topics.status, "published"),
        isNull(topics.deletedAt),
      ),
    )
    .groupBy(topicCategories.categoryId);

  return new Map(rows.map((r) => [r.categoryId, r.count]));
}

export function serialiseCategory(
  row: typeof categories.$inferSelect,
  topicCount: number,
) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color_hex: row.colorHex,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    topic_count: topicCount,
  };
}

export function serialiseEpisode(l: EpisodeRow, opts: { includeKeys?: boolean } = {}) {
  const base = {
    id: l.id,
    topic_id: l.topicId,
    slug: l.slug,
    title: l.title,
    description: l.description,
    sort_order: l.sortOrder,
    duration_sec: l.durationSec,
    is_preview: l.isPreview,
    upload_status: l.uploadStatus,
    upload_error: l.uploadError,
    has_captions: Boolean(l.captionsKey),
    thumbnail_url: publicAssetUrl(l.thumbnailKey),
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
  // Admin-only: keys are needed by the upload UI to show what is attached.
  if (!opts.includeKeys) return base;
  return {
    ...base,
    video_s3_key: l.videoS3Key,
    hls_manifest_key: l.hlsManifestKey,
    captions_key: l.captionsKey,
    thumbnail_key: l.thumbnailKey,
  };
}
