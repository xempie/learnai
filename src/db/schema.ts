/**
 * Acadu database schema (Drizzle / PostgreSQL).
 *
 * Covers V1_BUILD_SPEC §2.2 and the parts of TECHNICAL_SPEC §5.1 that V1 keeps
 * (quizzes, streaks, points, certificates arrive in weeks 2-4 but the tables are
 * defined here so migrations stay forward-only).
 *
 * YEAR-2 MARKETPLACE READINESS
 * The content model is already creator-owned rather than platform-owned:
 *   - `topics.owner_id` + `topics.origin` distinguish first-party from creator content
 *   - `instructor_profiles` holds the seller identity and payout account
 *   - `topics.price_cents` / `pricing_model` allow per-topic sale alongside subscription
 *   - `enrollments` records entitlement per user per topic, however it was acquired
 *   - `payouts` / `order_items` capture revenue split
 * None of this is exposed in V1 - only platform_admins can create topics today -
 * but no destructive migration is needed to open it up.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ============================================================
   ORGANISATIONS  (cohort layer - the core differentiator)
   ============================================================ */

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    type: text("type").notNull().default("other"),
    logoUrl: text("logo_url"),
    /** Auto-created from an unrecognised email domain; flagged for founder review. */
    isProvisional: boolean("is_provisional").notNull().default(true),
    // B2B licensing
    licenseType: text("license_type").notNull().default("none"),
    seatsTotal: integer("seats_total").notNull().default(0),
    seatsUsed: integer("seats_used").notNull().default(0),
    licenseExpiresAt: timestamp("license_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("org_type", sql`${t.type} in ('university','company','other')`),
    check("org_license", sql`${t.licenseType} in ('none','pilot','paid')`),
  ],
);

/** An org may claim several domains (adelaide.edu.au, student.adelaide.edu.au). */
export const organizationDomains = pgTable(
  "organization_domains",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** lowercase, no '@' */
    domain: text("domain").notNull().unique(),
    verified: boolean("verified").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("org_domains_domain_idx").on(t.domain)],
);

/**
 * Organisation join codes - lets someone join a team when their email domain
 * doesn't match (contractors, personal addresses, BYO-device staff).
 */
export const orgJoinCodes = pgTable(
  "org_join_codes",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human-transcribable, uppercase, e.g. ADEL-7K2P. Unique across the platform. */
    code: text("code").notNull().unique(),
    label: text("label"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("org_join_codes_org_idx").on(t.orgId)],
);

export const orgJoinCodeRedemptions = pgTable(
  "org_join_code_redemptions",
  {
    id: id(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => orgJoinCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    redeemedAt: createdAt(),
  },
  (t) => [unique("org_join_code_once_per_user").on(t.codeId, t.userId)],
);

/* ============================================================
   USERS
   ============================================================ */

export const users = pgTable(
  "users",
  {
    id: id(),
    cognitoSub: text("cognito_sub").notNull().unique(),
    /** lowercased on write */
    email: text("email").notNull().unique(),
    emailDomain: text("email_domain").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** 'email' | 'google' - which Cognito identity provider created the account */
    authProvider: text("auth_provider").notNull().default("email"),
    nickname: text("nickname").notNull(),
    avatarKey: text("avatar_key"),
    realName: text("real_name"),
    ageRange: text("age_range").notNull(),
    role: text("role").notNull().default("learner"),
    persona: text("persona"),
    skillLevel: text("skill_level").notNull().default("basic"),
    locale: text("locale").notNull().default("en-AU"),
    timezone: text("timezone").notNull().default("Australia/Sydney"),
    // cohort
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    /** OPT-IN. Never default true - V1_BUILD_SPEC §5.1, TECHNICAL_SPEC §7.2 */
    orgVisible: boolean("org_visible").notNull().default(false),
    isFoundingMember: boolean("is_founding_member").notNull().default(false),
    // lifecycle
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    isSuspended: boolean("is_suspended").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "users_role",
      sql`${t.role} in ('learner','instructor','org_admin','content_reviewer','platform_admin')`,
    ),
    check(
      "users_age_range",
      sql`${t.ageRange} in ('16-24','25-34','35-44','45-54','55-64','65+')`,
    ),
    check("users_auth_provider", sql`${t.authProvider} in ('email','google','linkedin')`),
    check("users_skill_level", sql`${t.skillLevel} in ('basic','intermediate','advanced')`),
    index("users_org_idx").on(t.orgId),
    index("users_email_domain_idx").on(t.emailDomain),
  ],
);

