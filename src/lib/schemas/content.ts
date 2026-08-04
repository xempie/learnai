/**
 * Zod contracts for the topic / episode / category / upload surface.
 *
 * Two rules shape everything here:
 *   1. The client never supplies publish state, counters, or role. Those fields
 *      are simply absent from the input schemas, so an extra key in the body is
 *      dropped rather than trusted.
 *   2. Anything with a hard limit in `config.limits` or a DB check constraint is
 *      validated here as well, so the caller gets a readable message instead of
 *      a 500 from Postgres.
 */

import { z } from "zod";
import { config } from "@/lib/config";

/* ---------------- shared vocabularies ---------------- */

export const TOPIC_TYPES = ["topic", "article"] as const;
export const SKILL_LEVELS = ["basic", "intermediate", "advanced"] as const;
export const TOPIC_STATUSES = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "unpublished",
  "rejected",
] as const;
export const UPLOAD_STATUSES = [
  "pending",
  "uploading",
  "processing",
  "ready",
  "failed",
] as const;
/** `avatar` is owned by the profile routes, not by the topic upload flow. */
export const TOPIC_UPLOAD_KINDS = ["video", "thumbnail", "captions", "attachment"] as const;
/**
 * A topic resource is one of three things the learner can take away:
 * a downloadable file, a reusable prompt, or an external link.
 */
export const RESOURCE_KINDS = ["file", "prompt", "link"] as const;

export type TopicType = (typeof TOPIC_TYPES)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/* ---------------- primitives ---------------- */

const uuid = z.uuid("Must be a valid id.");

/** Trimmed free text that treats "" as absent - query strings send empty keys. */
const queryText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const limitParam = (def: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : def))
    .pipe(z.number().int().min(1).max(max));

/** Storage keys are always server-generated; the client only echoes one back. */
const storageKey = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((v) => !v.includes("..") && !v.startsWith("/") && !v.includes("\\"), {
    message: "Invalid storage key.",
  });

const hashtag = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((v) => v.replace(/^#+/, "").toLowerCase())
  .refine((v) => /^[a-z0-9][a-z0-9_-]*$/.test(v), {
    message: "Hashtags may contain letters, numbers, hyphens and underscores only.",
  });

const durationSec = z
  .number()
  .int()
  .min(0)
  .max(
    config.limits.maxEpisodeDurationSec,
    `Episodes must be ${config.limits.maxEpisodeDurationSec} seconds or shorter.`,
  );

/** The intro video is held to the same hard cap as a episode. */
const introDurationSec = z
  .number()
  .int()
  .min(0)
  .max(
    config.limits.maxEpisodeDurationSec,
    `The intro video must be ${config.limits.maxEpisodeDurationSec} seconds or shorter.`,
  );

/** External links must be fetchable by a browser - no javascript:, data: or file:. */
const externalUrl = z
  .url("Links must be a valid URL.")
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), {
    message: "Links must start with http:// or https://.",
  });

/* ---------------- public reads ---------------- */

export const topicListQuery = z.object({
  /** Category slug or id. */
  category: queryText(120),
  /** Articles are listed separately for now, so `topic` is the default. */
  type: z.enum(TOPIC_TYPES).optional().transform((v) => v ?? "topic"),
  level: z.enum(SKILL_LEVELS).optional(),
  limit: limitParam(20, 50),
  cursor: queryText(512),
  q: queryText(120),
});
export type TopicListQuery = z.infer<typeof topicListQuery>;

export const playbackSchema = z.object({
  episodeId: uuid,
});

export const progressSchema = z.object({
  episodeId: uuid,
  positionSec: z.number().int().min(0).max(config.limits.maxEpisodeDurationSec * 10),
  watchedPct: z.number().int().min(0).max(100),
});

export const affiliateClickSchema = z
  .object({
    /** Optional client hint; the stored tool always comes from the topic row. */
    source: z.string().trim().max(60).optional(),
  })
  .optional()
  .transform((v) => v ?? {});

/* ---------------- admin reads ---------------- */

