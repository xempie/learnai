import "server-only";

import { type SQL, and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  comments,
  topicCategories,
  topics,
  notificationPreferences,
  notifications,
  userCategories,
  users,
} from "@/db/schema";
import { config } from "@/lib/config";
import { contentPath } from "@/lib/schemas/engagement";

/**
 * Notification fan-out (V1_BUILD_SPEC §5.2).
 *
 * Three rules are enforced here and nowhere else, so there is exactly one place
 * to audit them:
 *   1. Nobody is ever notified about their own action.
 *   2. `notification_preferences` is respected; a missing row means "all on"
 *      (the column defaults are true), so a user who never touched settings
 *      still gets notified.
 *   3. `new_content` is capped per user per day - the daily digest cap is the
 *      difference between a useful feed and an uninstall.
 *
 * Everything is batch-inserted. `notifyNewContent` deliberately takes only a
 * topic id and reads what it needs, so a future SQS fan-out Lambda can call it
 * unchanged with nothing but the message payload.
 */

export type NotificationType =
  | "new_content"
  | "comment_reply"
  | "comment_on_own"
  | "cohort_milestone"
  | "system";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  topicId?: string | null;
  /** Whoever caused this. Never notified about their own action. */
  actorId?: string | null;
}

interface NotificationInsert {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkUrl: string | null;
  topicId: string | null;
  actorId: string | null;
}

/** Which preference toggle governs which notification type. */
function prefColumn(type: NotificationType): PgColumn | null {
  switch (type) {
    case "new_content":
      return notificationPreferences.newContent;
    case "comment_reply":
    case "comment_on_own":
      return notificationPreferences.commentReplies;
    case "cohort_milestone":
      return notificationPreferences.cohortMilestones;
    case "system":
      // Service messages are not opt-outable.
      return null;
  }
}

/** Rows written since midnight UTC count against the daily cap. */
function startOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const INSERT_CHUNK = 500;

async function insertBatch(rows: NotificationInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    await db.insert(notifications).values(chunk);
    written += chunk.length;
  }
  return written;
}

/**
 * Filters candidate recipients down to those who are (a) active, (b) opted in
 * for this type and (c) under the daily cap where one applies.
 *
 * One query for preferences, one for the cap - never one per user.
 */
async function eligibleRecipients(
  candidateIds: string[],
  type: NotificationType,
): Promise<string[]> {
  if (candidateIds.length === 0) return [];

  const pref = prefColumn(type);
  const conditions: SQL[] = [
    inArray(users.id, candidateIds),
    eq(users.isSuspended, false),
    isNull(users.deletedAt),
  ];
  if (pref) {
    // A missing preferences row means every toggle is at its default (true).
    conditions.push(or(isNull(notificationPreferences.userId), eq(pref, true))!);
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(and(...conditions));

  let allowed = rows.map((r) => r.id);
  if (allowed.length === 0) return [];

  if (type === "new_content") {
    allowed = await underDailyCap(allowed, config.limits.maxNewContentNotificationsPerDay);
  }
  return allowed;
}

/** Drops anyone who already hit today's `new_content` allowance. */
async function underDailyCap(userIds: string[], cap: number): Promise<string[]> {
  if (cap <= 0) return [];

  const counts = await db
    .select({ userId: notifications.userId, n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        inArray(notifications.userId, userIds),
        eq(notifications.type, "new_content"),
        gte(notifications.createdAt, startOfDayUtc()),
      ),
    )
    .groupBy(notifications.userId);

  const used = new Map(counts.map((c) => [c.userId, c.n]));
  return userIds.filter((id) => (used.get(id) ?? 0) < cap);
}

function toRow(userId: string, input: NotifyInput): NotificationInsert {
  return {
    userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    linkUrl: input.linkUrl ?? null,
    topicId: input.topicId ?? null,
    actorId: input.actorId ?? null,
  };
}

/**
 * Notify one user. Returns true when a row was actually written - false means
 * it was suppressed (self-notification, opted out, or over the daily cap).
 *
 * Never throws: a failed notification must not fail the action that caused it.
 */
export async function notify(userId: string, input: NotifyInput): Promise<boolean> {
  const written = await notifyMany([userId], input);
  return written > 0;
}

/**
 * Notify many users with the same payload. Deduplicates, drops the actor, and
 * writes in one insert. Returns the number of rows written.
 */
export async function notifyMany(userIds: string[], input: NotifyInput): Promise<number> {
  try {
    const unique = [...new Set(userIds.filter((id) => id && id !== input.actorId))];
    if (unique.length === 0) return 0;

    const recipients = await eligibleRecipients(unique, input.type);
    return await insertBatch(recipients.map((id) => toRow(id, input)));
  } catch (err) {
    console.error("[notifications] fan-out failed", { type: input.type, err });
    return 0;
  }
}

/**
 * "New content in a category you follow."
 *
 * Takes only the topic id so the whole function is a valid SQS message
 * handler: publish the topic, enqueue `{ topicId }`, let a Lambda call this.
 */
export async function notifyNewContent(topicId: string): Promise<number> {
  try {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
      columns: {
        id: true,
        type: true,
        slug: true,
        title: true,
        status: true,
        authorId: true,
        ownerId: true,
        deletedAt: true,
      },
    });
    if (!topic || topic.status !== "published" || topic.deletedAt) return 0;

    // Everyone who follows at least one of this topic's categories.
    const candidates = await db
      .selectDistinct({ id: userCategories.userId })
      .from(userCategories)
      .innerJoin(topicCategories, eq(topicCategories.categoryId, userCategories.categoryId))
      .where(eq(topicCategories.topicId, topicId));

    const author = topic.authorId ?? topic.ownerId ?? null;
    const ids = candidates.map((c) => c.id).filter((id) => id !== author);
    if (ids.length === 0) return 0;

    const recipients = await eligibleRecipients(ids, "new_content");
    const input: NotifyInput = {
      type: "new_content",
      title: topic.type === "article" ? "New article for you" : "New topic for you",
      body: topic.title,
      linkUrl: contentPath(topic.type, topic.slug),
      topicId: topic.id,
      actorId: author,
    };
    return await insertBatch(recipients.map((id) => toRow(id, input)));
  } catch (err) {
    console.error("[notifications] notifyNewContent failed", { topicId, err });
    return 0;
  }
}

