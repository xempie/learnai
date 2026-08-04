import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, organizations, userCategories, users } from "@/db/schema";
import { ApiError, clientIp, handler, noContent, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { destroySession, requireAuth } from "@/lib/auth/session";
import { getEntitlements, serialiseEntitlements } from "@/lib/entitlements";
import { assertAllowedAgeRange, profileUpdateSchema } from "@/lib/schemas/auth";
import { cohortCount } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The single profile payload the app boots from. Cohort numbers come from
 * `cohortCount()` so the suppression threshold is applied in exactly one place.
 */
async function profilePayload(userId: string) {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row || row.deletedAt) throw new ApiError("NOT_FOUND", "Account not found.");

  const picks = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      color_hex: categories.colorHex,
      rank: userCategories.rank,
    })
    .from(userCategories)
    .innerJoin(categories, eq(categories.id, userCategories.categoryId))
    .where(eq(userCategories.userId, userId))
    .orderBy(asc(userCategories.rank));

  let organization: {
    id: string;
    name: string;
    type: string;
    member_count: number | null;
    suppressed: boolean;
    is_visible: boolean;
    is_founding_member: boolean;
  } | null = null;

  if (row.orgId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, row.orgId),
      columns: { id: true, name: true, type: true },
    });
    if (org) {
      const count = await cohortCount(row.orgId);
      organization = {
        id: org.id,
        name: org.name,
        type: org.type,
        member_count: count.displayCount,
        suppressed: count.suppressed,
        is_visible: row.orgVisible,
        is_founding_member: row.isFoundingMember,
      };
    }
  }

  const entitlements = serialiseEntitlements(await getEntitlements(userId));

  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatar_key: row.avatarKey,
    role: row.role,
    onboarded: Boolean(row.onboardedAt),
    email_verified: row.emailVerified,
    age_range: row.ageRange,
    persona: row.persona,
    skill_level: row.skillLevel,
    locale: row.locale,
    timezone: row.timezone,
    created_at: row.createdAt.toISOString(),
    organization,
    subscription: entitlements,
    entitlements,
    categories: picks,
  };
}

function assertTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return tz;
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Choose a valid time zone.", {
      timezone: "Choose a valid IANA time zone, e.g. Australia/Sydney.",
    });
  }
}

/** GET /api/v1/me */
export const GET = handler(async () => {
  const session = await requireAuth();
  return ok(await profilePayload(session.id));
});

/** PATCH /api/v1/me */
export const PATCH = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = await parseBody(req, profileUpdateSchema);

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (body.nickname !== undefined) {
    const nickname = body.nickname.trim();
    // Nicknames are unique within a cohort, not globally - two people at
    // different organisations may both be "Sam".
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          sql`lower(${users.nickname}) = lower(${nickname})`,
          ne(users.id, session.id),
          isNull(users.deletedAt),
          session.orgId ? eq(users.orgId, session.orgId) : isNull(users.orgId),
        ),
      )
      .limit(1);
    if (clash.length > 0) {
      throw new ApiError("CONFLICT", "That nickname is taken in your organisation.");
    }
    patch.nickname = nickname;
  }

  if (body.avatarKey !== undefined) patch.avatarKey = body.avatarKey;
  if (body.ageRange !== undefined) patch.ageRange = assertAllowedAgeRange(body.ageRange);
  if (body.timezone !== undefined) patch.timezone = assertTimezone(body.timezone);
  if (body.persona !== undefined) patch.persona = body.persona;
  if (body.skillLevel !== undefined) patch.skillLevel = body.skillLevel;

  await db.update(users).set(patch).where(eq(users.id, session.id));

  await audit({
    actorId: session.id,
    action: "user.profile_updated",
    entityType: "user",
    entityId: session.id,
    metadata: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    ipAddress: clientIp(req),
  });

  return ok(await profilePayload(session.id));
});

/**
 * DELETE /api/v1/me
 *
 * Soft delete + anonymisation (TECHNICAL_SPEC §9.6). The row survives so
 * enrolment and audit history stay referentially intact, but nothing on it
 * identifies a person and the account can never be resolved again.
 */
export const DELETE = handler(async (req: Request) => {
  const session = await requireAuth();
  const now = new Date();

  await db
    .update(users)
    .set({
      deletedAt: now,
      email: `deleted+${session.id}@removed.invalid`,
      emailDomain: "removed.invalid",
      nickname: "deleted-user",
      realName: null,
      avatarKey: null,
      persona: null,
      // Leaving the cohort is part of deletion, not a separate opt-out.
      orgVisible: false,
      isSuspended: false,
      updatedAt: now,
    })
    .where(eq(users.id, session.id));

  await audit({
    actorId: session.id,
    action: "user.deleted",
    entityType: "user",
    entityId: session.id,
    ipAddress: clientIp(req),
  });

  await destroySession();

  return noContent();
});
