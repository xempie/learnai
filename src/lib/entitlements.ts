import "server-only";

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, enrollments, episodes, organizations, subscriptions, users } from "@/db/schema";
import { config } from "@/lib/config";

/**
 * The single source of truth for what a user may access (TECHNICAL_SPEC §7.5).
 *
 * The client may RENDER from this, but must never be the enforcement point.
 * Playback signing calls `canAccessTopic` first and only then signs the URL -
 * a leaked signed URL is a leaked video.
 */

/**
 * full  = paid subscriber or org licence: every episode.
 * trial = inside the trial window: intro videos plus the first
 *         PREVIEW_EPISODE_COUNT episodes of every topic.
 * free  = no trial, no subscription: same preview allowance, plus the
 *         permanently-free topics in full.
 */
export type AccessTier = "full" | "trial" | "free";

export interface Entitlements {
  tier: AccessTier;
  /** Why they have the access they have - drives the upgrade copy. */
  reason: "staff" | "org_license" | "active_subscription" | "trial" | "free_tier";
  unlimitedVideos: boolean;
  certificates: boolean;
  leaderboards: boolean;
  streaks: boolean;
  trialEndsAt: Date | null;
  /** Topic ids bought outright (year-2 marketplace). */
  purchasedTopicIds: string[];
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, orgId: true, trialEndsAt: true, role: true },
  });
  if (!user) return freeTier(null, []);

  const purchased = await purchasedTopics(userId);
  const now = new Date();

  // Staff review content before it publishes; they cannot approve a episode
  // they are locked out of. This is a job requirement, not a perk.
  if (user.role === "platform_admin" || user.role === "content_reviewer") {
    return fullTier("staff", user.trialEndsAt, purchased);
  }

  // 1. Organisation licence.
  if (user.orgId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.orgId),
      columns: { licenseType: true, licenseExpiresAt: true },
    });
    const licensed =
      org &&
      (org.licenseType === "pilot" || org.licenseType === "paid") &&
      (!org.licenseExpiresAt || org.licenseExpiresAt > now);
    if (licensed) return fullTier("org_license", user.trialEndsAt, purchased);
  }

  // 2 & 3. Personal subscription: active, or trialing and not yet expired.
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId)),
    orderBy: (s, { desc }) => [desc(s.updatedAt)],
  });

  if (sub?.status === "active") return fullTier("active_subscription", user.trialEndsAt, purchased);
  if (sub?.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt > now) {
    return trialTier(sub.trialEndsAt, purchased);
  }

  // A card-free pilot trial is stored on the user, not on a Stripe subscription.
  if (user.trialEndsAt && user.trialEndsAt > now) {
    return trialTier(user.trialEndsAt, purchased);
  }

  // 4. Otherwise free tier.
  return freeTier(user.trialEndsAt, purchased);
}

function fullTier(
  reason: Entitlements["reason"],
  trialEndsAt: Date | null,
  purchasedTopicIds: string[],
): Entitlements {
  return {
    tier: "full",
    reason,
    unlimitedVideos: true,
    certificates: true,
    leaderboards: true,
    streaks: true,
    trialEndsAt,
    purchasedTopicIds,
  };
}

/**
 * A trial is a preview, not full access: the learner may sample the first
 * episodes of every topic, which is what drives the subscribe decision.
 */
function trialTier(trialEndsAt: Date | null, purchasedTopicIds: string[]): Entitlements {
  return {
    tier: "trial",
    reason: "trial",
    unlimitedVideos: false,
    certificates: false,
    leaderboards: true,
    streaks: true,
    trialEndsAt,
    purchasedTopicIds,
  };
}

function freeTier(trialEndsAt: Date | null, purchasedTopicIds: string[]): Entitlements {
  return {
    tier: "free",
    reason: "free_tier",
    unlimitedVideos: false,
    certificates: false, // blocked on free
    leaderboards: true, // visible - this is the social proof that converts
    streaks: true, // allowed - building the habit is the point
    trialEndsAt,
    purchasedTopicIds,
  };
}

async function purchasedTopics(userId: string): Promise<string[]> {
  const rows = await db
    .select({ topicId: enrollments.topicId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.source, "purchase")));
  return rows.map((r) => r.topicId);
}

/** The permanently-free topic set, ordered. Never triggers new generation. */
export async function freeTopicIds(): Promise<string[]> {
  const rows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.isFree, true),
        eq(topics.status, "published"),
        isNull(topics.deletedAt),
      ),
    )
    .orderBy(asc(topics.freeOrder))
    .limit(config.limits.freeVideoCount);
  return rows.map((r) => r.id);
}

export interface AccessDecision {
  allowed: boolean;
  reason:
    | "full_access"
    | "free_topic"
    | "purchased"
    | "preview_episode"
    | "intro_video"
    | "entitlement_required";
}