/** Cohort sizes worth celebrating. */
export const COHORT_MILESTONES = [5, 10, 25, 50] as const;

/**
 * Fires once as an organisation crosses 5 / 10 / 25 / 50 members. Any other
 * count is a no-op, so the caller can hand it every join event.
 */
export async function notifyCohortMilestone(
  orgId: string,
  memberCount: number,
): Promise<number> {
  try {
    if (!COHORT_MILESTONES.includes(memberCount as (typeof COHORT_MILESTONES)[number])) {
      return 0;
    }

    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.isSuspended, false), isNull(users.deletedAt)));

    const ids = members.map((m) => m.id);
    if (ids.length === 0) return 0;

    const recipients = await eligibleRecipients(ids, "cohort_milestone");
    const input: NotifyInput = {
      type: "cohort_milestone",
      title: `Your team just reached ${memberCount} learners`,
      body: "See who is learning alongside you.",
      linkUrl: "/org",
    };
    return await insertBatch(recipients.map((id) => toRow(id, input)));
  } catch (err) {
    console.error("[notifications] notifyCohortMilestone failed", { orgId, err });
    return 0;
  }
}

/**
 * Comment fan-out: everyone who already commented on this topic, plus the
 * author of the topic itself. Two payloads, both excluding the actor.
 */
export async function notifyCommentPosted(opts: {
  topicId: string;
  actorId: string;
  actorNickname: string;
  topicTitle: string;
  topicType: string;
  topicSlug: string;
  topicAuthorId: string | null;
  /** Distinct prior commenters, actor already excluded by the caller or here. */
  priorCommenterIds: string[];
}): Promise<{ replies: number; onOwn: number }> {
  const link = contentPath(opts.topicType, opts.topicSlug);

  const replyTargets = opts.priorCommenterIds.filter(
    (id) => id !== opts.actorId && id !== opts.topicAuthorId,
  );

  const replies = await notifyMany(replyTargets, {
    type: "comment_reply",
    title: `${opts.actorNickname} commented on a thread you're in`,
    body: opts.topicTitle,
    linkUrl: link,
    topicId: opts.topicId,
    actorId: opts.actorId,
  });

  let onOwn = 0;
  if (opts.topicAuthorId && opts.topicAuthorId !== opts.actorId) {
    onOwn = await notifyMany([opts.topicAuthorId], {
      type: "comment_on_own",
      title: `${opts.actorNickname} commented on your ${
        opts.topicType === "article" ? "article" : "topic"
      }`,
      body: opts.topicTitle,
      linkUrl: link,
      topicId: opts.topicId,
      actorId: opts.actorId,
    });
  }

  return { replies, onOwn };
}

/** Unread badge count for the caller. */
export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Reads the caller's preferences, materialising defaults when no row exists. */
export async function getPreferences(userId: string) {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, userId),
  });
  return {
    newContent: row?.newContent ?? true,
    commentReplies: row?.commentReplies ?? true,
    cohortMilestones: row?.cohortMilestones ?? true,
  };
}

/** Upserts the caller's preferences; unspecified toggles keep their value. */
export async function setPreferences(
  userId: string,
  patch: { newContent?: boolean; commentReplies?: boolean; cohortMilestones?: boolean },
) {
  const current = await getPreferences(userId);
  const next = {
    newContent: patch.newContent ?? current.newContent,
    commentReplies: patch.commentReplies ?? current.commentReplies,
    cohortMilestones: patch.cohortMilestones ?? current.cohortMilestones,
  };

  await db
    .insert(notificationPreferences)
    .values({ userId, ...next })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...next, updatedAt: new Date() },
    });

  return next;
}

/** Distinct prior commenters on a topic, excluding one user. */
export async function priorCommenterIds(
  topicId: string,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: comments.userId })
    .from(comments)
    .where(
      and(
        eq(comments.topicId, topicId),
        eq(comments.status, "visible"),
        ne(comments.userId, excludeUserId),
      ),
    )
    .limit(500);
  return rows.map((r) => r.id);
}
