import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  comments,
  topics,
  enrollments,
  notificationPreferences,
  quizAttempts,
  quizzes,
  userCategories,
  userStreaks,
  users,
} from "@/db/schema";
import { ApiError, clientIp, handler, ok, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me/export
 *
 * Data portability (TECHNICAL_SPEC §9.6): everything we hold that the person
 * created or that describes them, as one machine-readable file. Deliberately
 * scoped to `session.id` on every query - an export is the worst place for an
 * off-by-one on ownership.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireAuth();
  rateLimit(`export:${session.id}`, 3, 60_000);

  const profile = await db.query.users.findFirst({ where: eq(users.id, session.id) });
  if (!profile) throw new ApiError("NOT_FOUND", "Account not found.");

  const picks = await db
    .select({
      slug: categories.slug,
      name: categories.name,
      rank: userCategories.rank,
    })
    .from(userCategories)
    .innerJoin(categories, eq(categories.id, userCategories.categoryId))
    .where(eq(userCategories.userId, session.id))
    .orderBy(asc(userCategories.rank));

  const enrolments = await db
    .select({
      topic_slug: topics.slug,
      topic_title: topics.title,
      source: enrollments.source,
      progress_pct: enrollments.progressPct,
      completed_at: enrollments.completedAt,
      created_at: enrollments.createdAt,
    })
    .from(enrollments)
    .innerJoin(topics, eq(topics.id, enrollments.topicId))
    .where(eq(enrollments.userId, session.id))
    .orderBy(desc(enrollments.createdAt));

  const myComments = await db
    .select({
      topic_slug: topics.slug,
      body: comments.body,
      status: comments.status,
      created_at: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .where(eq(comments.userId, session.id))
    .orderBy(desc(comments.createdAt));

  const attempts = await db
    .select({
      quiz_id: quizAttempts.quizId,
      topic_id: quizzes.topicId,
      episode_id: quizzes.episodeId,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
      attempt_no: quizAttempts.attemptNo,
      created_at: quizAttempts.createdAt,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(eq(quizAttempts.userId, session.id))
    .orderBy(desc(quizAttempts.createdAt));

  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, session.id),
  });
  const streak = await db.query.userStreaks.findFirst({
    where: eq(userStreaks.userId, session.id),
  });

  const archive = {
    exported_at: new Date().toISOString(),
    format_version: 1,
    profile: {
      id: profile.id,
      email: profile.email,
      nickname: profile.nickname,
      avatar_key: profile.avatarKey,
      age_range: profile.ageRange,
      role: profile.role,
      persona: profile.persona,
      skill_level: profile.skillLevel,
      locale: profile.locale,
      timezone: profile.timezone,
      org_id: profile.orgId,
      org_visible: profile.orgVisible,
      is_founding_member: profile.isFoundingMember,
      terms_accepted_at: profile.termsAcceptedAt,
      trial_ends_at: profile.trialEndsAt,
      onboarded_at: profile.onboardedAt,
      created_at: profile.createdAt,
    },
    categories: picks,
    enrollments: enrolments,
    comments: myComments,
    quiz_attempts: attempts,
    notification_preferences: prefs
      ? {
          new_content: prefs.newContent,
          comment_replies: prefs.commentReplies,
          cohort_milestones: prefs.cohortMilestones,
        }
      : null,
    streak: streak
      ? {
          current_streak: streak.currentStreak,
          longest_streak: streak.longestStreak,
          last_activity_date: streak.lastActivityDate,
        }
      : null,
  };

  await audit({
    actorId: session.id,
    action: "user.data_exported",
    entityType: "user",
    entityId: session.id,
    ipAddress: clientIp(req),
  });

  const res = ok(archive);
  const stamp = new Date().toISOString().slice(0, 10);
  res.headers.set("Content-Disposition", `attachment; filename="acadu-export-${stamp}.json"`);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