/**
 * Whether a user may play a topic's paid episodes. Call this BEFORE signing any
 * playback URL.
 *
 * NOTE: this answers "can they access the topic at all". Per-episode gating -
 * the 2-episode preview - is `canAccessEpisode` below, which is what the playback
 * route must use.
 */
export async function canAccessTopic(
  userId: string,
  topicId: string,
  opts: { entitlements?: Entitlements; isPreviewEpisode?: boolean } = {},
): Promise<AccessDecision> {
  if (opts.isPreviewEpisode) return { allowed: true, reason: "preview_episode" };

  const ent = opts.entitlements ?? (await getEntitlements(userId));
  if (ent.tier === "full") return { allowed: true, reason: "full_access" };
  if (ent.purchasedTopicIds.includes(topicId)) {
    return { allowed: true, reason: "purchased" };
  }

  const free = await freeTopicIds();
  if (free.includes(topicId)) return { allowed: true, reason: "free_topic" };

  return { allowed: false, reason: "entitlement_required" };
}

/**
 * Per-episode gate. This is the one the playback route must call.
 *
 * Rules, in order:
 *   1. Subscribers, org-licensed staff and topic purchasers get everything.
 *   2. Topics flagged `is_free` are fully open to everyone (the permanent
 *      free set from the launch plan).
 *   3. A episode explicitly marked `isPreview` is open.
 *   4. Everyone else - including TRIAL accounts - gets the first
 *      PREVIEW_EPISODE_COUNT episodes of any topic. Episode 3 onwards is locked.
 *
 * Rule 4 is a deliberate departure from the original spec, where a trial meant
 * unlimited access for seven days. The product decision is that a trial should
 * let a prospect sample every topic rather than finish one.
 */
export async function canAccessEpisode(
  userId: string,
  topicId: string,
  episode: { id: string; sortOrder: number; isPreview?: boolean | null },
  opts: { entitlements?: Entitlements } = {},
): Promise<AccessDecision> {
  const ent = opts.entitlements ?? (await getEntitlements(userId));

  if (ent.tier === "full") return { allowed: true, reason: "full_access" };
  if (ent.purchasedTopicIds.includes(topicId)) {
    return { allowed: true, reason: "purchased" };
  }

  const free = await freeTopicIds();
  if (free.includes(topicId)) return { allowed: true, reason: "free_topic" };

  if (episode.isPreview) return { allowed: true, reason: "preview_episode" };

  const position = await episodePosition(topicId, episode.id, episode.sortOrder);
  if (position !== null && position <= config.limits.previewEpisodeCount) {
    return { allowed: true, reason: "preview_episode" };
  }

  return { allowed: false, reason: "entitlement_required" };
}

/**
 * 1-based position of a episode within its topic, computed from the database
 * rather than trusting `sortOrder` - gaps and duplicates in sort_order would
 * otherwise silently widen the preview window.
 */
export async function episodePosition(
  topicId: string,
  episodeId: string,
  fallbackSortOrder?: number,
): Promise<number | null> {
  const rows = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.topicId, topicId))
    .orderBy(asc(episodes.sortOrder), asc(episodes.createdAt));

  const index = rows.findIndex((r) => r.id === episodeId);
  if (index >= 0) return index + 1;
  return typeof fallbackSortOrder === "number" ? fallbackSortOrder : null;
}

/**
 * How many episodes of this topic the caller may watch, for rendering locks in
 * the episode list without asking per episode.
 */
export async function unlockedEpisodeCount(
  userId: string,
  topicId: string,
  opts: { entitlements?: Entitlements } = {},
): Promise<{ unlocked: number | "all"; previewLimit: number }> {
  const ent = opts.entitlements ?? (await getEntitlements(userId));
  const previewLimit = config.limits.previewEpisodeCount;

  if (ent.tier === "full" || ent.purchasedTopicIds.includes(topicId)) {
    return { unlocked: "all", previewLimit };
  }
  const free = await freeTopicIds();
  if (free.includes(topicId)) return { unlocked: "all", previewLimit };

  return { unlocked: previewLimit, previewLimit };
}

/** Public shape returned by GET /api/v1/me. */
export function serialiseEntitlements(ent: Entitlements) {
  return {
    tier: ent.tier,
    reason: ent.reason,
    unlimited_videos: ent.unlimitedVideos,
    certificates: ent.certificates,
    leaderboards: ent.leaderboards,
    streaks: ent.streaks,
    trial_ends_at: ent.trialEndsAt?.toISOString() ?? null,
    preview_episode_count: ent.tier === "full" ? null : config.limits.previewEpisodeCount,
  };
}

/** Count of active members used for seat enforcement on org licences. */
export async function seatsInUse(orgId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.orgId, orgId), or(isNull(users.deletedAt), sql`false`)));
  return row?.count ?? 0;
}