/**
 * Local credential store, used only when Cognito is not configured (dev mode).
 * In production Cognito owns passwords and none of these columns are written.
 */
export const authCredentials = pgTable("auth_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  verificationCode: text("verification_code"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  resetCode: text("reset_code"),
  resetExpiresAt: timestamp("reset_expires_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: updatedAt(),
});

/* ============================================================
   TAXONOMY
   ============================================================ */

export const categories = pgTable("categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  colorHex: text("color_hex"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A user picks exactly 3 at onboarding; editable later. */
export const userCategories = pgTable(
  "user_categories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.categoryId] }),
    check("user_categories_rank", sql`${t.rank} between 1 and 3`),
  ],
);

/* ============================================================
   INSTRUCTORS  (year 2 - seller identity; unused in V1)
   ============================================================ */

export const instructorProfiles = pgTable("instructor_profiles", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  headline: text("headline"),
  bio: text("bio"),
  websiteUrl: text("website_url"),
  /** 'pending' until a human approves them to publish paid content. */
  status: text("status").notNull().default("pending"),
  /** Stripe Connect account for payouts. */
  stripeAccountId: text("stripe_account_id"),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  /** Platform's share, basis points. 3000 = platform keeps 30%. */
  revenueShareBps: integer("revenue_share_bps").notNull().default(3000),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ============================================================
   CONTENT
   A `topic` is the sellable/listable unit. It holds ordered `episodes`
   (videos). Articles reuse the same table with type='article' and no episodes,
   so the feed can merge them again later without a migration.
   ============================================================ */

export const topics = pgTable(
  "topics",
  {
    id: id(),
    /** 'topic' = video topic with episodes. 'article' = written post. */
    type: text("type").notNull().default("topic"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    /** markdown - article body, or topic overview */
    body: text("body"),
    excerpt: text("excerpt"),
    thumbnailKey: text("thumbnail_key"),
    skillLevel: text("skill_level").notNull().default("basic"),

    /**
     * "Why take this topic" intro video. Always playable without entitlement -
     * it is the sales pitch, so gating it would be self-defeating.
     */
    introVideoKey: text("intro_video_key"),
    introCaptionsKey: text("intro_captions_key"),
    introThumbnailKey: text("intro_thumbnail_key"),
    introDurationSec: integer("intro_duration_sec"),
    /** Markdown: why this topic is worth a learner's time. Rendered above the episode list. */
    whyLearn: text("why_learn"),
    /** Markdown bullet list: what the learner will be able to do afterwards. */
    outcomes: text("outcomes"),

    // --- ownership (year-2 marketplace) ---
    /** Null for platform-authored content. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    origin: text("origin").notNull().default("platform"),

    // --- commerce (year-2; V1 leaves everything on 'subscription') ---
    pricingModel: text("pricing_model").notNull().default("subscription"),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    /** Part of the permanently-free set (TECHNICAL_SPEC §7.5). */
    isFree: boolean("is_free").notNull().default(false),
    freeOrder: integer("free_order"),

    // --- denormalised, maintained in the same transaction as the action ---
    episodeCount: integer("episode_count").notNull().default(0),
    totalDurationSec: integer("total_duration_sec").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    bookmarkCount: integer("bookmark_count").notNull().default(0),
    enrollmentCount: integer("enrollment_count").notNull().default(0),
    impressionCount: integer("impression_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),

    // --- publishing ---
    status: text("status").notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),

    // --- commercial disclosure (TECHNICAL_SPEC §9.5 - rendered automatically) ---
    affiliateTool: text("affiliate_tool"),
    affiliateUrl: text("affiliate_url"),
    isSponsored: boolean("is_sponsored").notNull().default(false),
    sponsorName: text("sponsor_name"),
    disclosureText: text("disclosure_text"),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("topics_type", sql`${t.type} in ('topic','article')`),
    check("topics_origin", sql`${t.origin} in ('platform','creator')`),
    check(
      "topics_status",
      sql`${t.status} in ('draft','in_review','scheduled','published','unpublished','rejected')`,
    ),
    check(
      "topics_pricing_model",
      sql`${t.pricingModel} in ('subscription','one_off','free')`,
    ),
    check("topics_skill_level", sql`${t.skillLevel} in ('basic','intermediate','advanced')`),
    check("topics_price_non_negative", sql`${t.priceCents} >= 0`),
    index("topics_status_published_idx").on(t.status, t.publishedAt),
    index("topics_scheduled_idx").on(t.publishAt),
    index("topics_owner_idx").on(t.ownerId),
  ],
);

/** An ordered video inside a topic. The 5-minute cap is enforced here. */
export const episodes = pgTable(
  "episodes",
  {
    id: id(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),

    // media
    videoS3Key: text("video_s3_key"),
    hlsManifestKey: text("hls_manifest_key"),
    thumbnailKey: text("thumbnail_key"),
    /** WebVTT. Required before a episode may publish. */
    captionsKey: text("captions_key"),
    durationSec: integer("duration_sec").notNull().default(0),

    /** Upload/transcode lifecycle so the admin UI can show progress. */
    uploadStatus: text("upload_status").notNull().default("pending"),
    uploadError: text("upload_error"),

    /** Free preview episode, visible without entitlement. */
    isPreview: boolean("is_preview").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("episodes_topic_slug").on(t.topicId, t.slug),
    check("episodes_duration_cap", sql`${t.durationSec} <= 360`),
    check(
      "episodes_upload_status",
      sql`${t.uploadStatus} in ('pending','uploading','processing','ready','failed')`,
    ),
    index("episodes_topic_order_idx").on(t.topicId, t.sortOrder),
  ],
);

export const topicCategories = pgTable(
  "topic_categories",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.categoryId] }),
    index("topic_categories_category_idx").on(t.categoryId),
  ],
);

