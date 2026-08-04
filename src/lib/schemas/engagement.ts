import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { publicAssetUrl } from "@/lib/storage";

/**
 * Zod schemas + serialisers shared by the feed, engagement, comment,
 * notification and dashboard routes.
 *
 * NOTE: `src/lib/topics.ts` is owned by another workstream. If/when it exists,
 * its card serialiser supersedes `serialiseCard` here - the shape below is the
 * contract both must satisfy (snake_case, no internal ids leaked).
 */

/* ============================================================
   QUERY PARAM PRIMITIVES
   ============================================================ */

/**
 * A limit that never 422s the caller. Garbage or absent -> the default.
 * (`.catch` also swallows the undefined -> NaN coercion, so no `.default` needed.)
 */
export const limitParam = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).catch(fallback);

/** Query strings arrive as "true"/"1"; anything else is false. */
export const boolParam = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "true" || v === "1");

export const cursorParam = z.string().min(1).max(512).optional();

/* ============================================================
   FEED
   ============================================================ */

export const feedQuerySchema = z.object({
  tab: z.enum(["for_you", "everything", "updates"]).catch("for_you"),
  type: z.enum(["topic", "article"]).catch("topic"),
  /** Category slug or id. */
  category: z.string().trim().min(1).max(128).optional(),
  limit: limitParam(20, 50),
  cursor: cursorParam,
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/** Below this many personalised items the feed tops up from everything-else. */
export const THIN_CATEGORY_THRESHOLD = 5;
export const BACKFILL_LABEL = "Popular across Acadu";

/** Cursor payload for every `(publishedAt, id)`-ordered list. */
export interface TimeCursor {
  t: string;
  id: string;
}

export const pagedQuerySchema = z.object({
  limit: limitParam(20, 50),
  cursor: cursorParam,
});

/* ============================================================
   TOPIC CARD
   ============================================================ */

/** The exact column set every card query selects. Keeps the shapes identical. */
export const topicCardColumns = {
  id: topics.id,
  type: topics.type,
  slug: topics.slug,
  title: topics.title,
  subtitle: topics.subtitle,
  excerpt: topics.excerpt,
  thumbnailKey: topics.thumbnailKey,
  skillLevel: topics.skillLevel,
  episodeCount: topics.episodeCount,
  totalDurationSec: topics.totalDurationSec,
  viewCount: topics.viewCount,
  likeCount: topics.likeCount,
  commentCount: topics.commentCount,
  bookmarkCount: topics.bookmarkCount,
  isFree: topics.isFree,
  isSponsored: topics.isSponsored,
  sponsorName: topics.sponsorName,
  affiliateTool: topics.affiliateTool,
  disclosureText: topics.disclosureText,
  publishedAt: topics.publishedAt,
  createdAt: topics.createdAt,
} as const;

export interface TopicCardRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  thumbnailKey: string | null;
  skillLevel: string;
  episodeCount: number;
  totalDurationSec: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  isFree: boolean;
  isSponsored: boolean;
  sponsorName: string | null;
  affiliateTool: string | null;
  disclosureText: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  liked?: boolean;
  bookmarked?: boolean;
}

/* ============================================================
   ROUTE PARAMS
   ============================================================ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A malformed path id is a 404, not a 422 - the URL simply doesn't exist, and
 * feeding a non-uuid to a uuid column would be a database error.
 */
export function requireUuidParam(value: string, label = "resource"): string {
  if (!UUID_RE.test(value)) throw new ApiError("NOT_FOUND", `That ${label} does not exist.`);
  return value;
}

/**
 * The topic a like / bookmark / comment attaches to. Unpublished and
 * soft-deleted content is invisible to engagement, not merely un-writable.
 */
export async function loadEngageableTopic(topicId: string) {
  const topic = await db.query.topics.findFirst({
    where: and(eq(topics.id, topicId), isNull(topics.deletedAt)),
    columns: {
      id: true,
      type: true,
      slug: true,
      title: true,
      status: true,
      authorId: true,
      ownerId: true,
      likeCount: true,
      bookmarkCount: true,
      commentCount: true,
    },
  });
  if (!topic || topic.status !== "published") {
    throw new ApiError("NOT_FOUND", "That content does not exist.");
  }
  return topic;
}

/** Where a piece of content lives in the app router. */
export function contentPath(type: string, slug: string): string {
  return type === "article" ? `/content/${slug}` : `/watch/${slug}`;
}

/**
 * Counters are read straight off the denormalised columns - never recomputed
 * here, because the feed serialises hundreds of these per render.
 */
export function serialiseCard(row: TopicCardRow) {
  const published = row.publishedAt ?? row.createdAt;
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    href: contentPath(row.type, row.slug),
    title: row.title,
    subtitle: row.subtitle,
    excerpt: row.excerpt,
    thumbnail_url: publicAssetUrl(row.thumbnailKey),
    skill_level: row.skillLevel,
    episode_count: row.episodeCount,
    total_duration_sec: row.totalDurationSec,
    view_count: row.viewCount,
    like_count: row.likeCount,
    comment_count: row.commentCount,
    bookmark_count: row.bookmarkCount,
    is_free: row.isFree,
    is_sponsored: row.isSponsored,
    sponsor_name: row.sponsorName,
    affiliate_tool: row.affiliateTool,
    disclosure_text: row.disclosureText,
    published_at: published.toISOString(),
    liked: row.liked ?? false,
    bookmarked: row.bookmarked ?? false,
  };
}

