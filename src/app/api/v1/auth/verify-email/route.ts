import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  authCredentials,
  notificationPreferences,
  organizations,
  userStreaks,
  users,
} from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { providerConfirmSignUp } from "@/lib/auth/provider";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { matchOrganisation, normaliseEmail } from "@/lib/domain-matching";
import { verifyEmailSchema } from "@/lib/schemas/auth";
import { cohortCount } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/verify-email
 *
 * The only place domain matching runs (TECHNICAL_SPEC §7.1). Confirming the code
 * proves the person controls the address, which is what makes it safe to place
 * them in that address's cohort.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, verifyEmailSchema);
  const email = normaliseEmail(body.email);

  // Same message for "no such account" and "wrong code" - no enumeration.
  const badCode = new ApiError("BAD_REQUEST", "That code is incorrect or has expired.");

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.deletedAt) throw badCode;
  if (user.isSuspended) throw new ApiError("FORBIDDEN", "This account is suspended.");

  if (!user.emailVerified) {
    if (config.devAuth) {
      const creds = await db.query.authCredentials.findFirst({
        where: eq(authCredentials.userId, user.id),
      });
      if (!creds?.verificationCode || creds.verificationCode !== body.code) throw badCode;
      if (creds.verificationExpiresAt && creds.verificationExpiresAt.getTime() <= Date.now()) {
        throw badCode;
      }
      await db
        .update(authCredentials)
        .set({ verificationCode: null, verificationExpiresAt: null, updatedAt: new Date() })
        .where(eq(authCredentials.userId, user.id));
    } else {
      await providerConfirmSignUp(email, body.code);
    }
  }

  // --- post-verification: cohort placement + first-run rows ---
  const match = user.emailVerified
    ? { orgId: user.orgId, isFoundingMember: user.isFoundingMember, reason: "already_verified" }
    : await matchOrganisation(email);

  const trialEndsAt =
    user.trialEndsAt ?? new Date(Date.now() + config.limits.trialDays * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(users)
    .set({
      emailVerified: true,
      orgId: match.orgId,
      isFoundingMember: match.isFoundingMember,
      trialEndsAt,
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  await db
    .insert(notificationPreferences)
    .values({ userId: user.id })
    .onConflictDoNothing();

  await db
    .insert(userStreaks)
    .values({ userId: user.id, timezone: user.timezone })
    .onConflictDoNothing();

  await audit({
    actorId: user.id,
    action: "user.email_verified",
    entityType: "user",
    entityId: user.id,
    metadata: { orgId: match.orgId, matchReason: match.reason },
    ipAddress: clientIp(req),
  });

  await createSession({ sub: user.cognitoSub, email: user.email });

  const row = updated ?? user;
  let organization: Record<string, unknown> | null = null;

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

  return ok({
    user: {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      avatar_key: row.avatarKey,
      role: row.role,
      onboarded: Boolean(row.onboardedAt),
      email_verified: true,
    },
    organization,
  });
});