export const hashtags = pgTable("hashtags", {
  id: id(),
  /** lowercase, no '#' */
  tag: text("tag").notNull().unique(),
});

export const topicHashtags = pgTable(
  "topic_hashtags",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    hashtagId: uuid("hashtag_id")
      .notNull()
      .references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.hashtagId] })],
);

export const topicLinks = pgTable("topic_links", {
  id: id(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Topic resources: downloadable files, reusable prompts, and external links.
 *
 * One table rather than three because the learner sees a single "Resources"
 * list and the admin manages one ordered collection. `kind` decides which
 * columns are meaningful:
 *   file   -> s3Key, filename, mimeType, sizeBytes
 *   prompt -> body (the prompt text, copyable in the UI)
 *   link   -> url
 */
export const topicAttachments = pgTable(
  "topic_attachments",
  {
    id: id(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("file"),
    title: text("title").notNull().default("Untitled resource"),
    description: text("description"),

    /** kind = 'file'. Generated key - never the user-supplied filename. */
    s3Key: text("s3_key"),
    filename: text("filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    /** kind = 'prompt': the prompt text. Also used for markdown snippets. */
    body: text("body"),
    /** kind = 'link' */
    url: text("url"),

    sortOrder: integer("sort_order").notNull().default(0),
    /**
     * Available without a subscription. Use for the sample worksheet that
     * shows a prospect the quality of the material.
     */
    isPreview: boolean("is_preview").notNull().default(false),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("topic_attachments_kind", sql`${t.kind} in ('file','prompt','link')`),
    check(
      "topic_attachments_shape",
      sql`(${t.kind} = 'file' and ${t.s3Key} is not null)
       or (${t.kind} = 'prompt' and ${t.body} is not null)
       or (${t.kind} = 'link' and ${t.url} is not null)`,
    ),
    index("topic_attachments_topic_idx").on(t.topicId, t.sortOrder),
  ],
);

/* ============================================================
   ENROLMENT + PROGRESS
   ============================================================ */

/** Entitlement to a topic, however acquired. Year-2 purchases land here too. */
export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** how the entitlement was granted */
    source: text("source").notNull().default("subscription"),
    orderId: uuid("order_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    progressPct: integer("progress_pct").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("enrollments_user_topic").on(t.userId, t.topicId),
    check(
      "enrollments_source",
      sql`${t.source} in ('free','subscription','org_license','purchase','coupon','gift')`,
    ),
    index("enrollments_user_idx").on(t.userId),
  ],
);

export const episodeProgress = pgTable(
  "episode_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    positionSec: integer("position_sec").notNull().default(0),
    watchedPct: integer("watched_pct").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.episodeId] }),
    index("episode_progress_user_idx").on(t.userId, t.completed),
  ],
);