export type TopicCard = ReturnType<typeof serialiseCard>;

/* ============================================================
   COMMENTS
   ============================================================ */

export const MAX_COMMENT_LENGTH = 2000;
/** Accounts younger than this may not post links (drive-by spam guard). */
export const NEW_ACCOUNT_URL_BLOCK_MS = 24 * 60 * 60 * 1000;

export const createCommentSchema = z.object({
  body: z.string().min(1).max(MAX_COMMENT_LENGTH * 2),
});

export const reportCommentSchema = z.object({
  reason: z.enum(["spam", "abuse", "off_topic", "misinformation", "other"]),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Matched against a KNOWN TAG LIST rather than `<anything>`, because this is a
 * product about machine learning: "loss < 0.5 and acc > 0.9" is a comment
 * someone will genuinely write, and `<[a-z][^>]*>` eats it.
 *
 * React escapes on render anyway - this is defence in depth, so it errs towards
 * letting real comments through.
 */
const HTML_RE =
  /<\/?(?:a|abbr|applet|audio|b|base|blockquote|body|br|button|code|div|em|embed|form|frame|frameset|h[1-6]|head|html|i|iframe|img|input|li|link|marquee|math|meta|object|ol|p|pre|s|script|select|source|span|strong|style|svg|table|td|textarea|th|tr|u|ul|video)\b[^<>]*>|<!--|&lt;\/?(?:script|iframe|img|svg|style)\b/i;

/**
 * Full URLs and bare domains. Deliberately does NOT allow whitespace around the
 * dot: "That's nice. Me too" is not a link, and a false positive here blocks a
 * brand-new user's first comment - the worst possible moment to be wrong.
 */
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|ai|xyz|me|dev|app|info|biz|link|ly|gg|shop|club|site|online|top|ru|cn)\b/i;

export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

/**
 * Control characters, zero-width joiners and bidi overrides are stripped by code
 * point rather than by regex - a literal control character in a source file is a
 * trap for the next person to edit it.
 */
function stripInvisible(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    const isControl = (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
    const isInvisible =
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069) ||
      c === 0x2060 ||
      c === 0xfeff;
    if (!isControl && !isInvisible) out += ch;
  }
  return out;
}

export function sanitiseCommentBody(raw: string): string {
  const cleaned = stripInvisible(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{4,}/g, "   ")
    .trim();

  if (HTML_RE.test(cleaned)) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Comments are plain text - HTML and markup are not allowed.",
      { body: "Remove any HTML tags." },
    );
  }
  if (cleaned.length < 1) {
    throw new ApiError("VALIDATION_FAILED", "Write something first.", {
      body: "Comment cannot be empty.",
    });
  }
  if (cleaned.length > MAX_COMMENT_LENGTH) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `Comments are limited to ${MAX_COMMENT_LENGTH} characters.`,
      { body: `${cleaned.length} of ${MAX_COMMENT_LENGTH} characters.` },
    );
  }
  return cleaned;
}

export interface CommentRow {
  id: string;
  body: string;
  status: string;
  reportCount: number;
  createdAt: Date;
  userId: string;
  authorNickname: string | null;
  authorAvatarKey: string | null;
}

export function serialiseComment(row: CommentRow, viewerId: string | null) {
  return {
    id: row.id,
    body: row.body,
    created_at: row.createdAt.toISOString(),
    report_count: row.reportCount,
    is_own: viewerId !== null && row.userId === viewerId,
    author: {
      id: row.userId,
      nickname: row.authorNickname ?? "Someone",
      avatar_url: publicAssetUrl(row.authorAvatarKey),
      avatar_key: row.authorAvatarKey,
    },
  };
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

export const notificationsQuerySchema = z.object({
  unread_only: boolParam,
  limit: limitParam(50, 100),
  cursor: cursorParam,
});

export const notificationPreferencesSchema = z
  .object({
    new_content: z.boolean().optional(),
    comment_replies: z.boolean().optional(),
    cohort_milestones: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one preference to update.",
  });

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  topicId: string | null;
  actorId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function serialiseNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link_url: row.linkUrl,
    topic_id: row.topicId,
    actor_id: row.actorId,
    read: row.readAt !== null,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/* ============================================================
   CLIENT ANALYTICS
   ============================================================ */

export const clientEventSchema = z.object({
  event: z.string().min(1).max(64),
  topic_id: z.uuid().optional(),
  episode_id: z.uuid().optional(),
  category_id: z.uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Client clock; recorded in metadata, never trusted as the row timestamp. */
  ts: z.string().max(64).optional(),
});

export const eventBatchSchema = z.object({
  session_id: z.string().max(128).optional(),
  events: z.array(clientEventSchema).min(1).max(50),
});
export type ClientEventInput = z.infer<typeof clientEventSchema>;