export const adminTopicListQuery = z.object({
  status: z.enum(TOPIC_STATUSES).optional(),
  type: z.enum(TOPIC_TYPES).optional(),
  category: queryText(120),
  q: queryText(120),
  limit: limitParam(50, 200),
  cursor: queryText(512),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

/* ---------------- topic write ---------------- */

export const topicLinkInput = z.object({
  url: z.url("Links must be a valid URL.").max(2048),
  label: z.string().trim().max(120).nullish(),
});

export const topicAttachmentInput = z.object({
  /** The key returned by POST /admin/topics/:id/upload-url. */
  key: storageKey,
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(config.limits.maxAttachmentBytes),
});

/** Fields shared by create and update. Deliberately omits status and counters. */
const topicWritableShape = {
  title: z.string().trim().min(3, "Give the topic a title.").max(200),
  subtitle: z.string().trim().max(300).nullish(),
  body: z.string().max(200_000).nullish(),
  excerpt: z.string().trim().max(500).nullish(),
  thumbnailKey: storageKey.nullish(),
  skillLevel: z.enum(SKILL_LEVELS),
  // "Why take this topic" intro. Playable without an entitlement, so it is the
  // one piece of topic video the sales page may show in full.
  introVideoKey: storageKey.nullish(),
  introCaptionsKey: storageKey.nullish(),
  introThumbnailKey: storageKey.nullish(),
  introDurationSec: introDurationSec.nullish(),
  /** Markdown. */
  whyLearn: z.string().max(20_000).nullish(),
  /** Markdown bullet list. */
  outcomes: z.string().max(20_000).nullish(),
  categoryIds: z.array(uuid).min(1, "Pick at least one category.").max(5),
  hashtags: z.array(hashtag).max(20),
  links: z.array(topicLinkInput).max(
    config.limits.maxLinksPerTopic,
    `A topic may have at most ${config.limits.maxLinksPerTopic} links.`,
  ),
  attachments: z.array(topicAttachmentInput).max(
    config.limits.maxAttachmentsPerTopic,
    `A topic may have at most ${config.limits.maxAttachmentsPerTopic} attachments.`,
  ),
  isFree: z.boolean(),
  freeOrder: z.number().int().min(1).max(999).nullish(),
  // commercial disclosure - see `buildDisclosureText`
  affiliateTool: z.string().trim().max(120).nullish(),
  affiliateUrl: z.url("Affiliate link must be a valid URL.").max(2048).nullish(),
  isSponsored: z.boolean(),
  sponsorName: z.string().trim().max(120).nullish(),
  disclosureText: z.string().trim().max(500).nullish(),
};

export const createTopicSchema = z.object({
  type: z.enum(TOPIC_TYPES).optional().transform((v) => v ?? "topic"),
  title: topicWritableShape.title,
  subtitle: topicWritableShape.subtitle,
  body: topicWritableShape.body,
  excerpt: topicWritableShape.excerpt,
  thumbnailKey: topicWritableShape.thumbnailKey,
  skillLevel: topicWritableShape.skillLevel.optional().transform((v) => v ?? "basic"),
  categoryIds: topicWritableShape.categoryIds,
  hashtags: topicWritableShape.hashtags.optional().transform((v) => v ?? []),
  links: topicWritableShape.links.optional().transform((v) => v ?? []),
  attachments: topicWritableShape.attachments.optional().transform((v) => v ?? []),
  isFree: topicWritableShape.isFree.optional().transform((v) => v ?? false),
  freeOrder: topicWritableShape.freeOrder,
  affiliateTool: topicWritableShape.affiliateTool,
  affiliateUrl: topicWritableShape.affiliateUrl,
  isSponsored: topicWritableShape.isSponsored.optional().transform((v) => v ?? false),
  sponsorName: topicWritableShape.sponsorName,
  disclosureText: topicWritableShape.disclosureText,
});
export type CreateTopicInput = z.infer<typeof createTopicSchema>;

export const updateTopicSchema = z
  .object({
    title: topicWritableShape.title.optional(),
    /** Explicit slug override; still uniquified server-side. */
    slug: z.string().trim().min(1).max(120).optional(),
    subtitle: topicWritableShape.subtitle,
    body: topicWritableShape.body,
    excerpt: topicWritableShape.excerpt,
    thumbnailKey: topicWritableShape.thumbnailKey,
    skillLevel: topicWritableShape.skillLevel.optional(),
    introVideoKey: topicWritableShape.introVideoKey,
    introCaptionsKey: topicWritableShape.introCaptionsKey,
    introThumbnailKey: topicWritableShape.introThumbnailKey,
    introDurationSec: topicWritableShape.introDurationSec,
    whyLearn: topicWritableShape.whyLearn,
    outcomes: topicWritableShape.outcomes,
    categoryIds: topicWritableShape.categoryIds.optional(),
    hashtags: topicWritableShape.hashtags.optional(),
    links: topicWritableShape.links.optional(),
    attachments: topicWritableShape.attachments.optional(),
    isFree: topicWritableShape.isFree.optional(),
    freeOrder: topicWritableShape.freeOrder,
    affiliateTool: topicWritableShape.affiliateTool,
    affiliateUrl: topicWritableShape.affiliateUrl,
    isSponsored: topicWritableShape.isSponsored.optional(),
    sponsorName: topicWritableShape.sponsorName,
    disclosureText: topicWritableShape.disclosureText,
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;

export const publishSchema = z
  .object({
    /** Future timestamp -> `scheduled`. Absent or past -> publish now. */
    publishAt: z.coerce.date().nullish(),
  })
  .optional()
  .transform((v) => v ?? {});

/* ---------------- episode write ---------------- */

const episodeWritableShape = {
  title: z.string().trim().min(1, "Give the episode a title.").max(200),
  description: z.string().trim().max(5000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  videoS3Key: storageKey.nullish(),
  hlsManifestKey: storageKey.nullish(),
  thumbnailKey: storageKey.nullish(),
  captionsKey: storageKey.nullish(),
  durationSec: durationSec.optional(),
  isPreview: z.boolean().optional(),
  uploadStatus: z.enum(UPLOAD_STATUSES).optional(),
};

export const createEpisodeSchema = z.object(episodeWritableShape);
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const updateEpisodeSchema = z
  .object({ ...episodeWritableShape, title: episodeWritableShape.title.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>;

/* ---------------- resources (files, prompts, links) ---------------- */

/**
 * Shared by every resource kind. `downloadCount` is deliberately absent: a
 * counter is never client-supplied.
 */
const resourceCommonShape = {
  title: z.string().trim().min(1, "Give the resource a title.").max(200),
  description: z.string().trim().max(1000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Available without a subscription. */
  isPreview: z.boolean().optional(),
};

/**
 * Discriminated on `kind` so the required columns per kind are enforced here
 * rather than surfacing as a Postgres check-constraint violation.
 */
export const createResourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    ...resourceCommonShape,
    /** The key returned by POST /admin/topics/:id/upload-url with kind=attachment. */
    s3Key: storageKey,
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().min(1).max(config.limits.maxAttachmentBytes),
  }),
  z.object({
    kind: z.literal("prompt"),
    ...resourceCommonShape,
    body: z.string().trim().min(1, "A prompt needs some text.").max(20_000),
  }),
  z.object({
    kind: z.literal("link"),
    ...resourceCommonShape,
    url: externalUrl,
  }),
]);
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

/**
 * `kind` is immutable - changing it would strand the columns the check
 * constraint relies on. Delete and recreate instead.
 */
export const updateResourceSchema = z
  .object({
    title: resourceCommonShape.title.optional(),
    description: resourceCommonShape.description,
    body: z.string().trim().min(1, "A prompt needs some text.").max(20_000).optional(),
    url: externalUrl.optional(),
    sortOrder: resourceCommonShape.sortOrder,
    isPreview: resourceCommonShape.isPreview,
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

/* ---------------- uploads ---------------- */

export const uploadUrlSchema = z.object({
  kind: z.enum(TOPIC_UPLOAD_KINDS),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(config.limits.maxVideoBytes),
  /** Display name only - it never becomes part of the storage key. */
  filename: z.string().trim().max(255).optional(),
});

/* ---------------- categories ---------------- */

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #2563eb");

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullish(),
  colorHex: hexColour.nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).nullish(),
    colorHex: hexColour.nullish(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const mergeCategorySchema = z.object({
  targetCategoryId: uuid,
});