/* ============================================================
   QUIZZES  (schema now, UI in weeks 2-4)
   ============================================================ */

export const quizzes = pgTable("quizzes", {
  id: id(),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }),
  passScore: integer("pass_score").notNull().default(70),
  createdAt: createdAt(),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: id(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  explanation: text("explanation"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const quizOptions = pgTable("quiz_options", {
  id: id(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => quizQuestions.id, { onDelete: "cascade" }),
  optionText: text("option_text").notNull(),
  /** Never serialised to the client before submission (TECHNICAL_SPEC §6.2). */
  isCorrect: boolean("is_correct").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    passed: boolean("passed").notNull(),
    answers: jsonb("answers").notNull(),
    attemptNo: integer("attempt_no").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("quiz_attempts_user_idx").on(t.userId, t.createdAt)],
);

/* ============================================================
   GAMIFICATION  (schema now, UI in weeks 2-4)
   ============================================================ */

export const dailyActivity = pgTable(
  "daily_activity",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** the user's LOCAL date, derived server-side (TECHNICAL_SPEC §7.4) */
    activityDate: date("activity_date").notNull(),
    episodesCompleted: integer("episodes_completed").notNull().default(0),
    quizzesPassed: integer("quizzes_passed").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.activityDate] })],
);

export const userStreaks = pgTable("user_streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActivityDate: date("last_activity_date"),
  timezone: text("timezone").notNull().default("Australia/Sydney"),
  updatedAt: updatedAt(),
});

export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: id(),
    scope: text("scope").notNull(),
    scopeId: text("scope_id"),
    period: text("period").notNull(),
    periodStart: date("period_start").notNull(),
    entries: jsonb("entries").notNull(),
    generatedAt: createdAt(),
  },
  (t) => [
    unique("leaderboard_unique").on(t.scope, t.scopeId, t.period, t.periodStart),
    check("leaderboard_scope", sql`${t.scope} in ('org','global','category')`),
    check("leaderboard_period", sql`${t.period} in ('weekly','monthly','alltime')`),
  ],
);

export const certificates = pgTable(
  "certificates",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    skillLevel: text("skill_level"),
    /** Random, non-sequential, human-transcribable (Crockford base32). */
    serial: text("serial").notNull().unique(),
    pdfKey: text("pdf_key"),
    issuedAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("certificates_serial_idx").on(t.serial)],
);

/* ============================================================
   ENGAGEMENT
   ============================================================ */

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: text("status").notNull().default("visible"),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("comments_body_len", sql`length(${t.body}) between 1 and 2000`),
    check("comments_status", sql`${t.status} in ('visible','hidden','deleted')`),
    index("comments_topic_idx").on(t.topicId, t.createdAt),
    index("comments_user_idx").on(t.userId, t.createdAt),
  ],
);

export const commentReports = pgTable(
  "comment_reports",
  {
    id: id(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("comment_reports_once").on(t.commentId, t.reporterId),
    check(
      "comment_reports_reason",
      sql`${t.reason} in ('spam','abuse','off_topic','misinformation','other')`,
    ),
    check("comment_reports_status", sql`${t.status} in ('open','resolved','dismissed')`),
  ],
);

/** Topic ratings - year-2 marketplace signal, harmless in V1. */
export const topicReviews = pgTable(
  "topic_reviews",
  {
    id: id(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body"),
    status: text("status").notNull().default("visible"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("topic_reviews_once").on(t.topicId, t.userId),
    check("topic_reviews_rating", sql`${t.rating} between 1 and 5`),
  ],
);

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "notifications_type",
      sql`${t.type} in ('new_content','comment_reply','comment_on_own','cohort_milestone','system')`,
    ),
    index("notifications_user_idx").on(t.userId, t.createdAt),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  newContent: boolean("new_content").notNull().default(true),
  commentReplies: boolean("comment_replies").notNull().default(true),
  cohortMilestones: boolean("cohort_milestones").notNull().default(true),
  updatedAt: updatedAt(),
});

/* ============================================================
   BILLING
   ============================================================ */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    status: text("status").notNull(),
    plan: text("plan").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "subscriptions_status",
      sql`${t.status} in ('trialing','active','past_due','canceled','incomplete')`,
    ),
    check("subscriptions_plan", sql`${t.plan} in ('free','individual','org_seat')`),
    check("subscriptions_owner", sql`num_nonnulls(${t.userId}, ${t.orgId}) = 1`),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_customer_idx").on(t.stripeCustomerId),
  ],
);

/**
 * Discount codes applied at checkout. Mirrors a Stripe promotion code so the
 * server can validate locally before creating the Checkout Session.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    /** Uppercase, e.g. LAUNCH50. Case-insensitively unique. */
    code: text("code").notNull().unique(),
    description: text("description"),
    discountType: text("discount_type").notNull(),
    /** percent 1-100, or amount in the smallest currency unit */
    discountValue: integer("discount_value").notNull(),
    currency: text("currency").notNull().default("AUD"),
    /** Stripe objects this code maps to. */
    stripeCouponId: text("stripe_coupon_id"),
    stripePromotionCodeId: text("stripe_promotion_code_id"),
    /** Restrict to one topic (year 2) or leave null for the subscription. */
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    /** Restrict to one organisation's staff. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("coupons_discount_type", sql`${t.discountType} in ('percent','fixed')`),
    check("coupons_discount_value", sql`${t.discountValue} > 0`),
    uniqueIndex("coupons_code_lower_idx").on(sql`lower(${t.code})`),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: id(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id"),
    amountOffCents: integer("amount_off_cents").notNull().default(0),
    redeemedAt: createdAt(),
  },
  (t) => [index("coupon_redemptions_coupon_idx").on(t.couponId, t.userId)],
);

/** One-off purchases. Year-2 marketplace; also used for org invoices. */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: text("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("orders_status", sql`${t.status} in ('pending','paid','failed','refunded')`),
    index("orders_user_idx").on(t.userId, t.createdAt),
  ],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
  /** Snapshot - the topic price may change later. */
  titleSnapshot: text("title_snapshot").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  /** Split at time of sale (year 2). */
  instructorId: uuid("instructor_id").references(() => users.id, { onDelete: "set null" }),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  instructorEarningsCents: integer("instructor_earnings_cents").notNull().default(0),
});

/** Creator payouts (year 2). */
export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("AUD"),
    status: text("status").notNull().default("pending"),
    stripeTransferId: text("stripe_transfer_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("payouts_status", sql`${t.status} in ('pending','paid','failed')`)],
);

/** Stripe webhook idempotency (TECHNICAL_SPEC §7.8). */
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: createdAt(),
});

/* ============================================================
   SERVICES FUNNEL  (SERVICES_ACTION_PLAN — leads & enquiries)
   ============================================================ */

/**
 * A service enquiry. The metric that decides everything is qualified
 * conversations per month originating from the platform — that is
 * count(*) where qualified_at is in the month.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** lowercase registrable domain; null for consumer mailboxes */
    orgDomain: text("org_domain"),
    orgName: text("org_name"),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    serviceInterest: text("service_interest").notNull(),
    teamSize: integer("team_size"),
    message: text("message"),
    /** Routed out of the hourly funnel (SERVICES_ACTION_PLAN §3). */
    isTeam: boolean("is_team").notNull().default(false),
    source: text("source").notNull().default("platform"),
    status: text("status").notNull().default("new"),
    notes: text("notes"),
    /** Set once, the first time status reaches 'qualified'. */
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "leads_service",
      sql`${t.serviceInterest} in ('workshop','advisory','pilot_sprint','training','team_platform','other')`,
    ),
    check(
      "leads_status",
      sql`${t.status} in ('new','contacted','qualified','converted','closed')`,
    ),
    index("leads_status_idx").on(t.status, t.createdAt),
    index("leads_qualified_idx").on(t.qualifiedAt),
  ],
);

/* ============================================================
   CONTENT PIPELINE  (human review gate - TECHNICAL_SPEC §8.5)
   ============================================================ */

export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: id(),
    draftType: text("draft_type").notNull(),
    targetTopicId: uuid("target_topic_id").references(() => topics.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: jsonb("body").notNull(),
    sourceRefs: jsonb("source_refs"),
    status: text("status").notNull().default("pending_review"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Step Functions waitForTaskToken */
    taskToken: text("task_token"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "content_drafts_type",
      sql`${t.draftType} in ('script','shot_list','news_post','social_post')`,
    ),
    check(
      "content_drafts_status",
      sql`${t.status} in ('pending_review','approved','rejected','published')`,
    ),
    index("content_drafts_status_idx").on(t.status, t.createdAt),
  ],
);

/* ============================================================
   ANALYTICS + AUDIT
   ============================================================ */

/** Append-only. Never updated. The admin dashboard reads from here. */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: text("session_id"),
    event: text("event").notNull(),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [
    index("analytics_event_time_idx").on(t.event, t.createdAt),
    index("analytics_topic_idx").on(t.topicId, t.event),
    index("analytics_created_idx").on(t.createdAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    /** Nulled after 90 days by a scheduled job (TECHNICAL_SPEC §9.2). */
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_actor_idx").on(t.actorId, t.createdAt)],
);

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  tool: text("tool").notNull(),
  createdAt: createdAt(),
});

/* ============================================================
   RELATIONS
   ============================================================ */

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  categories: many(userCategories),
  enrollments: many(enrollments),
  comments: many(comments),
  notifications: many(notifications),
  instructorProfile: one(instructorProfiles),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  domains: many(organizationDomains),
  members: many(users),
  joinCodes: many(orgJoinCodes),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  owner: one(users, { fields: [topics.ownerId], references: [users.id] }),
  episodes: many(episodes),
  categories: many(topicCategories),
  hashtags: many(topicHashtags),
  links: many(topicLinks),
  attachments: many(topicAttachments),
  comments: many(comments),
  reviews: many(topicReviews),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  topic: one(topics, { fields: [episodes.topicId], references: [topics.id] }),
  progress: many(episodeProgress),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  topic: one(topics, { fields: [comments.topicId], references: [topics.id] }),
  author: one(users, { fields: [comments.userId], references: [users.id] }),
  reports: many(commentReports),
}));
